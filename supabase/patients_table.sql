-- Phase 1 of cloud-as-truth migration: patients table.
-- Run this in Supabase SQL Editor BEFORE flipping the `patients` feature flag.
--
-- Workspace id format is: <auth_user_id>:<office_id>
-- Example: 16ec...:main-office
-- RLS policy ensures the auth.uid() owns the workspace_id prefix, mirroring
-- the existing app_snapshots policy. Each user can only see their own rows.

create table if not exists public.patients (
  id text not null,
  workspace_id text not null,
  full_name text not null default '',
  dob text not null default '',
  sex text,
  marital_status text,
  phone text not null default '',
  email text,
  address text,
  attorney text not null default '',
  case_status text not null default 'Active',
  date_of_loss text not null default '',
  last_update text not null default '',
  priority text not null default 'Normal',
  matrix jsonb,
  related_cases jsonb,
  xray_referrals jsonb,
  mri_referrals jsonb,
  specialist_referrals jsonb,
  alerts jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists patients_workspace_idx
  on public.patients(workspace_id);

create index if not exists patients_workspace_updated_idx
  on public.patients(workspace_id, updated_at desc);

alter table public.patients enable row level security;

revoke all on table public.patients from anon;
revoke all on table public.patients from authenticated;
grant select, insert, update, delete on table public.patients to authenticated;

drop policy if exists "patients_select_owner" on public.patients;
create policy "patients_select_owner"
on public.patients
for select
to authenticated
using (split_part(workspace_id, ':', 1) = auth.uid()::text);

drop policy if exists "patients_insert_owner" on public.patients;
create policy "patients_insert_owner"
on public.patients
for insert
to authenticated
with check (split_part(workspace_id, ':', 1) = auth.uid()::text);

drop policy if exists "patients_update_owner" on public.patients;
create policy "patients_update_owner"
on public.patients
for update
to authenticated
using (split_part(workspace_id, ':', 1) = auth.uid()::text)
with check (split_part(workspace_id, ':', 1) = auth.uid()::text);

drop policy if exists "patients_delete_owner" on public.patients;
create policy "patients_delete_owner"
on public.patients
for delete
to authenticated
using (split_part(workspace_id, ':', 1) = auth.uid()::text);

-- Auto-bump updated_at on every UPDATE so freshness compares are reliable.
create or replace function public.patients_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists patients_set_updated_at_trg on public.patients;
create trigger patients_set_updated_at_trg
before update on public.patients
for each row execute procedure public.patients_set_updated_at();
