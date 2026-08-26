-- Audit follow-up: tighten write policies for demoted users, require reporter
-- role on incident-photo deletes, and dedupe automated timeline spam.
--
-- The public "updates automated insert" policy is intentionally left in place:
-- the only writer today is the browser (useIncidents / useCalFireIncidents).
-- Dropping it without a service-role writer would stop automated updates.
-- The unique index below stops N open tabs from inserting the same row N times.

-- ─── reporter_evac_zones: update/delete require current reporter/admin role ───
drop policy if exists "evac_zones update own" on public.reporter_evac_zones;
create policy "evac_zones update own"
  on public.reporter_evac_zones for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );

drop policy if exists "evac_zones delete own" on public.reporter_evac_zones;
create policy "evac_zones delete own"
  on public.reporter_evac_zones for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );

-- ─── hazard_events: same role check on update/delete ──────────────────────────
drop policy if exists "hazard_events update own" on public.hazard_events;
create policy "hazard_events update own"
  on public.hazard_events for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );

drop policy if exists "hazard_events delete own" on public.hazard_events;
create policy "hazard_events delete own"
  on public.hazard_events for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );

-- ─── incident-photos storage: delete requires current reporter/admin role ─────
drop policy if exists "incident photos delete own" on storage.objects;
create policy "incident photos delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'incident-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );

-- ─── automated incident_updates: keep the newest row per incident/source/body ─
delete from public.incident_updates a
using public.incident_updates b
where a.source_type = 'automated'
  and b.source_type = 'automated'
  and a.incident_id = b.incident_id
  and a.source_name is not distinct from b.source_name
  and md5(a.content) = md5(b.content)
  and a.ctid <> b.ctid
  and a.created_at < b.created_at;

-- Tie-break: if created_at matches, keep the lower id
delete from public.incident_updates a
using public.incident_updates b
where a.source_type = 'automated'
  and b.source_type = 'automated'
  and a.incident_id = b.incident_id
  and a.source_name is not distinct from b.source_name
  and md5(a.content) = md5(b.content)
  and a.id > b.id;

create unique index if not exists incident_updates_automated_dedupe
  on public.incident_updates (incident_id, source_name, md5(content))
  where source_type = 'automated';
