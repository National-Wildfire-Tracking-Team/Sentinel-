/**
 * notification-sync – Supabase Edge Function
 *
 * Deno port of scripts/notification-sync.mjs, which previously ran on
 * GitHub Actions (.github/workflows/incident-notification-sync.yml, every 5
 * minutes). Moved here for the same reason as incident-updates-sync: pure
 * `fetch` + Node builtins, no npm deps, seconds-scale runtime, no need for a
 * GitHub Actions runner. Deployed as its own separate Edge Function (not
 * merged with incident-updates-sync) because the two share no data
 * dependency in the actual code — this script fetches WFIGS/NWS itself
 * rather than reading incident_updates, and writes to a different table —
 * matching how they were already two independent scripts, only combined
 * into one GitHub Actions job to avoid paying for a second checkout/runner
 * every 5 minutes, a concern that doesn't exist for Edge Function
 * invocations.
 *
 * Emails users when a new wildfire incident appears near a saved location
 * (if that location has fire alerts enabled), or a new NWS alert of a type
 * they've opted into is issued for a saved location's point.
 *
 * "New" is determined by public.notification_log: each (user, kind,
 * subject_key) is unique, so an insert with Prefer: resolution=ignore-
 * duplicates tells us in one round-trip whether this user has already been
 * emailed about this exact fire/alert — if the insert returns a row, it's
 * genuinely new and an email is sent; if it returns nothing, it was a
 * duplicate and is skipped. This is what prevents duplicate emails both
 * across ticks and across the dual-run verification window with the old
 * GitHub Actions workflow.
 *
 * Invoked every 5 minutes by the `notification-sync` pg_cron job (see
 * supabase/migrations/20260915000000_scheduled_sync_infrastructure.sql) via
 * pg_net. Requires the RESEND_API_KEY secret (and optionally
 * RESEND_FROM_EMAIL / APP_URL) to be set via `supabase secrets set` —
 * these previously lived as GitHub Actions repo secrets/vars.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Sentinel Wildfire Alerts <onboarding@resend.dev>';
const APP_URL = Deno.env.get('APP_URL') || 'https://app.nationalwildfiretrackingteam.org';

const IRWIN_URL =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services' +
  '/WFIGS_Incident_Locations_Current/FeatureServer/0/query';

const NWS_HEADERS = {
  'User-Agent': 'Sentinel Wildfire Platform (contact@sentinel.app)',
  Accept: 'application/geo+json',
};

const FIRE_PROXIMITY_MILES = 25;
const CONCURRENCY = 4;
const UPSTREAM_TIMEOUT_MS = 20_000;
const JOB_NAME = 'notification-sync';
const STALE_AFTER_SECONDS = 600;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function supabaseHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

async function fetchSavedLocations() {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/saved_locations?select=id,user_id,name,latitude,longitude,notify_new_fires`,
    { headers: supabaseHeaders() },
  );
  if (!resp.ok) throw new Error(`Fetch saved_locations failed: ${resp.status}`);
  return resp.json();
}

async function fetchProfiles() {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=id,email`,
    { headers: supabaseHeaders() },
  );
  if (!resp.ok) throw new Error(`Fetch profiles failed: ${resp.status}`);
  return resp.json();
}

async function fetchNotificationPreferences() {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/notification_preferences?select=user_id,nws_alert_types`,
    { headers: supabaseHeaders() },
  );
  if (!resp.ok) throw new Error(`Fetch notification_preferences failed: ${resp.status}`);
  return resp.json();
}

async function fetchActiveFires() {
  const params = new URLSearchParams({
    where: `IncidentTypeCategory='WF' AND ControlDateTime IS NULL`,
    outFields: 'UniqueFireIdentifier,IncidentName',
    f: 'json',
    outSR: '4326',
    returnGeometry: 'true',
  });
  const resp = await fetch(`${IRWIN_URL}?${params}`, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`Fetch IRWIN incidents failed: ${resp.status}`);
  const data = await resp.json();
  return (data.features || [])
    .map((f: any) => ({
      id: f.attributes?.UniqueFireIdentifier,
      name: f.attributes?.IncidentName || 'Unnamed fire',
      lat: f.geometry?.y,
      lng: f.geometry?.x,
    }))
    .filter((f: any) => f.id && Number.isFinite(f.lat) && Number.isFinite(f.lng));
}

async function fetchAlertsForPoint(lat: number, lng: number) {
  const url = `https://api.weather.gov/alerts/active?point=${lat},${lng}&status=actual&message_type=alert,update`;
  const resp = await fetch(url, { headers: NWS_HEADERS, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }).catch(() => null);
  if (!resp || !resp.ok) return [];
  const data = await resp.json();
  return (data.features || []).map((f: any) => ({
    id: f.properties?.id || f.id,
    event: f.properties?.event,
    headline: f.properties?.headline,
  }));
}

/** Returns true if this (user, kind, subjectKey) hadn't been logged before. */
async function logNotification({ userId, savedLocationId, kind, subjectKey, title }: {
  userId: string; savedLocationId: string; kind: string; subjectKey: string; title: string;
}): Promise<boolean> {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/notification_log?on_conflict=user_id,kind,subject_key`,
    {
      method: 'POST',
      headers: supabaseHeaders({
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=representation',
      }),
      body: JSON.stringify({
        user_id: userId,
        saved_location_id: savedLocationId,
        kind,
        subject_key: subjectKey,
        title,
      }),
    },
  );
  if (!resp.ok) {
    console.warn(`[${JOB_NAME}] log insert failed (${resp.status}):`, await resp.text().catch(() => ''));
    return false;
  }
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<void> {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to, subject, html }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`Resend API ${resp.status}: ${await resp.text().catch(() => '')}`);
  }
}

function escapeHtml(str: unknown): string {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}

function fireEmailHtml({ fire, location, miles }: { fire: any; location: any; miles: number }): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="color: #ea580c;">New wildfire near ${escapeHtml(location.name)}</h2>
      <p><strong>${escapeHtml(fire.name)}</strong> was just reported approximately ${Math.round(miles)} miles from your saved location.</p>
      <p><a href="${APP_URL}" style="color: #ea580c;">Open Sentinel to view it on the map →</a></p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
        You're receiving this because fire alerts are enabled for "${escapeHtml(location.name)}".
        Manage your notification preferences in your Sentinel account settings.
      </p>
    </div>
  `;
}

