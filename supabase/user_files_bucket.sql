-- Note Goat file storage bucket + RLS policies.
-- Run this in Supabase SQL Editor.
--
-- This creates a private storage bucket for user file uploads.
-- Files are scoped per user: {user_id}/{folder_id}/{filename}
-- RLS ensures each user can only access their own files.

-- 1. Create the private storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-files',
  'user-files',
  false,
  52428800, -- 50 MB max file size
  null      -- allow all MIME types
)
on conflict (id) do nothing;

-- 2. RLS policies for the bucket
-- Users can SELECT (read/download) their own files
drop policy if exists "user_files_select_own" on storage.objects;
create policy "user_files_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'user-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can INSERT (upload) their own files
drop policy if exists "user_files_insert_own" on storage.objects;
create policy "user_files_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'user-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can UPDATE their own files
drop policy if exists "user_files_update_own" on storage.objects;
create policy "user_files_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'user-files'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'user-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can DELETE their own files
drop policy if exists "user_files_delete_own" on storage.objects;
create policy "user_files_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'user-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Add addon_files_active column to account_profiles (for future billing gate)
alter table public.account_profiles
  add column if not exists addon_files_active boolean not null default false;
