/**
 * notification-sync – Supabase Edge Function
 *
 * Emails users when a wildfire or a subscribed NWS alert affects one of their
 * saved locations, and sends digests of new updates on incidents they follow
 * (../_shared/incidentFollowAlerts.js). Invoked every 5 minutes by the `notification-sync` pg_cron
 * job (supabase/migrations/20260915000000_scheduled_sync_infrastructure.sql)
 * via pg_net.
 *
 * The decision pipeline lives in ../_shared/savedLocationAlerts.js:
 *   get_monitored_saved_locations() (enabled + within plan limit + has email)
 *   → radius match (fires: point distance; NWS: alert polygon ∩ radius, or the
 *     alert covers the location's point)
 *   → per-location switches / subscribed NWS alert types
 *   → notification_log claim (unique per user + location + kind + event)
 *   → Resend email; retryable failures release the claim for the next run.
 * scripts/notification-sync.mjs runs the same pipeline from Node as a manual
 * fallback (workflow_dispatch in incident-notification-sync.yml).
 *
 * Requires the RESEND_API_KEY secret (and optionally RESEND_FROM_EMAIL /
 * APP_URL) via `supabase secrets set`, and the vault `service_role_key`
 * secret the cron job sends as its bearer token.
 */

import { runNotificationSync } from '../_shared/savedLocationAlerts.js';
import { runFollowNotifications } from '../_shared/incidentFollowAlerts.js';
import { createNotificationSyncClients, createStructuredLogger } from '../_shared/notificationSyncClients.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Sentinel Wildfire Alerts <onboarding@resend.dev>';
const APP_URL = Deno.env.get('APP_URL') || 'https://app.nationalwildfiretrackingteam.org';

const JOB_NAME = 'notification-sync';
const STALE_AFTER_SECONDS = 600;
const CONCURRENCY = 4;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * verify_jwt has already checked the signature; additionally require the
 * service_role claim so a signed-in user's JWT can't trigger runs.
 */
function isServiceRoleCaller(req: Request): boolean {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (token && token === SUPABASE_SERVICE_ROLE_KEY) return true;
  const payload = token.split('.')[1];
  if (!payload) return false;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json)?.role === 'service_role';
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  const log = createStructuredLogger(JOB_NAME);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Supabase service credentials are not configured.' }, 500);
  }
  if (!isServiceRoleCaller(req)) {
    log('unauthorized_invocation');
    return jsonResponse({ error: 'Forbidden' }, 403);
  }
  if (!RESEND_API_KEY) {
    log('misconfigured', { missing: 'RESEND_API_KEY' });
    return jsonResponse({ error: 'RESEND_API_KEY secret is not configured.' }, 500);
  }

  const clients = createNotificationSyncClients({
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    resendApiKey: RESEND_API_KEY,
    fromEmail: RESEND_FROM_EMAIL,
    jobName: JOB_NAME,
  });

  let claimed: boolean;
  try {
    claimed = await clients.claimJob(STALE_AFTER_SECONDS);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('job_claim_failed', { error: message });
    return jsonResponse({ ok: false, error: message }, 500);
  }
  if (!claimed) {
    log('job_skipped', { reason: 'already running' });
    return jsonResponse({ ok: true, skipped: true, reason: 'already running' });
  }

  try {
    const summary = await runNotificationSync({
      ...clients,
      log,
      appUrl: APP_URL,
      now: Date.now(),
      concurrency: CONCURRENCY,
    });
    // Independent of the saved-location pass: a failure here is logged and
    // retried next run without failing (or re-running) the job above.
    let followSummary: Record<string, number> = {};
    try {
      followSummary = await runFollowNotifications({ ...clients, log, appUrl: APP_URL });
    } catch (err) {
      log('follow_pass_failed', { error: err instanceof Error ? err.message : String(err) });
    }
    await clients.releaseJob(true);
    const durationMs = Date.now() - startedAt;
    log('job_done', { durationMs });
    return jsonResponse({ ok: true, durationMs, ...summary, ...followSummary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('job_failed', { error: message });
    await clients.releaseJob(false, message).catch(() => {});
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
