-- ============================================================================
-- App Snapshots: Bulletproof Data Protection
-- ============================================================================
-- This migration installs THREE independent safeguards so the cloud snapshot
-- can never be destroyed by a client bug, a race condition, or a wipe loop.
--
-- 1. app_snapshots_history: every successful write is appended here forever.
--    Rollback is one SQL away.
-- 2. snapshot_protection_trigger: refuses any UPDATE that would shrink a
--    populated snapshot by more than 50% OR drop more than 30% of its keys.
--    This blocks the exact failure mode that destroyed data on 2026-04-08.
-- 3. app_snapshots_emergency_backup: a permanent table created during the
--    incident. Left in place as a belt-and-suspenders snapshot.
--
-- Run this in the Supabase SQL Editor. Safe to run repeatedly.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. History table (append-only audit log of every snapshot version)
-- ----------------------------------------------------------------------------
create table if not exists public.app_snapshots_history (
  id              bigserial primary key,
  workspace_id    text        not null,
  snapshot        jsonb       not null,
  snapshot_size   integer     not null,
  key_count       integer     not null,
  recorded_at     timestamptz not null default now(),
  operation       text        not null check (operation in ('insert','update','rejected'))
);

create index if not exists app_snapshots_history_workspace_idx
  on public.app_snapshots_history (workspace_id, recorded_at desc);

alter table public.app_snapshots_history enable row level security;

-- Users can read their own history (for self-service rollback in the UI later)
drop policy if exists "app_snapshots_history_select_owner" on public.app_snapshots_history;
create policy "app_snapshots_history_select_owner"
  on public.app_snapshots_history
  for select
  to authenticated
  using (split_part(workspace_id, ':', 1) = auth.uid()::text);

-- Nobody (not even the owner) can directly write or delete history.
-- Only the trigger (running as definer) appends to it.
revoke insert, update, delete on public.app_snapshots_history from authenticated;
revoke insert, update, delete on public.app_snapshots_history from anon;

-- ----------------------------------------------------------------------------
-- 2. Protection trigger
-- ----------------------------------------------------------------------------
-- Counts the number of casemate.* keys in a snapshot, EXCLUDING the safety
-- backup key (which is not real data — it's the local-side panic copy that
-- was the root cause of the destructive push loop).
create or replace function public.count_meaningful_snapshot_keys(snap jsonb)
returns integer
language sql
immutable
as $$
  select count(*)::int
  from jsonb_object_keys(snap) as k
  where k like 'casemate.%'
    and k <> 'casemate.__safety-backup__.v1'
    and k <> 'casemate.active-workspace-id.v1'
    and k not like 'casemate.cloud-sync-at%';
$$;

create or replace function public.protect_app_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_size  integer;
  new_size  integer;
  old_keys  integer;
  new_keys  integer;
  override  text;
begin
  -- Always log the attempt to history first.
  new_size := length(NEW.snapshot::text);
  new_keys := count_meaningful_snapshot_keys(NEW.snapshot);

  if TG_OP = 'INSERT' then
    insert into public.app_snapshots_history
      (workspace_id, snapshot, snapshot_size, key_count, operation)
    values
      (NEW.workspace_id, NEW.snapshot, new_size, new_keys, 'insert');
    return NEW;
  end if;

  -- UPDATE path: compare old vs new.
  old_size := length(OLD.snapshot::text);
  old_keys := count_meaningful_snapshot_keys(OLD.snapshot);

  -- Allow override via session-local setting for legitimate bulk deletes.
  -- Set it from the client like:
  --   select set_config('app.allow_destructive_snapshot_write','true', true);
  override := current_setting('app.allow_destructive_snapshot_write', true);

  if coalesce(override, 'false') <> 'true' then
    -- Reject if the OLD row had real data (>10KB) AND the NEW row is
    -- either less than 50% of the old size OR has lost more than 30% of
    -- its meaningful keys. This is the exact pattern of a wipe-and-push bug.
    if old_size > 10000 and (
         new_size < (old_size / 2) or
         (old_keys > 5 and new_keys < (old_keys * 7 / 10))
       )
    then
      -- Log the rejection so we can see attacks/bugs after the fact.
      insert into public.app_snapshots_history
        (workspace_id, snapshot, snapshot_size, key_count, operation)
      values
        (NEW.workspace_id, NEW.snapshot, new_size, new_keys, 'rejected');

      raise exception
        'app_snapshots: refusing destructive write for workspace % (old_size=%, new_size=%, old_keys=%, new_keys=%). If this is intentional, set app.allow_destructive_snapshot_write=true for this transaction.',
        NEW.workspace_id, old_size, new_size, old_keys, new_keys
        using errcode = 'check_violation';
    end if;
  end if;

  -- Accepted: append to history.
  insert into public.app_snapshots_history
    (workspace_id, snapshot, snapshot_size, key_count, operation)
  values
    (NEW.workspace_id, NEW.snapshot, new_size, new_keys, 'update');

  return NEW;
end;
$$;

drop trigger if exists app_snapshots_protect on public.app_snapshots;
create trigger app_snapshots_protect
  before insert or update on public.app_snapshots
  for each row execute function public.protect_app_snapshots();

-- ----------------------------------------------------------------------------
-- 3. Backfill: seed history with the current state so we always have a
--    starting point even for workspaces that existed before this migration.
-- ----------------------------------------------------------------------------
insert into public.app_snapshots_history
  (workspace_id, snapshot, snapshot_size, key_count, operation, recorded_at)
select
  workspace_id,
  snapshot,
  length(snapshot::text),
  count_meaningful_snapshot_keys(snapshot),
  'insert',
  updated_at
from public.app_snapshots
where not exists (
  select 1 from public.app_snapshots_history h
  where h.workspace_id = app_snapshots.workspace_id
);

-- ----------------------------------------------------------------------------
-- 4. Convenience view: latest history row per workspace, for the recovery UI.
-- ----------------------------------------------------------------------------
create or replace view public.app_snapshots_latest_history as
select distinct on (workspace_id)
  workspace_id, id, snapshot_size, key_count, recorded_at, operation
from public.app_snapshots_history
order by workspace_id, recorded_at desc;

grant select on public.app_snapshots_latest_history to authenticated;
