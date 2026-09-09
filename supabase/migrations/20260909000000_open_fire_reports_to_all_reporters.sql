-- ── Migration: Allow any reporter to collaboratively edit/delete incidents ────
--
-- Previously, "reports update own details" and "reports delete own" AND'd
-- auth.uid() = user_id into the check, so only the submitting reporter (or an
-- admin, via the separate "reports admin update" policy) could edit or delete
-- a fire_reports row. Reporters now collaboratively manage the same shared
-- incident list, so any user with role 'reporter' or 'admin' may edit/delete
-- ANY incident, not just their own. Insert is unchanged — the submitter is
-- still recorded as user_id at creation time.

create or replace function public.is_reporter_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('reporter', 'admin')
  );
$$;

drop policy if exists "reports update own details" on public.fire_reports;
create policy "reports update any reporter"
  on public.fire_reports for update
  using (public.is_reporter_or_admin())
  with check (public.is_reporter_or_admin());

drop policy if exists "reports delete own" on public.fire_reports;
create policy "reports delete any reporter"
  on public.fire_reports for delete
  using (public.is_reporter_or_admin());
