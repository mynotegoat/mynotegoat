-- Phase 2 of cloud-as-truth migration: schedule_appointments table.
-- Run this in Supabase SQL Editor BEFORE flipping the flag.

create table if not exists public.schedule_appointments (
  id text not null,
  workspace_id text not null,
  patient_id text not null default '',
  patient_name text not null default '',
  provider text not null default '',
  location text not null default '',
  appointment_type text not null default '',
  case_label text not null default '',
  room text not null default '',
  date text not null default '',
  start_time text not null default '08:00',
  duration_min integer not null default 30,
  status text not null default 'Scheduled',
  note text not null default '',
  override_office_hours boolean not null default false,
  recurring_series_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists sched_appts_workspace_idx
  on public.schedule_appointments(workspace_id);

create index if not exists sched_appts_workspace_date_idx
  on public.schedule_appointments(workspace_id, date);

alter table public.schedule_appointments enable row level security;

revoke all on table public.schedule_appointments from anon;
revoke all on table public.schedule_appointments from authenticated;
grant select, insert, update, delete on table public.schedule_appointments to authenticated;

drop policy if exists "sched_appts_select_owner" on public.schedule_appointments;
create policy "sched_appts_select_owner"
on public.schedule_appointments
for select
to authenticated
using (split_part(workspace_id, ':', 1) = auth.uid()::text);

drop policy if exists "sched_appts_insert_owner" on public.schedule_appointments;
create policy "sched_appts_insert_owner"
on public.schedule_appointments
for insert
to authenticated
with check (split_part(workspace_id, ':', 1) = auth.uid()::text);

drop policy if exists "sched_appts_update_owner" on public.schedule_appointments;
create policy "sched_appts_update_owner"
on public.schedule_appointments
for update
to authenticated
using (split_part(workspace_id, ':', 1) = auth.uid()::text)
with check (split_part(workspace_id, ':', 1) = auth.uid()::text);

drop policy if exists "sched_appts_delete_owner" on public.schedule_appointments;
create policy "sched_appts_delete_owner"
on public.schedule_appointments
for delete
to authenticated
using (split_part(workspace_id, ':', 1) = auth.uid()::text);

create or replace function public.sched_appts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sched_appts_set_updated_at_trg on public.schedule_appointments;
create trigger sched_appts_set_updated_at_trg
before update on public.schedule_appointments
for each row execute procedure public.sched_appts_set_updated_at();
