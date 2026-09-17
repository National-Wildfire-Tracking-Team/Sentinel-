-- Scheduled-sync infrastructure for moving incident-updates-sync and
-- notification-sync from GitHub Actions cron to Supabase pg_cron + Edge
-- Functions (see supabase/functions/incident-updates-sync,
-- supabase/functions/notification-sync).
--
-- MRMS and NEXRAD radar sync are intentionally NOT part of this migration:
-- MRMS decodes GRIB2 via a pinned native wgrib2 binary (conda-forge), which
-- the Deno Edge runtime cannot run at all, and the full-fidelity NEXRAD
-- decode already crashes Edge Functions on memory limits (see
-- supabase/functions/nexrad-heartbeat/index.ts's module doc comment, which
-- documents this exact failure and is why that function only ever decodes a
-- truncated prefix). Both have instead moved to Google Cloud Run Jobs (see
-- cloud/nexrad-sync/README.md and cloud/mrms-sync/README.md) — Cloud Run
-- gives NEXRAD the memory headroom Edge Functions can't offer, and gives
-- MRMS a container that can actually run its native wgrib2 binary.

-- ── Job locks: prevent overlapping runs of a scheduled Edge Function ────────
-- Edge Functions are stateless HTTP invocations (not one long-lived process),
-- so a plain pg_advisory_xact_lock held only for the duration of a single
-- RPC call can't span an entire run. Instead, each job claims a row here
-- before starting and releases it when done; a stale claim (crash, timeout,
-- or a platform-level kill mid-run) is automatically reclaimable after
-- p_stale_after_seconds so one failed execution can never permanently wedge
-- future runs.
create table if not exists public.sync_job_locks (
  job_name        text primary key,
  running         boolean not null default false,
  claimed_at      timestamptz,
  heartbeat_at    timestamptz,
  last_success_at timestamptz,
  last_error      text,
  last_error_at   timestamptz
);

alter table public.sync_job_locks enable row level security;
-- No policies: only service_role (which bypasses RLS) or the security
-- definer functions below can ever touch this table.
revoke all on public.sync_job_locks from anon, authenticated;

create or replace function public.try_claim_sync_job(
  p_job_name text,
  p_stale_after_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  did_claim boolean;
begin
  insert into public.sync_job_locks (job_name, running, claimed_at, heartbeat_at)
  values (p_job_name, true, now(), now())
  on conflict (job_name) do update
    set running = true,
        claimed_at = now(),
        heartbeat_at = now()
    where public.sync_job_locks.running = false
       or public.sync_job_locks.heartbeat_at < now() - make_interval(secs => p_stale_after_seconds)
  returning true into did_claim;

  return coalesce(did_claim, false);
end;
$$;

create or replace function public.release_sync_job(
  p_job_name text,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sync_job_locks
     set running = false,
         last_success_at = case when p_success then now() else last_success_at end,
         last_error = case when p_success then null else p_error end,
         last_error_at = case when p_success then last_error_at else now() end
   where job_name = p_job_name;
end;
$$;

revoke execute on function public.try_claim_sync_job(text, integer) from public, anon, authenticated;
revoke execute on function public.release_sync_job(text, boolean, text) from public, anon, authenticated;
grant execute on function public.try_claim_sync_job(text, integer) to service_role;
grant execute on function public.release_sync_job(text, boolean, text) to service_role;

-- ── Scheduling: pg_cron + pg_net invoke the Edge Functions over HTTP ────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- One-time manual setup required before these jobs can actually reach the
-- deployed functions (deliberately NOT done here — never put real
-- credentials in a migration file that gets committed to git). Run once in
-- the Supabase SQL editor after `supabase functions deploy`:
--
--   select vault.create_secret('https://<your-project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<your service_role key>', 'service_role_key');
--
-- Both are read back by name at call time below via vault.decrypted_secrets,
-- so the literal values never appear in this file or in git history.

do $$ begin
  perform cron.unschedule('incident-updates-sync');
exception when others then
  null; -- job didn't exist yet
end $$;

do $$ begin
  perform cron.unschedule('notification-sync');
exception when others then
  null;
end $$;

-- Same 5-minute cadence as the current GitHub Actions workflow
-- (incident-notification-sync.yml) — preserved as-is, not narrowed or
-- widened, since nothing about moving compute location changes how often
-- WFIGS/CAL FIRE/NWS actually publish new data.
select cron.schedule(
  'incident-updates-sync',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/incident-updates-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'notification-sync',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/notification-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
