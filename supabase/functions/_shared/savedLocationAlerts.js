/**
 * savedLocationAlerts.js
 * The saved-location notification decision pipeline used by notification-sync
 * (supabase/functions/notification-sync, and scripts/notification-sync.mjs as
 * the manual fallback runner):
 *
 *   event (WFIGS fire / NWS alert)
 *     → saved location matcher (radius via radiusFilter.js)
 *     → notification preferences (per-location switches, NWS alert types)
 *     → user/plan eligibility (get_monitored_saved_locations RPC, upstream)
 *     → de-duplication (notification_log claim per user + location + event)
 *     → delivery (Resend email)
 *
 * Everything with I/O is injected through `deps`, so this module is plain
 * runtime-neutral ESM that runs unchanged in Deno, Node, and Vitest.
 */

import { geometryIntersectsCircle, haversineMiles } from './radiusFilter.js';

/** Bounds enforced by saved_locations_radius_check. */
export const MIN_RADIUS_MILES = 1;
export const MAX_RADIUS_MILES = 100;
/** Column default; used only when a row somehow arrives without a radius. */
export const DEFAULT_RADIUS_MILES = 25;
/** Choices offered in the app. */
export const RADIUS_OPTIONS_MILES = [5, 10, 25, 50, 100];

// VTEC actions that mean the hazard is over or replaced by a new product.
const ENDED_VTEC_ACTIONS = new Set(['CAN', 'EXP', 'UPG']);

export function isValidCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Client-side mirror of the saved_locations check constraints, so the app
 * can explain a bad value before the database rejects it. Validates only the
 * fields present (for partial updates). Returns an error message or null.
 */
export function validateSavedLocationFields(fields) {
  if ('name' in fields) {
    const name = String(fields.name ?? '').trim();
    if (!name) return 'Give this location a name.';
    if (name.length > 120) return 'Location names can be at most 120 characters.';
  }
  if ('latitude' in fields || 'longitude' in fields) {
    if (!isValidCoordinate(Number(fields.latitude), Number(fields.longitude))) {
      return 'That location has invalid coordinates. Search for it again.';
    }
  }
  if ('notify_radius_miles' in fields) {
    const r = Number(fields.notify_radius_miles);
    if (!Number.isInteger(r) || r < MIN_RADIUS_MILES || r > MAX_RADIUS_MILES) {
      return `Notification radius must be between ${MIN_RADIUS_MILES} and ${MAX_RADIUS_MILES} miles.`;
    }
  }
  return null;
}

/** The location's radius, or the default when it is missing or out of range. */
export function locationRadiusMiles(location) {
  const r = Number(location?.notify_radius_miles);
  return Number.isFinite(r) && r >= MIN_RADIUS_MILES && r <= MAX_RADIUS_MILES
    ? r
    : DEFAULT_RADIUS_MILES;
}

/** Distance to a fire if it is inside the location's radius (inclusive), else null. */
export function fireDistanceWithinRadius(fire, location) {
  if (!isValidCoordinate(fire?.lat, fire?.lng)) return null;
  const radius = locationRadiusMiles(location);
  const miles = haversineMiles(location.latitude, location.longitude, fire.lat, fire.lng);
  return miles <= radius ? miles : null;
}

// ── NWS alerts ──────────────────────────────────────────────────────────────

/**
 * Parse a P-VTEC string, e.g. "/O.CON.KLOT.SV.W.0045.250601T2010Z-250601T2100Z/".
 * Returns null for anything that isn't an operational/test P-VTEC.
 */
export function parseVtec(vtec) {
  const m = /^\/[OTEX]\.([A-Z]{3})\.([A-Z]{4})\.([A-Z]{2})\.([A-Z])\.(\d{4})\.(\d{6}T\d{4}Z)-(\d{6}T\d{4}Z)\/$/
    .exec(String(vtec || '').trim());
  if (!m) return null;
  const [, action, office, phenomena, significance, etn, begins, ends] = m;
  return { action, office, phenomena, significance, etn, begins, ends };
}

