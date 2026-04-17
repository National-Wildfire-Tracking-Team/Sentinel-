/**
 * stormReports.js
 * Storm report data sources for weather tracking mode.
 *
 * Sources:
 * - NOAA SPC live reports JSON
 * - Iowa State Mesonet (IEM) SPC GeoJSON feed
 */

import { fetchWithCache } from '../utils/dataCache';

const SPC_REPORTS_URL = 'https://www.spc.noaa.gov/climo/reports/today.json';
const IEM_BASE_URL = 'https://mesonet.agron.iastate.edu/cgi-bin/request/gis/spc.py';

function toIsoTimestamp(date, timeCandidate) {
  const hhmm = String(timeCandidate || '').replace(/[^\d]/g, '').padStart(4, '0').slice(-4);
  const hh = hhmm.slice(0, 2);
  const mm = hhmm.slice(2, 4);
  return `${date}T${hh}:${mm}:00Z`;
}

function normalizeSpcRow(row, idx = 0) {
  const lat = Number(row.lat ?? row.latitude);
  const lng = Number(row.lon ?? row.lng ?? row.longitude);
  const reportTypeRaw = String(row.type || row.phenom || '').toLowerCase();
  const reportType =
    reportTypeRaw.includes('torn') ? 'Tornado'
      : reportTypeRaw.includes('hail') ? 'Hail'
        : 'Wind';

  const date = row.date ?? new Date().toISOString().slice(0, 10);
  const time = row.time ?? row.time_utc ?? row.utc ?? '0000';

  return {
    id: row.id || `spc-${date}-${time}-${idx}`,
    source: 'SPC',
    reportType,
    magnitude: row.magnitude || row.mag || row.size || null,
    city: row.city || row.location || '',
    county: row.county || '',
    state: row.state || '',
    comments: row.comments || row.remark || '',
    lat,
    lng,
    reportedAt: toIsoTimestamp(date, time),
  };
}

function normalizeIemFeature(feature, idx = 0) {
  const p = feature?.properties || {};
  const [lng, lat] = feature?.geometry?.coordinates || [NaN, NaN];
  const typetext = String(p.typetext || p.type || '').toLowerCase();

  const reportType =
    typetext.includes('torn') ? 'Tornado'
      : typetext.includes('hail') ? 'Hail'
        : 'Wind';

  const reportedAt = p.valid
    ? new Date(p.valid).toISOString()
    : toIsoTimestamp(new Date().toISOString().slice(0, 10), p.utcvalid || p.time || '0000');

  return {
    id: p.event_id || p.id || `iem-${reportedAt}-${idx}`,
    source: 'IEM',
    reportType,
    magnitude: p.magnitude || p.mag || p.size || null,
    city: p.city || p.town || '',
    county: p.county || '',
    state: p.state || '',
    comments: p.remark || p.comments || '',
    lat: Number(lat),
    lng: Number(lng),
    reportedAt,
  };
}

export async function fetchSpcStormReports() {
  const data = await fetchWithCache(SPC_REPORTS_URL, 'spc:today-reports', {}, 60 * 1000);
  const rows = Array.isArray(data) ? data : data?.reports || [];
  return rows.map(normalizeSpcRow).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

export async function fetchIemStormReports() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');

  const params = new URLSearchParams({
    year: String(year),
    month,
    day,
    format: 'geojson',
  });

  const url = `${IEM_BASE_URL}?${params}`;
  const data = await fetchWithCache(url, `iem:spc:${year}-${month}-${day}`, {}, 5 * 60 * 1000);
  const features = data?.features || [];
  return features.map(normalizeIemFeature).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

export function stormReportsToGeoJSON(reports = []) {
  return {
    type: 'FeatureCollection',
    features: reports.map((r) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [r.lng, r.lat],
      },
      properties: {
        id: r.id,
        source: r.source,
        reportType: r.reportType,
        magnitude: r.magnitude || '',
        city: r.city || '',
        county: r.county || '',
        state: r.state || '',
        comments: r.comments || '',
        reportedAt: r.reportedAt || '',
      },
    })),
  };
}
