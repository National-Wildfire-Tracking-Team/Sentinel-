/**
 * fireDangerAlerts.js
 * Fire danger checks for saved locations, run by notification-sync inside
 * runNotificationSync (savedLocationAlerts.js), through the same claim /
 * de-duplication / Resend delivery as fire and NWS alerts:
 *
 *   1. NWCG 7-day Significant Fire Potential (official): a Predictive Service
 *      Area that intersects the location's radius is at or above the
 *      location's chosen level on any of its chosen forecast days. Areas not
 *      yet issued for a date (isvalid 0) never match.
 *   2. 100-hour dead fuel moisture: the nearest FEMS NFDRS station with a
 *      current observed day, within 40 km, is below the location's own
 *      threshold. There is no default threshold: fuels and normal ranges
 *      differ by region, so each user sets theirs.
 *
 * Classification mirrors src/app/api/fireDanger/significantFirePotential.js
 * (Tests/Vitest/fireDangerAlerts.test.js keeps them equal). Plain runtime-
 * neutral ESM: runs in Deno, Node and Vitest.
 */

import { geometryIntersectsCircle, haversineMiles } from './radiusFilter.js';

export const SFP_QUERY_BASE = 'https://fsapps.nwcg.gov/psp/arcgis/rest/services/npsg/outlooks_forecast/MapServer';
export const SFP_SOURCE_URL = 'https://www.nifc.gov/nicc/predictive-services/outlooks';
export const FEMS_SOURCE_URL = 'https://fems.fs2c.usda.gov';
export const STATION_MAX_KM = 40;
/** Stations whose observed day is this many days behind the newest are not current. */
export const STATION_STALE_DAYS = 2;

export const SFP_LEVELS = {
  3: 'Moderate risk',
  4: 'High risk',
  5: 'High risk (lightning or recreation)',
};

const CLASS_RANK = { nodata: 0, little: 1, low: 2, moderate: 3, highOrange: 4, highRed: 5 };
const CLASS_LABEL = {
  moderate: 'Moderate risk',
  highOrange: 'High risk · wind or burn environment',
  highRed: 'High risk · lightning or recreation',
};
const DRYNESS_CLASS = { 0: 'nodata', 1: 'little', 2: 'low', 3: 'moderate' };

/** Same rules as the map: unissued areas and unknown codes are unrated (null). */
export function classifySfp(props = {}) {
  if (Number(props.isvalid) !== 1) return null;
  const trigger = String(props.type ?? '').toUpperCase();
  if (trigger === 'IGNITION') return 'highRed';
  if (trigger === 'CRITICAL') return 'highOrange';
  return DRYNESS_CLASS[Number(props.drynesscode)] ?? null;
}

export function sfpQueryUrl(day) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'drynesscode,type,isvalid,timestampdate,nat_code,gacc',
    returnGeometry: 'true',
    outSR: '4326',
    maxAllowableOffset: '0.01',
    geometryPrecision: '4',
    f: 'geojson',
  });
  return `${SFP_QUERY_BASE}/${day - 1}/query?${params}`;
}

