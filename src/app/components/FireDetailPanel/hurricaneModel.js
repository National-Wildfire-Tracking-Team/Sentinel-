/**
 * hurricaneModel.js
 * Pure helpers behind the hurricane incident panel (HurricaneSidebar.jsx):
 * reads one storm's slice of the NHC layers (see api/nhcTropicalWeather.js)
 * into display-ready values. Nothing here invents data — anything the NHC
 * feed doesn't carry comes back null/empty and the panel says so.
 */

import { WATCH_WARNING_COLORS, WIND_PROB_BANDS } from '../../api/nhcTropicalWeather';
import { nwsAlertColor } from '../../utils/nwsColors';
import { polygonCentroid } from '../../utils/geoUtils';

const KT_TO_MPH = 1.15078;
const NM_TO_MI = 1.15078;

// Most to least severe; also the order of the watch/warning cards.
export const WATCH_WARNING_ORDER = [
  'Hurricane Warning', 'Hurricane Watch', 'Tropical Storm Warning', 'Tropical Storm Watch',
];

const forSlot = (fc, slot) => (fc?.features ?? []).filter((f) => f.properties?.slot === slot);

// ─── Dates ───────────────────────────────────────────────────────────────────

// Time zones NHC labels advisories with (hours from UTC).
const TZ_OFFSETS = {
  UTC: 0, GMT: 0, CVT: -1, AST: -4, ADT: -3, EST: -5, EDT: -4, CST: -6, CDT: -5,
  MST: -7, MDT: -6, PST: -8, PDT: -7, AKST: -9, AKDT: -8, HST: -10, CHST: 10,
};
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const to24h = (h, ampm) => (h % 12) + (ampm === 'PM' ? 12 : 0);