function alertEmailHtml({ alert, location }: { alert: any; location: any }): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="color: #dc2626;">${escapeHtml(alert.event)}</h2>
      <p>A new <strong>${escapeHtml(alert.event)}</strong> has been issued for your saved location "${escapeHtml(location.name)}".</p>
      ${alert.headline ? `<p>${escapeHtml(alert.headline)}</p>` : ''}
      <p><a href="${APP_URL}" style="color: #dc2626;">Open Sentinel for details →</a></p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
        You're receiving this because you subscribed to "${escapeHtml(alert.event)}" alerts for "${escapeHtml(location.name)}".
        Manage your notification preferences in your Sentinel account settings.
      </p>
    </div>
  `;
}

async function checkLocationAlerts(
  location: any,
  profileByUserId: Map<string, any>,
  prefsByUserId: Map<string, any>,
  counts: { alertsSent: number },
) {
  const email = profileByUserId.get(location.user_id)?.email;
  if (!email) return;
  const wantedTypes = new Set(prefsByUserId.get(location.user_id)?.nws_alert_types || []);
  if (!wantedTypes.size) return;

  const alerts = await fetchAlertsForPoint(location.latitude, location.longitude);
  for (const alert of alerts) {
    if (!wantedTypes.has(alert.event)) continue;

    const isNew = await logNotification({
      userId: location.user_id,
      savedLocationId: location.id,
      kind: 'nws_alert',
      subjectKey: `alert:${alert.id}`,
      title: `${alert.event} — ${location.name}`,
    });
    if (!isNew) continue;

    await sendEmail({
      to: email,
      subject: `${alert.event}: ${location.name}`,
      html: alertEmailHtml({ alert, location }),
    }).then(() => counts.alertsSent++)
      .catch((err) => console.warn(`[${JOB_NAME}] email failed:`, err.message));
  }
}

async function claimJob(): Promise<boolean> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/try_claim_sync_job`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p_job_name: JOB_NAME, p_stale_after_seconds: STALE_AFTER_SECONDS }),
  });
  if (!resp.ok) throw new Error(`try_claim_sync_job failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  return (await resp.json()) === true;
}

async function releaseJob(success: boolean, error?: string): Promise<void> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/release_sync_job`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p_job_name: JOB_NAME, p_success: success, p_error: error ? String(error).slice(0, 500) : null }),
  });
  if (!resp.ok) console.warn(`[${JOB_NAME}] release_sync_job failed: ${resp.status}`);
}

