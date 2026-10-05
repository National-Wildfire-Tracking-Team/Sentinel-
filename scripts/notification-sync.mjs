/**
 * notification-sync.mjs
 * Manual fallback runner for the saved-location notification pipeline. The
 * scheduled path is the notification-sync Supabase Edge Function (pg_cron,
 * every 5 minutes); this runs the exact same pipeline from Node via
 * workflow_dispatch in .github/workflows/incident-notification-sync.yml.
 *
 * It shares the edge function's job lock and notification_log de-duplication,
 * so running it alongside the scheduled job never sends duplicate emails.
 * See supabase/functions/_shared/savedLocationAlerts.js for the pipeline.
 */

import { runNotificationSync } from '../supabase/functions/_shared/savedLocationAlerts.js';
import {
  createNotificationSyncClients,
  createStructuredLogger,
} from '../supabase/functions/_shared/notificationSyncClients.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Sentinel Wildfire Alerts <onboarding@resend.dev>';
const APP_URL = process.env.APP_URL || 'https://app.nationalwildfiretrackingteam.org';

const JOB_NAME = 'notification-sync';
const STALE_AFTER_SECONDS = 600;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars');
}
if (!RESEND_API_KEY) {
  throw new Error('Missing RESEND_API_KEY env var');
}

async function main() {
  const log = createStructuredLogger(JOB_NAME);
  const clients = createNotificationSyncClients({
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    resendApiKey: RESEND_API_KEY,
    fromEmail: RESEND_FROM_EMAIL,
    jobName: JOB_NAME,
  });

  if (!(await clients.claimJob(STALE_AFTER_SECONDS))) {
    log('job_skipped', { reason: 'already running' });
    return;
  }
  try {
    await runNotificationSync({ ...clients, log, appUrl: APP_URL, now: Date.now() });
    await clients.releaseJob(true);
  } catch (err) {
    await clients.releaseJob(false, err?.message || String(err)).catch(() => {});
    throw err;
  }
}

main().catch((err) => {
  console.error('[notification-sync] fatal:', err);
  process.exit(1);
});
