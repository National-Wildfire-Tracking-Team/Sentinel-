/**
 * fieldSamples.js
 * Measured live fuel moisture: field samples (clipped, weighed and dried, or
 * probe readings) from the FEMS fuel moisture database, as mirrored by the
 * Northwest Coordination Center on ArcGIS Online (labelled "Testing NWCC Fuel
 * Moisture" by its owner), through /api/arcgis/nwcc-fuel-moisture.
 *
 * Coverage is where crews sample and that mirror carries (2026-10: WA, OR,
 * ID, MT, WY, SD, ND), every week or two per site. Each value is one
 * sample's average for one plant species on one date; nothing is carried
 * between dates or sites. Draft records (which hold 0 until entered) are
 * excluded; values are shown as published, with implausible ones flagged.
 */

import { fetchJson } from './fetchJson';

export const SAMPLES_SOURCE = 'FEMS fuel moisture samples · NWCC mirror (testing)';
export const SAMPLES_SOURCE_URL = 'https://gacc.nifc.gov/nwcc/';
export const SAMPLE_WINDOW_DAYS = 60;
/** Live fuel moisture above this is outside what plants hold; shown but flagged. */
export const IMPLAUSIBLE_PCT = 400;
export const LIVE_CATEGORIES = ['Tree', 'Shrub', 'Grass', 'Forb'];

const QUERY_URL = '/api/arcgis/nwcc-fuel-moisture/0/query';

export function samplesQueryUrl() {
  const params = new URLSearchParams({
    where: `fuel_category IN ('Tree','Shrub','Grass','Forb') AND sample_status IN ('Submitted','Edited') AND sample_date_dt >= CURRENT_TIMESTAMP - ${SAMPLE_WINDOW_DAYS}`,
    outFields: 'site_id,site_name,state_id,elevation,fuel_type,fuel_category,sub_category,method_type,sample_average_value,sample_date',
    outSR: '4326',
    resultRecordCount: '2000',
    f: 'geojson',
  });
  return `${QUERY_URL}?${params}`;
}

/**
 * Sample records → one point per site, with the newest sample of each fuel
 * type (and its date) and the site's newest sample date.
 */
export function groupSamplesBySite(fc) {
  const sites = new Map();
  for (const f of fc?.features ?? []) {
    const p = f.properties || {};
    const coords = f.geometry?.coordinates;
    const value = Number(p.sample_average_value);
    const date = typeof p.sample_date === 'string' ? p.sample_date.slice(0, 10) : null;
    if (!coords || p.site_id == null || !date || !Number.isFinite(value)) continue;
    if (!LIVE_CATEGORIES.includes(p.fuel_category)) continue;
    let site = sites.get(p.site_id);
    if (!site) {
      site = { id: p.site_id, name: p.site_name, state: p.state_id, elevation: p.elevation ?? null, coords, fuels: new Map() };
      sites.set(p.site_id, site);
    }
    const key = `${p.fuel_type}|${p.sub_category ?? ''}`;
    const prev = site.fuels.get(key);
    if (!prev || date > prev.date) {
      site.fuels.set(key, {
        fuel: p.fuel_type,
        category: p.fuel_category,
        part: p.sub_category ?? null,
        method: p.method_type ?? null,
        value,
        date,
        implausible: value > IMPLAUSIBLE_PCT,
      });
    }
  }
  const features = [...sites.values()].map((s) => {
    const fuels = [...s.fuels.values()].sort((a, b) => (b.date.localeCompare(a.date)) || a.fuel.localeCompare(b.fuel));
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: s.coords },
      properties: {
        id: s.id, name: s.name, state: s.state, elevation: s.elevation,
        latestDate: fuels[0]?.date ?? null,
        // GeoJSON properties must be flat for Mapbox; the list is re-parsed by the panel.
        fuels: JSON.stringify(fuels),
      },
    };
  });
  return { type: 'FeatureCollection', features };
}

export async function fetchFieldSamples() {
  const raw = await fetchJson(samplesQueryUrl(), 'nwcc:fuel-moisture', 30 * 60 * 1000);
  return groupSamplesBySite(raw);
}

/** A site's fuel list (Mapbox hands back properties as strings). */
export function siteFuels(props) {
  try {
    return typeof props.fuels === 'string' ? JSON.parse(props.fuels) : (props.fuels ?? []);
  } catch {
    return [];
  }
}

/** Days from `ymd` to `today` (both YYYY-MM-DD). */
export function ageDays(ymd, today) {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${ymd}T00:00:00Z`)) / 86400000);
}
