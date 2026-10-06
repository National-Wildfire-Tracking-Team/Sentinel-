/**
 * modelTheme.js
 * Weather Models' visual identity and time vocabulary.
 *
 * Each model has one colour, used for its lines, badge and map marks and
 * never for anything else (fire orange stays Sentinel's incident colour).
 * The pair was checked with the dataviz palette validator in light and
 * dark mode: colour-blind separation ΔE ≥ 13, contrast ≥ 3:1 on both surfaces.
 *
 * Model output is drawn with a dashed outline throughout Weather Models,
 * so a forecast is visibly not an observation.
 */

export const MODEL_STYLE = {
  hrrr: {
    label: 'HRRR',
    // CSS variable set on the page root (light/dark steps in WeatherModelsPage)
    color: 'var(--wm-hrrr)',
    text: 'text-[#2a78d6] dark:text-[#3987e5]',
    border: 'border-[#2a78d6] dark:border-[#3987e5]',
    hexDark: '#3987e5',
    hexLight: '#2a78d6',
    blurb: '3 km · continental U.S. · hourly to 48 h',
  },
  gfs: {
    label: 'GFS',
    color: 'var(--wm-gfs)',
    text: 'text-[#d55181]',
    border: 'border-[#d55181]',
    hexDark: '#d55181',
    hexLight: '#d55181',
    blurb: '0.25° (~25 km) · global · to 16 days',
  },
};
import { withClock } from '../../utils/formatUtils';

export const ROOT_VARS = '[--wm-hrrr:#2a78d6] dark:[--wm-hrrr:#3987e5] [--wm-gfs:#d55181]';

export const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function compassPoint(deg) {
  if (deg == null || !Number.isFinite(deg)) return null;
  return COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

const toDate = (iso) => (iso ? new Date(iso) : null);

/** "12Z" — model runs are named by their UTC hour. */
export function zulu(iso) {
  const d = toDate(iso);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return `${String(d.getUTCHours()).padStart(2, '0')}Z`;
}

/** "Thu 12Z" */
export function dayZulu(iso) {
  const d = toDate(iso);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })} ${zulu(iso)}`;
}

/** "Thu 2 PM" in the viewer's own time zone. */
export function localTime(iso, opts = {}) {
  const d = toDate(iso);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, withClock({ weekday: 'short', hour: 'numeric', ...opts }));
}

export function forecastHourLabel(h) {
  return h == null ? '—' : `+${h} h`;
}

export function ageLabel(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${minutes} min old`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min old` : `${h} h old`;
}

/** Index of the entry whose validTime is the current hour (or the first after it). */
export function nowIndex(forecast, nowMs = Date.now()) {
  if (!forecast?.length) return 0;
  const hourStart = Math.floor(nowMs / 3_600_000) * 3_600_000;
  const i = forecast.findIndex((e) => Date.parse(e.validTime) >= hourStart);
  return i === -1 ? forecast.length - 1 : i;
}

export function entryAt(forecast, validTime) {
  return forecast?.find((e) => e.validTime === validTime) ?? null;
}

export function formatValue(value, unit, { decimals } = {}) {
  if (value == null || !Number.isFinite(value)) return '—';
  const n = decimals != null ? value.toFixed(decimals) : String(value);
  if (unit === '°F' || unit === '°C' || unit === '%' || unit === '°') return `${n}${unit}`;
  return `${n} ${unit}`;
}

/** Ray-casting point-in-polygon on a GeoJSON Polygon's outer ring. */
export function insidePolygon(polygon, lat, lon) {
  const ring = polygon?.coordinates?.[0];
  if (!ring) return true; // unknown coverage: let the service decide
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