/** The highest-rated issued area intersecting the location's radius on one day, or null. */
export function worstAreaNear(features, location, radiusMiles) {
  let worst = null;
  for (const f of features || []) {
    const cls = classifySfp(f.properties);
    if (!cls) continue;
    if (!geometryIntersectsCircle(f.geometry, location.latitude, location.longitude, radiusMiles)) continue;
    const rank = CLASS_RANK[cls];
    if (!worst || rank > worst.rank) {
      const ts = Number(f.properties.timestampdate);
      worst = {
        cls,
        rank,
        label: CLASS_LABEL[cls] ?? cls,
        psa: f.properties.nat_code ?? null,
        gacc: f.properties.gacc ?? null,
        date: Number.isFinite(ts) && ts > 0 ? new Date(ts).toISOString().slice(0, 10) : null,
      };
    }
  }
  return worst;
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** Nearest station with a current observed day and a 100-h value, within STATION_MAX_KM. */
export function nearestCurrentStation(stations, latestObservedDate, lat, lng) {
  let best = null;
  for (const f of stations?.features ?? []) {
    const p = f.properties || {};
    if (p.fm100 == null || !p.observedDate || !latestObservedDate) continue;
    if (daysBetween(p.observedDate, latestObservedDate) > STATION_STALE_DAYS) continue;
    const [x, y] = f.geometry?.coordinates ?? [];
    const km = haversineMiles(lat, lng, y, x) * 1.609344;
    if (km <= STATION_MAX_KM && (!best || km < best.km)) best = { station: p, km };
  }
  return best;
}

/** ISO week label (e.g. 2026-W43) so a dry spell emails at most once a week per station. */
export function isoWeek(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function firePotentialEmail({ area, day, location, radiusMiles, appUrl }) {
  return {
    subject: `${area.label.split(' · ')[0]} fire potential near ${location.name}${area.date ? ` (${area.date})` : ''}`,
    title: `${area.label} — ${location.name}`,
    html: `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="color: #ea580c;">${esc(area.label)}</h2>
      <p>NWCG Predictive Services rates significant fire potential as <strong>${esc(area.label)}</strong>
        ${area.date ? `for <strong>${esc(area.date)}</strong> (forecast day ${day})` : `for forecast day ${day}`}
        in Predictive Service Area ${esc(area.psa ?? '')}${area.gacc ? ` (${esc(area.gacc)})` : ''},
        within ${radiusMiles} miles of your saved location "${esc(location.name)}".</p>
      <p>This is the official 7-Day Significant Fire Potential outlook, not a warning. Check local fire restrictions and NWS fire weather products.</p>
      <p><a href="${appUrl}" style="color: #ea580c;">Open Sentinel's Fire Danger &amp; Fuels map →</a> ·
        <a href="${SFP_SOURCE_URL}" style="color: #ea580c;">NWCG source</a></p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
        You're receiving this because fire potential alerts at "${esc(SFP_LEVELS[location.notify_fire_potential_min] ?? '')}" or higher
        are on for "${esc(location.name)}". Manage them in your Sentinel account settings.
      </p>
    </div>
  `,
  };
}

export function fuelMoistureEmail({ station, km, location, threshold, appUrl }) {
  return {
    subject: `Dry fuels near ${location.name}: 100-hour fuel moisture ${station.fm100}%`,
    title: `100-hour fuel moisture ${station.fm100}% at ${station.name}`,
    html: `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="color: #ea580c;">Dry fuels near ${esc(location.name)}</h2>
      <p>The NFDRS station <strong>${esc(station.name)}${station.state ? `, ${esc(station.state)}` : ''}</strong>,
        ${Math.round(km)} km from "${esc(location.name)}", reported 100-hour dead fuel moisture of
        <strong>${esc(station.fm100)}%</strong> on ${esc(station.observedDate)}, below the ${esc(threshold)}% you set.</p>
      ${station.erc != null ? `<p>Energy Release Component that day: ${esc(station.erc)} (NFDRS 2016, fuel model Y).</p>` : ''}
      <p>Computed by the USDA Forest Service FEMS for that station; it applies at the station, not everywhere around it.</p>
      <p><a href="${appUrl}" style="color: #ea580c;">Open Sentinel's Fire Danger &amp; Fuels map →</a> ·
        <a href="${FEMS_SOURCE_URL}" style="color: #ea580c;">FEMS</a></p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
        You're receiving this because a 100-hour fuel moisture alert below ${esc(threshold)}% is on for "${esc(location.name)}".
        You'll get at most one a week per station. Manage it in your Sentinel account settings.
      </p>
    </div>
  `,
  };
}

/**
 * Run both checks. `deliver` is runNotificationSync's claim-and-send.
 * deps: fetchFirePotential(day) → GeoJSON Features, fetchFireDangerStations()
 * → { stations, latestObservedDate } or null when not configured.
 */
export async function runFireDangerChecks({ locations, deliver, fetchFirePotential, fetchFireDangerStations, radiusOf, log, appUrl }) {
  const sfpLocations = locations.filter((l) => l.notify_fire_potential_min != null);
  const fmLocations = locations.filter((l) => l.notify_fm100_below != null);

  if (sfpLocations.length && fetchFirePotential) {
    const maxDays = Math.max(...sfpLocations.map((l) => Math.min(7, Math.max(1, Number(l.notify_fire_potential_days) || 1))));
    const byDay = new Map();
    for (let day = 1; day <= maxDays; day++) {
      try {
        byDay.set(day, await fetchFirePotential(day));
      } catch (err) {
        log('fire_potential_fetch_failed', { day, error: String(err?.message || err).slice(0, 200) });
      }
    }
    for (const location of sfpLocations) {
      const radius = radiusOf(location);
      const days = Math.min(7, Math.max(1, Number(location.notify_fire_potential_days) || 1));
      for (let day = 1; day <= days; day++) {
        const features = byDay.get(day);
        if (!features) continue;
        const area = worstAreaNear(features, location, radius);
        if (!area || area.rank < Number(location.notify_fire_potential_min) || !area.date) continue;
        await deliver({
          location,
          kind: 'fire_danger',
          // One email per area, date and level: an upgrade (moderate → high) sends again.
          subjectKey: `sfp:${area.psa}:${area.date}:${area.cls}`,
          email: firePotentialEmail({ area, day, location, radiusMiles: radius, appUrl }),
        });
      }
    }
  }

  if (fmLocations.length && fetchFireDangerStations) {
    let data = null;
    try {
      data = await fetchFireDangerStations();
    } catch (err) {
      log('fire_danger_stations_fetch_failed', { error: String(err?.message || err).slice(0, 200) });
    }
    if (!data) {
      log('fire_danger_stations_unavailable', { locations: fmLocations.length });
      return;
    }
    for (const location of fmLocations) {
      const threshold = Number(location.notify_fm100_below);
      const near = nearestCurrentStation(data.stations, data.latestObservedDate, location.latitude, location.longitude);
      if (!near || !(near.station.fm100 < threshold)) continue;
      await deliver({
        location,
        kind: 'fire_danger',
        subjectKey: `fm100:${near.station.id}:${isoWeek(near.station.observedDate)}`,
        email: fuelMoistureEmail({ station: near.station, km: near.km, location, threshold, appUrl }),
      });
    }
  }
}
