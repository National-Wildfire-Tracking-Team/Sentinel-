-- ═══════════════════════════════════════════════════════════════════════════
-- Live lightning on Supabase (replaces the AWS SentinelLightning stack).
--
-- Every minute the `lightning-builder` pg_cron job POSTs to the
-- lightning-builder Edge Function (supabase/functions/lightning-builder),
-- which reads NOAA's new GOES GLM files and rewrites v1/latest.json.gz in the
-- public `lightning` bucket. Browsers read that one object through the
-- Storage CDN (src/app/api/lightning.js); nothing else is public.
--
-- Uses the same Vault secrets as the other scheduled functions
-- (project_url, service_role_key; see 20260915000000_scheduled_sync_infrastructure.sql)
-- and the same sync_job_locks claim, so runs never overlap.
--
-- Deploy the function before applying this, or the job's first calls 404.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Storage: one public object, written only by the service role ──────────
-- Public bucket: objects are readable at /storage/v1/object/public/lightning/…
-- with no policy. No storage.objects policies are added, so anon and
-- authenticated can't list, write or delete; the builder's service-role key
-- bypasses RLS. 10 MB is far above a busy summer afternoon (a few hundred KB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lightning', 'lightning', true, 10485760, array['application/gzip'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Schedule: every minute (GLM publishes a file every 20 s per satellite) ──
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  perform cron.unschedule('lightning-builder');
exception when others then
  null; -- job didn't exist yet
end $$;

select cron.schedule(
  'lightning-builder',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/lightning-builder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- ── Housekeeping: a per-minute job adds ~1,440 rows a day to cron's history ──
do $$ begin
  perform cron.unschedule('cron-history-cleanup');
exception when others then
  null;
end $$;

select cron.schedule(
  'cron-history-cleanup',
  '17 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '14 days' $$
);
