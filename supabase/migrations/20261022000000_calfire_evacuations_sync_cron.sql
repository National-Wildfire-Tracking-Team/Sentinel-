-- calfire-evacuations-sync schedule
-- Runs supabase/functions/calfire-evacuations-sync every 5 minutes, the same
-- way incident-updates-sync is scheduled (20260915000000_scheduled_sync_
-- infrastructure.sql): pg_net POSTs with the service_role key read from
-- Vault, and try_claim_sync_job guards against overlapping runs. No new
-- tables: the function writes incident_evacuations and incident_updates.
--
-- Offset to minute 2 of every 5 so it doesn't fire alongside
-- incident-updates-sync and notification-sync.

do $$ begin
  perform cron.unschedule('calfire-evacuations-sync');
exception when others then
  null; -- job didn't exist yet
end $$;

select cron.schedule(
  'calfire-evacuations-sync',
  '2-59/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/calfire-evacuations-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(),
    timeout_milliseconds := 30000
  );
  $$
);