/**
 * Stable identity for an NWS hazard across its updates. Each NWS update
 * (CON/EXT/EXA…) is a new message with a new id, so keying on the id would
 * re-email the same warning every time the office touches it. The VTEC event
 * (office + phenomena + significance + ETN, plus the year since ETNs reset
 * annually) stays the same for the life of the hazard.
 */
export function nwsAlertKey(alert) {
  const vtec = alert?.vtec?.[0];
  if (vtec) {
    const yearSource = vtec.ends !== '000000T0000Z' ? vtec.ends : vtec.begins;
    const year = yearSource !== '000000T0000Z'
      ? `20${yearSource.slice(0, 2)}`
      : String(new Date(alert.sent || Date.now()).getUTCFullYear());
    return `alert:vtec:${vtec.office}.${vtec.phenomena}.${vtec.significance}.${vtec.etn}.${year}`;
  }
  return alert?.id ? `alert:${alert.id}` : null;
}

/** Normalize an api.weather.gov alert Feature. */
export function normalizeNwsAlert(feature) {
  const p = feature?.properties || {};
  const vtec = (p.parameters?.VTEC || []).map(parseVtec).filter(Boolean);
  return {
    id: p.id || feature?.id || null,
    event: p.event || '',
    headline: p.headline || '',
    messageType: p.messageType || '',
    sent: p.sent || null,
    ends: p.ends || null,
    expires: p.expires || null,
    geometry: feature?.geometry || null,
    vtec,
  };
}

/** False for cancelled, expired, or upgraded alerts. */
export function isAlertActive(alert, now = Date.now()) {
  if (!alert) return false;
  if (alert.messageType === 'Cancel') return false;
  const end = Date.parse(alert.ends || alert.expires || '');
  if (Number.isFinite(end) && end <= now) return false;
  if (alert.vtec?.length && alert.vtec.every((v) => ENDED_VTEC_ACTIONS.has(v.action))) return false;
  return true;
}

/**
 * Does this alert affect the location? `coversPoint` comes from the
 * per-point NWS query (zone- and polygon-based alerts that contain the
 * location itself); otherwise the alert's polygon must intersect the radius.
 */
export function alertAffectsLocation(alert, location, { coversPoint = false } = {}) {
  if (coversPoint) return true;
  return geometryIntersectsCircle(
    alert?.geometry,
    location.latitude,
    location.longitude,
    locationRadiusMiles(location),
  );
}

// ── Email content ───────────────────────────────────────────────────────────

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function fireEmail({ fire, location, miles, appUrl }) {
  const radius = locationRadiusMiles(location);
  return {
    subject: `Wildfire near ${location.name}: ${fire.name}`,
    title: `${fire.name} — ${Math.round(miles)} mi from ${location.name}`,
    html: `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="color: #ea580c;">Wildfire near ${escapeHtml(location.name)}</h2>
      <p><strong>${escapeHtml(fire.name)}</strong> is approximately ${Math.round(miles)} miles from your saved location "${escapeHtml(location.name)}".</p>
      <p><a href="${appUrl}" style="color: #ea580c;">Open Sentinel to view it on the map →</a></p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
        You're receiving this because wildfire alerts within ${radius} miles are enabled for "${escapeHtml(location.name)}".
        Manage your notification preferences in your Sentinel account settings.
      </p>
    </div>
  `,
  };
}