/** Advisory date ("800 AM PDT Tue Oct 06 2026") → Date, or null. */
export function parseAdvisoryDate(text) {
  const m = String(text ?? '').trim().toUpperCase()
    .match(/^(\d{1,2})(\d{2})\s+(AM|PM)\s+([A-Z]{2,4})\s+[A-Z]{3}\s+([A-Z]{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (!m) return null;
  const [, hh, mm, ampm, tz, mon, day, year] = m;
  const month = MONTHS.indexOf(mon);
  if (month < 0 || !(tz in TZ_OFFSETS)) return null;
  return new Date(Date.UTC(+year, month, +day, to24h(+hh, ampm), +mm) - TZ_OFFSETS[tz] * 3_600_000);
}

/**
 * Forecast point full label ("2026-10-06 5:00 AM Tue PDT") → its local wall
 * time and UTC offset, the anchor for reading NHC's weekday-only labels.
 */
export function parseForecastLabel(text) {
  const m = String(text ?? '').trim().toUpperCase()
    .match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s+(AM|PM)\s+([A-Z]{3})\s+([A-Z]{2,4})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, ampm, wd, tz] = m;
  if (!(tz in TZ_OFFSETS)) return null;
  return {
    year: +y, month: +mo - 1, day: +d, hour: to24h(+h, ampm), minute: +mi,
    weekday: WEEKDAYS.indexOf(wd), offsetHours: TZ_OFFSETS[tz],
  };
}

/**
 * Arrival-time label ("Tue 2 pm", in the advisory's local time) → Date,
 * taking the first such weekday on or after the anchor's.
 */
export function resolveArrivalTime(label, anchor) {
  const m = String(label ?? '').trim().toUpperCase().match(/^([A-Z]{3})\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!m || !anchor || anchor.weekday < 0) return null;
  const weekday = WEEKDAYS.indexOf(m[1]);
  if (weekday < 0) return null;
  const daysAhead = (weekday - anchor.weekday + 7) % 7;
  const localMs = Date.UTC(anchor.year, anchor.month, anchor.day + daysAhead, to24h(+m[2], m[4]), +(m[3] ?? 0));
  return new Date(localMs - anchor.offsetHours * 3_600_000);
}

/** "in 18 hr", "in 3 days", "now", "5 hr ago". */
export function formatHoursFromNow(date, now = Date.now()) {
  const hours = Math.round((date.getTime() - now) / 3_600_000);
  if (hours === 0) return 'now';
  const abs = Math.abs(hours);
  const span = abs < 48 ? `${abs} hr` : `${Math.round(abs / 24)} days`;
  return hours > 0 ? `in ${span}` : `${span} ago`;
}

// ─── Watches & warnings ──────────────────────────────────────────────────────

// Watches/warnings are reissued with every advisory while in effect; a
// segment from well before the current advisory is left over in the
// service after they ended (seen live: advisory 13A segments six days on).
const STALE_WATCH_WARNING_MS = 12 * 3_600_000;

/**
 * One entry per watch/warning type in effect for the storm, most severe
 * first. NHC's layer carries coastline segments without place names, so
 * the area is the segment count (the map shows where).
 * @param {string} [currentAdvisoryDate] The storm's latest advisory date; older segments are dropped.
 */
export function stormWatchWarnings(watchWarningFC, slot, currentAdvisoryDate) {
  const current = parseAdvisoryDate(currentAdvisoryDate);
  const byType = new Map();
  for (const f of forSlot(watchWarningFC, slot)) {
    const p = f.properties;
    if (!WATCH_WARNING_ORDER.includes(p.wwType)) continue;
    const issued = parseAdvisoryDate(p.advisoryDate);
    if (current && issued && current - issued > STALE_WATCH_WARNING_MS) continue;
    const entry = byType.get(p.wwType) ?? {
      type: p.wwType,
      color: WATCH_WARNING_COLORS[p.wwType],
      segments: 0,
      advisoryNum: p.advisoryNum || '',
      advisoryDate: p.advisoryDate || '',
    };
    entry.segments += 1;
    byType.set(p.wwType, entry);
  }
  return WATCH_WARNING_ORDER.filter((t) => byType.has(t)).map((t) => byType.get(t));
}

function listText(items) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// The order NHC's public advisory lists them in: hurricane hazards first.
const ADVISORY_ORDER = [
  'Storm Surge Warning', 'Hurricane Warning', 'Storm Surge Watch', 'Hurricane Watch',
  'Tropical Storm Warning', 'Tropical Storm Watch',
];

/**
 * Headline from the public advisory's watches and warnings, most severe
 * two: "Hurricane Watch from Ensenada to the U.S./Mexico border. Tropical
 * Storm Warning for Punta Eugenia to Ensenada and Isla Guadalupe." or null.
 * @param {{ type: string, areas: string[] }[]} watchWarnings from parseTcp
 */
export function advisoryHeadline(watchWarnings) {
  if (!watchWarnings?.length) return null;
  const rank = (t) => {
    const i = ADVISORY_ORDER.indexOf(t);
    return i < 0 ? ADVISORY_ORDER.length : i;
  };
  return [...watchWarnings]
    .sort((a, b) => rank(a.type) - rank(b.type))
    .slice(0, 2)
    .map((w) => (w.areas.length === 1 && / to /i.test(w.areas[0])
      ? `${w.type} from ${w.areas[0]}.`
      : `${w.type} for ${listText(w.areas)}.`))
    .join(' ');
}

/** "Hurricane Warning and Tropical Storm Watch in effect", or null. */
export function watchWarningHeadline(watchWarnings) {
  const types = watchWarnings.map((w) => w.type);
  if (types.length === 0) return null;
  const list = types.length === 1 ? types[0]
    : `${types.slice(0, -1).join(', ')} and ${types[types.length - 1]}`;
  return `${list} in effect`;
}

// ─── Intensity ───────────────────────────────────────────────────────────────

/** "Category 3" → "CAT 3", "Tropical Storm" → "TS", "Tropical Depression" → "TD". */
export function categoryShort(category) {
  const cat = String(category ?? '').match(/^Category (\d)$/);
  if (cat) return `CAT ${cat[1]}`;
  return { 'Tropical Storm': 'TS', 'Tropical Depression': 'TD' }[category] ?? category ?? '';
}

/** Forecast point label ("5:00 PM Tue") → "Tue 5 PM"; other labels as they are. */
export function shortTimeLabel(label) {
  const m = String(label ?? '').trim().match(/^(\d{1,2}):(\d{2})\s+(AM|PM)\s+(\w{3})$/i);
  if (!m) return label ?? '';
  return `${m[4]} ${Number(m[1])}${m[2] === '00' ? '' : `:${m[2]}`} ${m[3].toUpperCase()}`;
}

/**
 * Forecast points from now on, in time order, with NHC's note for that
 * point from the discussion's forecast table ("inland", "post-tropical").
 * @param {Record<number, string>} [tauNotes] from parseTcd
 */
export function forecastIntensity(forecastPointsFC, slot, tauNotes = {}) {
  return forSlot(forecastPointsFC, slot)
    .map((f) => f.properties)
    .filter((p) => p.tau >= 0)
    .sort((a, b) => a.tau - b.tau)
    .map((p) => ({
      tau: p.tau,
      category: p.category,
      timeLabel: shortTimeLabel(p.dateLabel || p.fullDateLabel),
      note: tauNotes[p.tau] ?? null,
      windMph: p.maxWindMph,
    }));
}

/** The storm's current (lowest-tau) forecast point properties, or null. */
export function currentForecastPoint(forecastPointsFC, slot) {
  const points = forSlot(forecastPointsFC, slot).map((f) => f.properties);
  if (points.length === 0) return null;
  return points.reduce((a, b) => ((b.tau ?? Infinity) < (a.tau ?? Infinity) ? b : a));
}

function dtgToMs(dtg) {
  const s = String(dtg);
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10));
}

/**
 * Pressure change between the two latest best-track fixes that report one:
 * { label: 'Falling' | 'Rising' | 'Steady', changeMb, hours }, or null.
 */
export function pressureTrend(pastPointsFC, slot) {
  const fixes = forSlot(pastPointsFC, slot)
    .map((f) => f.properties)
    .filter((p) => p.dtg != null && Number.isFinite(p.mslp))
    .sort((a, b) => a.dtg - b.dtg);
  if (fixes.length < 2) return null;
  const [prev, last] = fixes.slice(-2);
  const hours = Math.round((dtgToMs(last.dtg) - dtgToMs(prev.dtg)) / 3_600_000);
  if (!(hours > 0)) return null;
  const changeMb = last.mslp - prev.mslp;
  const label = changeMb < 0 ? 'Falling' : changeMb > 0 ? 'Rising' : 'Steady';
  return { label, changeMb, hours };
}

/**
 * How far each wind threshold reaches from the center now (largest
 * quadrant of the current wind radii), in miles: { 34: 140, 64: 30 }.
 */
export function windFieldExtent(windRadiiFC, slot) {
  const radii = forSlot(windRadiiFC, slot).map((f) => f.properties);
  if (radii.length === 0) return {};
  const nowTau = Math.min(...radii.map((p) => p.tau ?? 0));
  const extent = {};
  for (const p of radii) {
    if ((p.tau ?? 0) !== nowTau || !p.radiiKt) continue;
    const nm = Math.max(...['ne', 'se', 'sw', 'nw'].map((q) => Number(p[q])).filter(Number.isFinite));
    if (!Number.isFinite(nm) || nm <= 0) continue;
    extent[p.radiiKt] = Math.max(extent[p.radiiKt] ?? 0, Math.round(nm * NM_TO_MI));
  }
  return extent;
}

export const ktToMph = (kt) => Math.round(kt * KT_TO_MPH);

// ─── Wind & arrival products ─────────────────────────────────────────────────

/** The WIND_PROB_BANDS entry a percentage falls in (null under 5%). */
export function windProbBand(percent) {
  if (!Number.isFinite(percent) || percent < 5) return null;
  return WIND_PROB_BANDS[Math.min(10, Math.floor(percent / 10) + 1)];
}

/** Probability bands present in the wind-probability layer, highest first. */
export function windProbBandsPresent(windProbFC) {
  const present = new Set((windProbFC?.features ?? []).map((f) => f.properties?.percentage));
  return WIND_PROB_BANDS.filter((b) => b.color && present.has(b.value)).reverse();
}

/**
 * Arrival-time contours for the storm, earliest first:
 * [{ label: 'Tue 2 pm', at: Date | null }].
 */
