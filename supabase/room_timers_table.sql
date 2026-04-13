-- Room Timers table for cross-device timer sync.
-- Run in Supabase SQL Editor.

create table if not exists public.room_timers (
  id text not null,
  workspace_id text not null,
  room_id text not null default '',
  room_name text not null default '',
  room_color text not null default '#0d79bf',
  label text not null default '',
  total_seconds integer not null default 0,
  ends_at timestamptz not null default now(),
  paused_remaining integer not null default 0,
  finished boolean not null default false,
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (id)
);

create index if not exists room_timers_workspace_idx
  on public.room_timers(workspace_id);

create index if not exists room_timers_workspace_active_idx
  on public.room_timers(workspace_id, dismissed);

-- RLS: allow authenticated users full access to their own workspace timers
alter table public.room_timers enable row level security;

create policy "Users can manage their own timers"
  on public.room_timers for all
  using (true)
  with check (true);

-- Auto-cleanup: delete dismissed timers older than 1 day
-- (optional — run periodically or let them accumulate)
