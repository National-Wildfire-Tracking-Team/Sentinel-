/**
 * awcRecords.js
 * Layer ids for the Aviation Weather Center map layers (AwcLayers) and the
 * record a click on one of them opens in the detail panel (AwcDetail).
 */

import { AWC_NAV_ROUTES, hazardStyle } from '../../../api/awc/awc';

export const ADVISORY_KEYS = ['awcTcf', 'awcGairmetSierra', 'awcGairmetTango', 'awcGairmetZulu', 'awcAirmetAk', 'awcCwa', 'awcSigmetIntl', 'awcSigmetUs'];

export const srcId = (key) => `awc-src-${key}`;
export const AWC_METAR_DOT_ID = `${srcId('awcMetarTaf')}-dot`;

/** Layer ids a click can hit, for whatever AWC layers are showing. */
export function awcInteractiveLayerIds(awc) {
  if (!awc?.active) return [];
  const ids = [];
  for (const key of ADVISORY_KEYS) {
    if (awc.visible[key]) ids.push(`${srcId(key)}-fill`, `${srcId(key)}-contour`);
  }
  for (const key of Object.keys(AWC_NAV_ROUTES)) if (awc.visible[key]) ids.push(`${srcId(key)}-dot`);
  if (awc.visible.awcPirep) ids.push(`${srcId('awcPirep')}-dot`);
  if (awc.visible.awcMetarTaf) ids.push(AWC_METAR_DOT_ID);
  return ids;
}

const toNum = (v) => (v == null || v === '' ? null : Number(v));

/** Title for a clicked AWC feature, as the detail panel and stacked-click popup show it. */
function awcTitle(key, p) {
  if (key === 'awcMetarTaf') return p.id;
  if (key === 'awcPirep') return `${/URGENT/i.test(p.airepType || '') ? 'Urgent ' : ''}${p.airepType || 'PIREP'}${p.acType ? ` · ${p.acType}` : ''}`;
  if (key === 'awcTcf') return 'Convective forecast (TCF)';
  if (key.startsWith('awcGairmet')) return `G-AIRMET ${String(p.product || '').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} · ${hazardStyle(p.hz).label}`;
  if (key === 'awcAirmetAk') return `AIRMET · ${hazardStyle(p.hz).label}`;
  if (key === 'awcCwa') return `CWA ${p.cwsu || ''} ${p.seriesId || ''} · ${hazardStyle(p.hz).label}`.replace(/\s+/g, ' ');
  if (key === 'awcSigmetUs' || key === 'awcSigmetIntl') return `SIGMET ${p.seriesId || ''} · ${hazardStyle(p.hz).label}`.replace(/\s+/g, ' ');
  return p.name || p.icaoId || p.id || 'Aviation feature';
}

/**
 * A clicked AWC feature → the record selectFire opens in FireDetailPanel
 * (AwcDetail), or null for anything else.
 */
export function buildAwcRecord(feature, lngLat) {
  const m = String(feature?.layer?.id || '').match(/^awc-src-(\w+)-(fill|contour|dot)$/);
  if (!m) return null;
  const key = m[1];
  const p = feature.properties || {};
  const [lng, lat] = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : [lngLat.lng, lngLat.lat];
  return {
    type: 'awc',
    key,
    id: key === 'awcMetarTaf' ? `metar-${p.id}` : `${key}-${p.fid ?? p.id}`,
    name: awcTitle(key, p),
    fid: toNum(p.fid),
    stationId: key === 'awcMetarTaf' ? p.id : null,
    props: p,
    lat,
    lng,
  };
}
