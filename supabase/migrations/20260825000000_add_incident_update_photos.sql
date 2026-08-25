-- ═══════════════════════════════════════════════════════════════════════════
-- Photo attachments on incident updates — reporters can attach photos to any
-- update (first post or a later follow-up), not just at submission time.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.incident_updates
  add column if not exists photo_urls text[] not null default '{}';

-- ─── Storage bucket for reporter-uploaded incident photos ───────────────────
-- Public bucket: incident_updates are already publicly readable (see
-- "updates public read" policy), so photos attached to them should be too.
-- Uploads are restricted below to authenticated reporters/admins writing into
-- their own folder (storage path: {user_id}/{incident_id}/{uuid}.{ext}).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'incident-photos',
  'incident-photos',
  true,
  8388608, -- 8 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "incident photos public read" on storage.objects;
create policy "incident photos public read"
  on storage.objects for select
  using (bucket_id = 'incident-photos');

drop policy if exists "incident photos insert own" on storage.objects;
create policy "incident photos insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'incident-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );

drop policy if exists "incident photos delete own" on storage.objects;
create policy "incident photos delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'incident-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
