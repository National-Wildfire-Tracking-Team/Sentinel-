/**
 * significantFirePotential.js
 * NWCG Predictive Services' National 7-Day Significant Fire Potential, by
 * Predictive Service Area (PSA). This is an official interagency product:
 * labels and colours below follow its published legend and are not
 * recomputed or reinterpreted here.
 *
 * Source:  https://fsapps.nwcg.gov/psp/arcgis/rest/services/npsg/outlooks_forecast/MapServer
 *          (layers 0-6 = Day 1-7), via /api/arcgis/nwcg-sfp
 * Legend:  https://www.nifc.gov/nicc/predictive-services/outlooks
 *          and "Changes to the National Significant Fire Potential 7-Day
 *          Product High-Risk Triggers" (NIFC, 2025)
 *
 * Fields used (as published by the service, 2026-10):
 *   drynesscode   0 no data · 1 little or no risk · 2 low risk · 3 moderate risk
 *   type          null, or the high-risk trigger class: CRITICAL (orange:
 *                 wind / burn environment) or IGNITION (red: lightning /
 *                 recreation). Overrides the dryness colour, as on NIFC's map.
 *   isvalid       0 until the area's forecast is issued for this date (NIFC
 *                 says the product is fully updated by 12:00 MDT daily). The
 *                 service's own renderer hatches these out, so they get no
 *                 rating here either.
 *   timestampdate forecast date (UTC midnight)
 *   nat_code      PSA id, e.g. NC03B
 *   gacc          Geographic Area Coordination Center
 */

import { fetchJson } from './fetchJson';

export const SFP_BASE = '/api/arcgis/nwcg-sfp';
export const SFP_DAYS = [1, 2, 3, 4, 5, 6, 7];
export const SFP_SOURCE = 'NWCG Predictive Services · National 7-Day Significant Fire Potential';
export const SFP_SOURCE_URL = 'https://www.nifc.gov/nicc/predictive-services/outlooks';

// Re-query this often while on. The product changes once or twice a day, but
// areas flip from not-yet-updated to issued through the morning.
export const SFP_REFRESH_MS = 15 * 60 * 1000;

/** Rating classes, lowest → highest, in the colours of NIFC's legend. */
export const SFP_CLASSES = {
  nodata:   { label: 'No data',           color: '#9c9c9c', rank: 0 },
  little:   { label: 'Little or no risk', color: '#5fb336', rank: 1 },
  low:      { label: 'Low risk',          color: '#ffff40', rank: 2 },
  moderate: { label: 'Moderate risk',     color: '#d9b46f', rank: 3 },
  highOrange: {
    label: 'High risk · wind or burn environment',
    color: '#ff8c00',
    rank: 4,
    detail: 'Critical winds with low humidity, or hot, unstable or windy conditions: an elevated chance of significant fires and large fire growth.',
  },
  highRed: {
    label: 'High risk · lightning or recreation',
    color: '#ff0000',
    rank: 5,
    detail: 'A greater than 20% chance of significant fires from thunderstorms, or from human activity over very dry fuels.',
  },
};

/** Areas whose forecast is not issued for this date: drawn, but unrated. */
export const SFP_NOT_UPDATED = {
  label: 'Not yet updated for this date',
  color: '#52525b',
};

const DRYNESS_CLASS = { 0: 'nodata', 1: 'little', 2: 'low', 3: 'moderate' };

/**
 * The rating class for one PSA's attributes, or null when the area has no
 * current forecast (isvalid 0). Never guesses: unknown codes are null too.
 */
export function classifySfp(props = {}) {
  if (Number(props.isvalid) !== 1) return null;
  const trigger = String(props.type ?? '').toUpperCase();
  if (trigger === 'IGNITION') return 'highRed';
  if (trigger === 'CRITICAL') return 'highOrange';
  return DRYNESS_CLASS[Number(props.drynesscode)] ?? null;
}

/** Forecast date as YYYY-MM-DD (the service stores UTC midnight). */
export function sfpForecastDate(timestamp) {
  const ms = Number(timestamp);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Adds the fields the map and inspection panel read; keeps the source's own. */
export function normalizeSfp(data, day) {
  const features = Array.isArray(data?.features) ? data.features : [];
  return {
    type: 'FeatureCollection',
    features: features
      .filter((f) => f?.geometry)
      .map((f, i) => {
        const p = f.properties || {};
        const cls = classifySfp(p);
        return {
          ...f,
          properties: {
            ...p,
            id: `sfp-${day}-${p.nat_code ?? i}`,
            day,
            psa: p.nat_code ?? null,
            sfpClass: cls,
            sfpRank: cls ? SFP_CLASSES[cls].rank : -1,
            sfpColor: cls ? SFP_CLASSES[cls].color : SFP_NOT_UPDATED.color,
            sfpLabel: cls ? SFP_CLASSES[cls].label : SFP_NOT_UPDATED.label,
            forecastDate: sfpForecastDate(p.timestampdate),
          },
        };
      }),
  };
}

/**
 * Summary of one day's collection: the forecast date, and how many areas are
 * issued vs not yet updated (so the UI can say so instead of implying a
 * nationwide rating).
 */
export function summarizeSfp(fc) {
  const features = fc?.features ?? [];
  const dates = new Set(features.map((f) => f.properties.forecastDate).filter(Boolean));
  const issued = features.filter((f) => f.properties.sfpClass).length;
  return {
    forecastDate: dates.size === 1 ? [...dates][0] : null,
    areas: features.length,
    issued,
    notUpdated: features.length - issued,
  };
}

export function sfpQueryUrl(day) {
  if (!SFP_DAYS.includes(day)) throw new Error(`Unsupported fire potential day: ${day}`);
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'drynesscode,type,isvalid,timestampdate,nat_code,gacc,symbol',
    returnGeometry: 'true',
    outSR: '4326',
    // ~1 km simplification and 4 decimals keep a day near 0.5 MB
    maxAllowableOffset: '0.01',
    geometryPrecision: '4',
    f: 'geojson',
  });
  return `${SFP_BASE}/${day - 1}/query?${params.toString()}`;
}

/** Fetch one forecast day (1-7) as a normalized FeatureCollection. */
export async function fetchSignificantFirePotential(day) {
  const data = await fetchJson(sfpQueryUrl(day), `nwcg:sfp:day${day}`, SFP_REFRESH_MS);
  return normalizeSfp(data, day);
}
