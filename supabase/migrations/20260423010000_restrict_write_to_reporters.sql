-- ── Migration: Restrict write access on fire_reports and incident_updates ────
--
-- Previously, any authenticated user could insert fire reports and incident
-- updates because the policies only checked auth.uid() = user_id.
-- This migration tightens those policies so that only users with the
-- 'reporter' or 'admin' role (stored in public.profiles.role) may insert,
-- update, or delete records. Users with role='public' are read-only.
--
-- fire_reports
-- ─────────────────────────────────────────────────────────────────────────────

-- Restrict inserts: user must be a reporter or admin
drop policy if exists "reports insert own" on public.fire_reports;
create policy "reports insert own"
  on public.fire_reports for insert
  with check (
    auth.uid() = user_id
    and status in ('approved', 'pending')
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );

-- Restrict updates: user must be a reporter or admin (and own the row)
drop policy if exists "reports update own details" on public.fire_reports;
create policy "reports update own details"
  on public.fire_reports for update
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

-- Restrict deletes: user must be a reporter or admin (and own the row)
drop policy if exists "reports delete own" on public.fire_reports;
create policy "reports delete own"
  on public.fire_reports for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );


-- incident_updates
-- ─────────────────────────────────────────────────────────────────────────────

-- Restrict inserts: user must be a reporter or admin
drop policy if exists "updates insert own" on public.incident_updates;
create policy "updates insert own"
  on public.incident_updates for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );

-- Restrict updates: user must be a reporter or admin (and own the row)
drop policy if exists "updates update own" on public.incident_updates;
create policy "updates update own"
  on public.incident_updates for update
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

-- Restrict deletes: user must be a reporter or admin (and own the row)
drop policy if exists "updates delete own" on public.incident_updates;
create policy "updates delete own"
  on public.incident_updates for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );
