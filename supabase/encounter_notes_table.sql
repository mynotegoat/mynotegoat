-- Phase 3: encounter_notes table.
-- Run in Supabase SQL Editor BEFORE flipping the flag.

create table if not exists public.encounter_notes (
  id text not null,
  workspace_id text not null,
  patient_id text not null default '',
  patient_name text not null default '',
  provider text not null default '',
  appointment_type text not null default '',
  encounter_date text not null default '',
  start_time text not null default '',
  soap jsonb not null default '{"subjective":"","objective":"","assessment":"","plan":""}'::jsonb,
  macro_runs jsonb not null default '[]'::jsonb,
  diagnoses jsonb not null default '[]'::jsonb,
  charges jsonb not null default '[]'::jsonb,
  signed boolean not null default false,
  signed_at text not null default '',
  created_at_record text not null default '',
  updated_at_record text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists enc_notes_workspace_idx
  on public.encounter_notes(workspace_id);

create index if not exists enc_notes_workspace_patient_idx
  on public.encounter_notes(workspace_id, patient_id);

alter table public.encounter_notes enable row level security;

revoke all on table public.encounter_notes from anon;
revoke all on table public.encounter_notes from authenticated;
grant select, insert, update, delete on table public.encounter_notes to authenticated;

drop policy if exists "enc_notes_select_owner" on public.encounter_notes;
create policy "enc_notes_select_owner"
on public.encounter_notes for select to authenticated
using (split_part(workspace_id, ':', 1) = auth.uid()::text);

drop policy if exists "enc_notes_insert_owner" on public.encounter_notes;
create policy "enc_notes_insert_owner"
on public.encounter_notes for insert to authenticated
with check (split_part(workspace_id, ':', 1) = auth.uid()::text);

drop policy if exists "enc_notes_update_owner" on public.encounter_notes;
create policy "enc_notes_update_owner"
on public.encounter_notes for update to authenticated
using (split_part(workspace_id, ':', 1) = auth.uid()::text)
with check (split_part(workspace_id, ':', 1) = auth.uid()::text);

drop policy if exists "enc_notes_delete_owner" on public.encounter_notes;
create policy "enc_notes_delete_owner"
on public.encounter_notes for delete to authenticated
using (split_part(workspace_id, ':', 1) = auth.uid()::text);

create or replace function public.enc_notes_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists enc_notes_set_updated_at_trg on public.encounter_notes;
create trigger enc_notes_set_updated_at_trg
before update on public.encounter_notes
for each row execute procedure public.enc_notes_set_updated_at();