export function alertEmail({ alert, location, coversPoint, appUrl }) {
  const radius = locationRadiusMiles(location);
  const where = coversPoint ? 'for' : 'near';
  return {
    subject: `${alert.event} ${where} ${location.name}`,
    title: `${alert.event} — ${location.name}`,
    html: `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="color: #dc2626;">${escapeHtml(alert.event)} ${where} ${escapeHtml(location.name)}</h2>
      <p>A <strong>${escapeHtml(alert.event)}</strong> is in effect ${coversPoint
        ? `for your saved location "${escapeHtml(location.name)}"`
        : `within ${radius} miles of your saved location "${escapeHtml(location.name)}"`}.</p>
      ${alert.headline ? `<p>${escapeHtml(alert.headline)}</p>` : ''}
      <p><a href="${appUrl}" style="color: #dc2626;">Open Sentinel for details →</a></p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
        You're receiving this because you subscribed to "${escapeHtml(alert.event)}" alerts for "${escapeHtml(location.name)}".
        Manage your notification preferences in your Sentinel account settings.
      </p>
    </div>
  `,
  };
}

// ── Pipeline ────────────────────────────────────────────────────────────────

/**
 * Delivery failures worth retrying next run: network errors, throttling,
 * 5xx, and 401/403 — Resend uses those for sender-side misconfiguration
 * (bad API key, unverified from-domain), which gets fixed without the
 * recipient changing. Anything else (e.g. 422 invalid recipient) is final.
 */
export function isRetryableDeliveryError(err) {
  const status = Number(err?.status);
  return !Number.isFinite(status) || status === 401 || status === 403 || status === 429 || status >= 500;
}

async function mapWithConcurrency(items, limit, fn) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Run one notification pass.
 *
 * deps:
 *   fetchMonitoredLocations() → rows from get_monitored_saved_locations()
 *   fetchActiveFires()        → [{ id, name, lat, lng }]
 *   fetchActiveAlerts(types)  → NWS alert Features of those event types
 *   fetchPointAlerts(lat, lng)→ NWS alert Features covering that point
 *   claimNotification(row)    → { isNew, id } (insert-or-ignore notification_log)
 *   releaseNotification(id)   → delete a claim so the next run retries it
 *   sendEmail({ to, subject, html })  throws (err.status optional) on failure
 *   log(event, fields)        structured logger; never pass emails here
 *   appUrl, now, concurrency
 */