export function arrivalTimes(arrivalFC, slot, anchor) {
  const labels = [...new Set(forSlot(arrivalFC, slot).map((f) => f.properties.arrivalTime).filter(Boolean))];
  const rows = labels.map((label) => ({ label, at: resolveArrivalTime(label, anchor) }));
  return rows.every((r) => r.at) ? rows.sort((a, b) => a.at - b.at) : rows;
}

// ─── Affected areas (NWS tropical alerts × county population) ────────────────

// NWS tropical alert types, most to least severe (warnings before watches).
export const TROPICAL_ALERT_ORDER = [
  'Hurricane Warning', 'Storm Surge Warning', 'Tropical Storm Warning',
  'Hurricane Watch', 'Storm Surge Watch', 'Tropical Storm Watch',
];

/** Map palette for a tropical alert: NHC's for wind, the NWS one for surge. */
export function tropicalAlertColor(type) {
  return WATCH_WARNING_COLORS[type] ?? nwsAlertColor(type);
}

/** VTEC event number ("/O.NEW.KMFL.HU.W.1009.2022..." → 1009), or null. */
function vtecEventNumber(alert) {
  const vtec = alert.parameters?.VTEC?.[0];
  const etn = Number(String(vtec ?? '').split('.')[5]);
  return Number.isFinite(etn) ? etn : null;
}

function distanceSq(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

/**
 * The active NWS tropical alerts for one storm. Tropical alerts share one
 * VTEC event number per storm whose last digits are NHC's storm number;
 * when storms in two basins share a number (or an alert has no VTEC), the
 * nearest storm takes it.
 */
export function stormAlerts(alerts, storm, cyclones) {
  const storms = cyclones?.length ? cyclones : [storm];
  return (alerts ?? []).filter((alert) => {
    if (!TROPICAL_ALERT_ORDER.includes(alert.type)) return false;
    const etn = vtecEventNumber(alert);
    const byNumber = etn != null ? storms.filter((c) => c.stormNumber === etn % 1000) : [];
    const candidates = byNumber.length ? byNumber : etn != null ? [] : storms;
    if (candidates.length <= 1) return candidates[0]?.id === storm.id;
    const center = alert.geometry && polygonCentroid(alert.geometry);
    if (!center) return candidates[0].id === storm.id;
    const nearest = candidates.reduce((a, b) => (
      distanceSq([b.lng, b.lat], center) < distanceSq([a.lng, a.lat], center) ? b : a));
    return nearest.id === storm.id;
  });
}

/**
 * Counties covered by a storm's tropical alerts, most severe first, with
 * population where the county table has it, plus the headline totals.
 * Counts are for whole counties: an alert covering part of a county
 * counts all of it.
 * @param {Record<string, [string, number]>} populations FIPS → [name, population] (countyPopulation.json)
 */
export function affectedCounties(alerts, populations) {
  const byFips = new Map();
  for (const alert of alerts) {
    for (const same of alert.geocode?.SAME ?? []) {
      const fips = String(same).slice(-5);
      if (!/^\d{5}$/.test(fips)) continue;
      const entry = byFips.get(fips) ?? { fips, types: new Set() };
      entry.types.add(alert.type);
      byFips.set(fips, entry);
    }
  }
  const hasPopulation = Object.keys(populations ?? {}).length > 0;
  const rank = (type) => TROPICAL_ALERT_ORDER.indexOf(type);
  const counties = [...byFips.values()].map((c) => {
    const type = [...c.types].sort((a, b) => rank(a) - rank(b))[0];
    const [name, population] = populations?.[c.fips] ?? [null, null];
    return { fips: c.fips, name, population, types: c.types, type, color: tropicalAlertColor(type) };
  }).sort((a, b) => rank(a.type) - rank(b.type) || (b.population ?? 0) - (a.population ?? 0));

  const peopleUnder = (type) => (hasPopulation
    ? counties.filter((c) => c.types.has(type)).reduce((sum, c) => sum + (c.population ?? 0), 0)
    : null);
  return {
    counties,
    tsWarningPopulation: peopleUnder('Tropical Storm Warning'),
    hurricaneWatchPopulation: peopleUnder('Hurricane Watch'),
  };
}
