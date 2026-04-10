-- Phases 4-8: generic key-value store for all remaining entities.
-- Instead of 25 individual tables, one kv table handles every config,
-- settings blob, and small entity map.
--
-- Key = the casemate.* localStorage key (e.g. "casemate.tasks.v1")
-- Value = the full JSON payload stored under that key.

create table if not exists public.workspace_kv (
  workspace_id text not null,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, key)
);

create index if not exists workspace_kv_workspace_idx
  on public.workspace_kv(workspace_id);

alter table public.workspace_kv enable row level security;

revoke all on table public.workspace_kv from anon;
revoke all on table public.workspace_kv from authenticated;
grant select, insert, update, delete on table public.workspace_kv to authenticated;

drop policy if exists "workspace_kv_select_owner" on public.workspace_kv;
create policy "workspace_kv_select_owner"
on public.workspace_kv for select to authenticated
using (split_part(workspace_id, ':', 1) = auth.uid()::text);

drop policy if exists "workspace_kv_insert_owner" on public.workspace_kv;
create policy "workspace_kv_insert_owner"
on public.workspace_kv for insert to authenticated
with check (split_part(workspace_id, ':', 1) = auth.uid()::text);

drop policy if exists "workspace_kv_update_owner" on public.workspace_kv;
create policy "workspace_kv_update_owner"
on public.workspace_kv for update to authenticated
using (split_part(workspace_id, ':', 1) = auth.uid()::text)
with check (split_part(workspace_id, ':', 1) = auth.uid()::text);

drop policy if exists "workspace_kv_delete_owner" on public.workspace_kv;
create policy "workspace_kv_delete_owner"
on public.workspace_kv for delete to authenticated
using (split_part(workspace_id, ':', 1) = auth.uid()::text);

create or replace function public.workspace_kv_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_kv_set_updated_at_trg on public.workspace_kv;
create trigger workspace_kv_set_updated_at_trg
before update on public.workspace_kv
for each row execute procedure public.workspace_kv_set_updated_at();
