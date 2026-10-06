/**
 * notificationSyncClients.js
 * I/O for the saved-location notification pipeline (savedLocationAlerts.js):
 * Supabase REST (service role), WFIGS active fires, api.weather.gov, Resend.
 * Uses only global fetch/AbortSignal so the Deno Edge Function and the Node
 * fallback script share it unchanged.
 */

const IRWIN_URL =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services' +
  '/WFIGS_Incident_Locations_Current/FeatureServer/0/query';

const NWS_ALERTS_URL = 'https://api.weather.gov/alerts/active';
const NWS_HEADERS = {
  'User-Agent': 'Sentinel Wildfire Platform (contact@sentinel.app)',
  Accept: 'application/geo+json',
};

const UPSTREAM_TIMEOUT_MS = 20_000;
const DEDUP_CONFLICT = 'user_id,saved_location_id,kind,subject_key';

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {{ supabaseUrl: string, serviceRoleKey: string, resendApiKey: string,
 *           fromEmail: string, jobName: string }} config
 */
export function createNotificationSyncClients(config) {
  const { supabaseUrl, serviceRoleKey, resendApiKey, fromEmail, jobName } = config;

  const headers = (extra = {}) => ({
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  });

  async function rpc(fn, body = {}) {
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new HttpError(`${fn} failed: ${resp.status} ${await resp.text().catch(() => '')}`, resp.status);
    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    /** Locations eligible for monitoring (enabled, within plan limit, owner has an email). */
    fetchMonitoredLocations: () => rpc('get_monitored_saved_locations'),

    async fetchActiveFires() {
      const params = new URLSearchParams({
        where: `IncidentTypeCategory='WF' AND ControlDateTime IS NULL`,
        outFields: 'UniqueFireIdentifier,IncidentName',
        f: 'json',
        outSR: '4326',
        returnGeometry: 'true',
      });
      const resp = await fetch(`${IRWIN_URL}?${params}`, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
      if (!resp.ok) throw new HttpError(`Fetch IRWIN incidents failed: ${resp.status}`, resp.status);
      const data = await resp.json();
      return (data.features || [])
        .map((f) => ({
          id: f.attributes?.UniqueFireIdentifier,
          name: f.attributes?.IncidentName || 'Unnamed fire',
          lat: f.geometry?.y,
          lng: f.geometry?.x,
        }))
        .filter((f) => f.id && Number.isFinite(f.lat) && Number.isFinite(f.lng));
    },

    /** Active alerts of the given event types, nationwide (for radius matching). */
    async fetchActiveAlerts(eventTypes) {
      const params = new URLSearchParams({ status: 'actual', message_type: 'alert,update' });
      if (eventTypes?.length) params.set('event', eventTypes.join(','));
      const resp = await fetch(`${NWS_ALERTS_URL}?${params}`, {
        headers: NWS_HEADERS,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (!resp.ok) throw new HttpError(`NWS active alerts failed: ${resp.status}`, resp.status);
      return (await resp.json()).features || [];
    },

    /** Active alerts whose area (zone or polygon) contains the point. */
    async fetchPointAlerts(lat, lng) {
      const params = new URLSearchParams({
        point: `${lat},${lng}`,
        status: 'actual',
        message_type: 'alert,update',
      });
      const resp = await fetch(`${NWS_ALERTS_URL}?${params}`, {
        headers: NWS_HEADERS,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (!resp.ok) throw new HttpError(`NWS point alerts failed: ${resp.status}`, resp.status);
      return (await resp.json()).features || [];
    },

    /**
     * Insert-or-ignore on the per-location dedup index. A returned row means
     * this (user, location, kind, subject) is new; nothing back means it was
     * already sent.
     */
    async claimNotification(row) {
      const resp = await fetch(`${supabaseUrl}/rest/v1/notification_log?on_conflict=${DEDUP_CONFLICT}`, {
        method: 'POST',
        headers: headers({
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=representation',
        }),
        body: JSON.stringify(row),
      });
      if (!resp.ok) throw new HttpError(`notification_log insert failed: ${resp.status} ${await resp.text().catch(() => '')}`, resp.status);
      const rows = await resp.json();
      return { isNew: Array.isArray(rows) && rows.length > 0, id: rows?.[0]?.id ?? null };
    },

    async releaseNotification(id) {
      const resp = await fetch(`${supabaseUrl}/rest/v1/notification_log?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!resp.ok) throw new HttpError(`notification_log release failed: ${resp.status}`, resp.status);
    },

    /** Followed incidents with unsent updates (see incidentFollowAlerts.js). */
    fetchFollowDigests: () => rpc('get_pending_follow_digests'),

    /** Dedup claim for a follow digest: the log row id, or null if already sent. */
    claimFollowNotification: ({ user_id, subject_key, title }) =>
      rpc('claim_follow_notification', { p_user_id: user_id, p_subject_key: subject_key, p_title: title }),

    markFollowNotified: ({ user_id, incident_id, through }) =>
      rpc('mark_follow_notified', { p_user_id: user_id, p_incident_id: incident_id, p_through: through }),

    async sendEmail({ to, subject, html }) {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromEmail, to, subject, html }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (!resp.ok) throw new HttpError(`Resend API ${resp.status}: ${await resp.text().catch(() => '')}`, resp.status);
    },

    /** Cross-run lock so overlapping invocations never double-process. */
    async claimJob(staleAfterSeconds) {
      return (await rpc('try_claim_sync_job', { p_job_name: jobName, p_stale_after_seconds: staleAfterSeconds })) === true;
    },

    async releaseJob(success, error) {
      await rpc('release_sync_job', {
        p_job_name: jobName,
        p_success: success,
        p_error: error ? String(error).slice(0, 500) : null,
      });
    },
  };
}

/** One JSON line per pipeline event; callers must not pass PII in fields. */
export function createStructuredLogger(jobName) {
  return (event, fields = {}) => {
    console.log(JSON.stringify({ job: jobName, event, ...fields }));
  };
}