async function runSync() {
  const [locations, profiles, preferences] = await Promise.all([
    fetchSavedLocations(),
    fetchProfiles(),
    fetchNotificationPreferences(),
  ]);
  console.log(`[${JOB_NAME}] ${locations.length} saved location(s)`);
  if (!locations.length) {
    console.log(`[${JOB_NAME}] nothing to do`);
    return { savedLocationCount: 0, fireAlertsSent: 0, nwsAlertsSent: 0 };
  }

  const profileByUserId = new Map(profiles.map((p: any) => [p.id, p]));
  const prefsByUserId = new Map(preferences.map((p: any) => [p.user_id, p]));

  const fireLocations = locations.filter((l: any) => l.notify_new_fires);
  const alertLocations = locations.filter((l: any) => {
    const types = prefsByUserId.get(l.user_id)?.nws_alert_types;
    return Array.isArray(types) && types.length > 0;
  });

  const fires = fireLocations.length ? await fetchActiveFires() : [];
  console.log(`[${JOB_NAME}] ${fires.length} active fire(s), checking ${fireLocations.length} location(s) for proximity`);

  let fireAlertsSent = 0;
  for (const location of fireLocations) {
    const email = profileByUserId.get(location.user_id)?.email;
    if (!email) continue;
    for (const fire of fires) {
      if (fire.lat == null || fire.lng == null) continue;
      const miles = haversineMiles(location.latitude, location.longitude, fire.lat, fire.lng);
      if (miles > FIRE_PROXIMITY_MILES) continue;

      const isNew = await logNotification({
        userId: location.user_id,
        savedLocationId: location.id,
        kind: 'new_fire',
        subjectKey: `fire:${fire.id}`,
        title: `${fire.name} — ${Math.round(miles)} mi from ${location.name}`,
      });
      if (!isNew) continue;

      await sendEmail({
        to: email,
        subject: `New wildfire near ${location.name}: ${fire.name}`,
        html: fireEmailHtml({ fire, location, miles }),
      }).then(() => fireAlertsSent++)
        .catch((err) => console.warn(`[${JOB_NAME}] email failed:`, err.message));
    }
  }

  console.log(`[${JOB_NAME}] checking ${alertLocations.length} location(s) for NWS alerts`);
  const nwsCounts = { alertsSent: 0 };
  let cursor = 0;
  async function alertWorker() {
    while (cursor < alertLocations.length) {
      const location = alertLocations[cursor++];
      try {
        await checkLocationAlerts(location, profileByUserId, prefsByUserId, nwsCounts);
      } catch (err) {
        console.warn(`[${JOB_NAME}] alert check failed for ${location.id}:`, (err as Error)?.message || err);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, alertLocations.length) }, alertWorker),
  );

  return {
    savedLocationCount: locations.length,
    fireAlertsSent,
    nwsAlertsSent: nwsCounts.alertsSent,
  };
}

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now();
  console.log(`[${JOB_NAME}] starting`);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Supabase service credentials are not configured.' }, 500);
  }
  if (!RESEND_API_KEY) {
    return jsonResponse({ error: 'RESEND_API_KEY secret is not configured.' }, 500);
  }

  let claimed: boolean;
  try {
    claimed = await claimJob();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${JOB_NAME}] claim failed:`, message);
    return jsonResponse({ ok: false, error: message }, 500);
  }

  if (!claimed) {
    console.log(`[${JOB_NAME}] skipped: previous run still in progress`);
    return jsonResponse({ ok: true, skipped: true, reason: 'already running' });
  }

  try {
    const summary = await runSync();
    await releaseJob(true);
    const durationMs = Date.now() - startedAt;
    console.log(`[${JOB_NAME}] done in ${durationMs}ms`, summary);
    return jsonResponse({ ok: true, durationMs, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${JOB_NAME}] fatal:`, message);
    await releaseJob(false, message).catch(() => {});
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
