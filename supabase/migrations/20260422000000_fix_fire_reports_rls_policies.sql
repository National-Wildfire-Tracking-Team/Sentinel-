-- ── Migration: Fix fire_reports RLS policies ────────────────────────────────
--
-- The live "reports insert own" policy only allowed status='pending', but the
-- application inserts with status='approved' (reporters have no moderation queue
-- by design — their submissions go live immediately).  This caused the error:
--   "new row violates row-level security policy for table fire_reports"
--
-- Two other policies from schema.sql were also never applied to the live DB:
--   • reporters could not UPDATE their own reports
--   • reporters could not DELETE their own reports

-- Fix 1: Allow reporters to insert with status 'approved' OR 'pending'.
drop policy if exists "reports insert own" on public.fire_reports;
create policy "reports insert own"
  on public.fire_reports for insert
  with check (auth.uid() = user_id and status in ('approved', 'pending'));

-- Fix 2: Reporters can update details (title/description/location) on their own reports.
drop policy if exists "reports update own details" on public.fire_reports;
create policy "reports update own details"
  on public.fire_reports for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Fix 3: Reporters can delete their own fire report entries.
drop policy if exists "reports delete own" on public.fire_reports;
create policy "reports delete own"
  on public.fire_reports for delete
  using (auth.uid() = user_id);
