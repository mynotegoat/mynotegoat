-- Quick cloud persistence table for Note Goat prototype.
-- This keeps your existing localStorage-based app working while syncing to Supabase.
-- Run in Supabase SQL Editor.

create table if not exists public.app_snapshots (
  workspace_id text primary key,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_snapshots enable row level security;

grant usage on schema public to anon;
grant select, insert, update on table public.app_snapshots to anon;

drop policy if exists "app_snapshots_select_anon" on public.app_snapshots;
create policy "app_snapshots_select_anon"
on public.app_snapshots
for select
to anon
using (true);

drop policy if exists "app_snapshots_insert_anon" on public.app_snapshots;
create policy "app_snapshots_insert_anon"
on public.app_snapshots
for insert
to anon
with check (true);

drop policy if exists "app_snapshots_update_anon" on public.app_snapshots;
create policy "app_snapshots_update_anon"
on public.app_snapshots
for update
to anon
using (true)
with check (true);