export async function runNotificationSync(deps) {
  const {
    fetchMonitoredLocations, fetchActiveFires, fetchActiveAlerts, fetchPointAlerts,
    claimNotification, releaseNotification, sendEmail,
    log = () => {}, appUrl = '', now = Date.now(), concurrency = 4,
  } = deps;

  const counts = {
    locationsEvaluated: 0, matched: 0, sent: 0, duplicates: 0, failed: 0, skippedInvalid: 0,
  };

  const rows = await fetchMonitoredLocations();
  const locations = [];
  for (const loc of rows || []) {
    if (!isValidCoordinate(loc?.latitude, loc?.longitude)) {
      counts.skippedInvalid++;
      log('location_invalid_coordinates', { locationId: loc?.id });
      continue;
    }
    if (!loc.email) {
      counts.skippedInvalid++;
      log('location_no_delivery_address', { locationId: loc.id });
      continue;
    }
    if (!Number.isFinite(Number(loc.notify_radius_miles))) {
      log('location_missing_radius', { locationId: loc.id, fallbackMiles: DEFAULT_RADIUS_MILES });
    }
    locations.push(loc);
  }
  counts.locationsEvaluated = locations.length;
  log('locations_loaded', { monitored: locations.length, skipped: counts.skippedInvalid });
  if (!locations.length) return counts;

  async function deliver({ location, kind, subjectKey, email }) {
    const ctx = { locationId: location.id, kind, subjectKey };
    counts.matched++;
    log('location_matched', ctx);

    let claim;
    try {
      claim = await claimNotification({
        user_id: location.user_id,
        saved_location_id: location.id,
        kind,
        subject_key: subjectKey,
        title: email.title,
      });
    } catch (err) {
      // Without a claim we can't guarantee no duplicate, so don't send.
      counts.failed++;
      log('notification_claim_failed', { ...ctx, error: String(err?.message || err).slice(0, 200) });
      return;
    }
    if (!claim?.isNew) {
      counts.duplicates++;
      log('duplicate_suppressed', ctx);
      return;
    }

    log('notification_queued', ctx);
    try {
      await sendEmail({ to: location.email, subject: email.subject, html: email.html });
      counts.sent++;
      log('notification_sent', ctx);
    } catch (err) {
      counts.failed++;
      const retry = isRetryableDeliveryError(err);
      log('notification_failed', { ...ctx, status: err?.status ?? null, retry, error: String(err?.message || err).slice(0, 200) });
      if (retry && claim.id) {
        await Promise.resolve(releaseNotification(claim.id)).catch((releaseErr) => {
          log('notification_release_failed', { ...ctx, error: String(releaseErr?.message || releaseErr) });
        });
      }
    }
  }

  // ── Fires ──
  const fireLocations = locations.filter((l) => l.notify_new_fires !== false);
  const disabledFire = locations.length - fireLocations.length;
  if (disabledFire) log('fire_notifications_disabled', { locations: disabledFire });

  if (fireLocations.length) {
    const fires = await fetchActiveFires();
    log('fire_events_received', { fires: fires.length, locations: fireLocations.length });
    for (const location of fireLocations) {
      let outside = 0;
      for (const fire of fires) {
        const miles = fireDistanceWithinRadius(fire, location);
        if (miles == null) { outside++; continue; }
        await deliver({
          location,
          kind: 'new_fire',
          subjectKey: `fire:${fire.id}`,
          email: fireEmail({ fire, location, miles, appUrl }),
        });
      }
      log('fires_outside_radius', { locationId: location.id, radiusMiles: locationRadiusMiles(location), count: outside });
    }
  }

  // ── NWS alerts ──
  const alertLocations = locations.filter((l) => Array.isArray(l.nws_alert_types) && l.nws_alert_types.length);
  if (alertLocations.length) {
    const allTypes = [...new Set(alertLocations.flatMap((l) => l.nws_alert_types))];

    // Polygon alerts anywhere, for "within radius" matching. One request for
    // every location; a failure here still leaves the per-point check below.
    let regional = [];
    try {
      regional = (await fetchActiveAlerts(allTypes))
        .map(normalizeNwsAlert)
        .filter((a) => isAlertActive(a, now) && a.geometry);
    } catch (err) {
      log('nws_regional_fetch_failed', { error: String(err?.message || err).slice(0, 200) });
    }
    log('nws_events_received', { regionalAlerts: regional.length, locations: alertLocations.length, types: allTypes.length });

    await mapWithConcurrency(alertLocations, concurrency, async (location) => {
      const wanted = new Set(location.nws_alert_types);
      const candidates = new Map(); // dedup key → { alert, coversPoint }

      let pointAlerts = [];
      try {
        pointAlerts = (await fetchPointAlerts(location.latitude, location.longitude)).map(normalizeNwsAlert);
      } catch (err) {
        log('nws_point_fetch_failed', { locationId: location.id, error: String(err?.message || err).slice(0, 200) });
      }
      for (const alert of pointAlerts) {
        const key = nwsAlertKey(alert);
        if (!key || !wanted.has(alert.event) || !isAlertActive(alert, now)) continue;
        candidates.set(key, { alert, coversPoint: true });
      }

      let outside = 0;
      for (const alert of regional) {
        const key = nwsAlertKey(alert);
        if (!key || !wanted.has(alert.event) || candidates.has(key)) continue;
        if (alertAffectsLocation(alert, location)) candidates.set(key, { alert, coversPoint: false });
        else outside++;
      }
      log('nws_outside_radius', { locationId: location.id, radiusMiles: locationRadiusMiles(location), count: outside });

      for (const [subjectKey, { alert, coversPoint }] of candidates) {
        await deliver({
          location,
          kind: 'nws_alert',
          subjectKey,
          email: alertEmail({ alert, location, coversPoint, appUrl }),
        });
      }
    });
  }

  log('run_summary', counts);
  return counts;
}
