/**
 * notification-sync.mjs
 * Emails users when a new wildfire incident appears near a saved location
 * (if that location has fire alerts enabled), or a new NWS alert of a
 * type they've opted into is issued for a saved location's point.
 * Run on a schedule by .github/workflows/notification-sync.yml, mirroring
 * scripts/nexrad-radar-sync.mjs's pattern (plain Node, raw REST calls to
 * Supabase with the service-role key, no @supabase/supabase-js client).
 *
 * "New" is determined by public.notification_log: each (user, kind,
 * subject_key) is unique, so an insert with Prefer: resolution=ignore-
 * duplicates tells us in one round-trip whether this user has already been
 * emailed about this exact fire/alert — if the insert returns a row, it's
 * genuinely new and an email is sent; if it returns nothing, it was a
 * duplicate and is skipped. The log table doubles as in-app notification
 * history (read-only to each user via RLS).
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Sentinel Wildfire Alerts <onboarding@resend.dev>';
const APP_URL = process.env.APP_URL || 'https://app.nationalwildfiretrackingteam.org';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars');
}
if (!RESEND_API_KEY) {
  throw new Error('Missing RESEND_API_KEY env var');
}

const IRWIN_URL =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services' +
  '/WFIGS_Incident_Locations_Current/FeatureServer/0/query';

const NWS_HEADERS = {
  'User-Agent': 'Sentinel Wildfire Platform (contact@sentinel.app)',
  Accept: 'application/geo+json',
};

const FIRE_PROXIMITY_MILES = 25;
const CONCURRENCY = 4;

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

async function main() {
  console.log('[notification-sync] starting');

  const [locations, profiles, preferences] = await Promise.all([
    fetchSavedLocations(),
    fetchProfiles(),
    fetchNotificationPreferences(),
  ]);
  console.log(`[notification-sync] ${locations.length} saved location(s)`);
  if (!locations.length) {
    console.log('[notification-sync] nothing to do');
    return;
  }

  const profileByUserId = new Map(profiles.map((p) => [p.id, p]));
  const prefsByUserId = new Map(preferences.map((p) => [p.user_id, p]));

  const fireLocations = locations.filter((l) => l.notify_new_fires);
  const alertLocations = locations.filter((l) => {
    const types = prefsByUserId.get(l.user_id)?.nws_alert_types;
    return Array.isArray(types) && types.length > 0;
  });

  const fires = fireLocations.length ? await fetchActiveFires() : [];
  console.log(`[notification-sync] ${fires.length} active fire(s), checking ${fireLocations.length} location(s) for proximity`);

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
      }).catch((err) => console.warn('[notification-sync] email failed:', err.message));
    }
  }

  console.log(`[notification-sync] checking ${alertLocations.length} location(s) for NWS alerts`);
  let cursor = 0;
  async function alertWorker() {
    while (cursor < alertLocations.length) {
      const location = alertLocations[cursor++];
      try {
        await checkLocationAlerts(location, profileByUserId, prefsByUserId);
      } catch (err) {
        console.warn(`[notification-sync] alert check failed for ${location.id}:`, err?.message || err);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, alertLocations.length) }, alertWorker),
  );

  console.log('[notification-sync] done');
}

async function checkLocationAlerts(location, profileByUserId, prefsByUserId) {
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
    }).catch((err) => console.warn('[notification-sync] email failed:', err.message));
  }
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
  const resp = await fetch(`${IRWIN_URL}?${params}`);
  if (!resp.ok) throw new Error(`Fetch IRWIN incidents failed: ${resp.status}`);
  const data = await resp.json();
  return (data.features || [])
    .map((f) => ({
      id: f.attributes?.UniqueFireIdentifier,
      name: f.attributes?.IncidentName || 'Unnamed fire',
      lat: f.geometry?.y,
      lng: f.geometry?.x,
    }))
    .filter((f) => f.id && Number.isFinite(f.lat) && Number.isFinite(f.lng));
}

async function fetchAlertsForPoint(lat, lng) {
  const url = `https://api.weather.gov/alerts/active?point=${lat},${lng}&status=actual&message_type=alert,update`;
  const resp = await fetch(url, { headers: NWS_HEADERS });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.features || []).map((f) => ({
    id: f.properties?.id || f.id,
    event: f.properties?.event,
    headline: f.properties?.headline,
  }));
}

/** Returns true if this (user, kind, subjectKey) hadn't been logged before. */
async function logNotification({ userId, savedLocationId, kind, subjectKey, title }) {
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
    console.warn(`[notification-sync] log insert failed (${resp.status}):`, await resp.text().catch(() => ''));
    return false;
  }
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function sendEmail({ to, subject, html }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to, subject, html }),
  });
  if (!resp.ok) {
    throw new Error(`Resend API ${resp.status}: ${await resp.text().catch(() => '')}`);
  }
}

function fireEmailHtml({ fire, location, miles }) {
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

function alertEmailHtml({ alert, location }) {
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

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

main().catch((err) => {
  console.error('[notification-sync] fatal:', err);
  process.exit(1);
});
