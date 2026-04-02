-- Note Goat cloud sync + auth access controls.
-- Run this in Supabase SQL Editor.

create table if not exists public.app_snapshots (
  workspace_id text primary key,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_snapshots enable row level security;

revoke all on table public.app_snapshots from anon;
revoke all on table public.app_snapshots from authenticated;
grant select, insert, update on table public.app_snapshots to authenticated;

-- Workspace id format is: <auth_user_id>:<office_id>
-- Example: 16ec...:main-office
-- Each signed-in user can only access their own workspace rows.
drop policy if exists "app_snapshots_select_owner" on public.app_snapshots;
create policy "app_snapshots_select_owner"
on public.app_snapshots
for select
to authenticated
using (split_part(workspace_id, ':', 1) = auth.uid()::text);

drop policy if exists "app_snapshots_insert_owner" on public.app_snapshots;
create policy "app_snapshots_insert_owner"
on public.app_snapshots
for insert
to authenticated
with check (split_part(workspace_id, ':', 1) = auth.uid()::text);

drop policy if exists "app_snapshots_update_owner" on public.app_snapshots;
create policy "app_snapshots_update_owner"
on public.app_snapshots
for update
to authenticated
using (split_part(workspace_id, ':', 1) = auth.uid()::text)
with check (split_part(workspace_id, ':', 1) = auth.uid()::text);

create table if not exists public.account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected', 'suspended')),
  is_admin boolean not null default false,
  plan_tier text not null default 'complete',
  stripe_customer_id text,
  stripe_subscription_status text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid
);

alter table public.account_profiles enable row level security;

grant select, update on table public.account_profiles to authenticated;

-- Users can read only their own account profile.
drop policy if exists "account_profiles_select_self" on public.account_profiles;
create policy "account_profiles_select_self"
on public.account_profiles
for select
to authenticated
using (user_id = auth.uid());

-- Admins can read all account profiles.
drop policy if exists "admins_select_all" on public.account_profiles;
create policy "admins_select_all"
on public.account_profiles
for select
to authenticated
using (
  exists (
    select 1 from public.account_profiles ap
    where ap.user_id = auth.uid() and ap.is_admin = true
  )
);

-- Admins can update account profiles (approve/reject/suspend, set plan tier).
drop policy if exists "admins_update_all" on public.account_profiles;
create policy "admins_update_all"
on public.account_profiles
for update
to authenticated
using (
  exists (
    select 1 from public.account_profiles ap
    where ap.user_id = auth.uid() and ap.is_admin = true
  )
)
with check (
  exists (
    select 1 from public.account_profiles ap
    where ap.user_id = auth.uid() and ap.is_admin = true
  )
);

-- Keep existing auth users in sync (safe to run repeatedly).
insert into public.account_profiles (user_id, email)
select id, coalesce(email, '')
from auth.users
on conflict (user_id)
do update set email = excluded.email;

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.account_profiles (user_id, email, approval_status)
  values (new.id, coalesce(new.email, ''), 'pending')
  on conflict (user_id)
  do update set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.handle_new_auth_user_profile();
