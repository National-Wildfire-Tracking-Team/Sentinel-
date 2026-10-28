/**
 * NWS watch, warning and advisory polygons for the alerts layer, from NOAA's WWA MapServer (the
 * service the web's nwsMapServerAlerts.js reads): layer 0 holds storm-based warnings at full
 * detail, layer 1 every zone-based product. Layer 1's nationwide geometry is ~13 MB raw, so it's
 * simplified to ~1 km (about 225 KB), which is invisible at the zooms where zones matter.
 * Each feature is styled from alertStyles (WeatherWise's colours and line widths).
 */
import { fetchJson } from './arcgisQuery';
import { ALERT_STYLES, alertCode, alertLineWidth, alertShownByDefault } from './alertStyles';

const WWA = 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/MapServer';
const FIELDS = 'phenom,sig,prod_type,cap_id';

export async function fetchAlertPolygons(): Promise<GeoJSON.FeatureCollection> {
  const [storm, zones] = await Promise.allSettled([
    fetchJson(`${WWA}/0/query?where=1%3D1&outFields=${FIELDS}&outSR=4326&f=geojson`),
    fetchJson(`${WWA}/1/query?where=1%3D1&outFields=${FIELDS}&outSR=4326&maxAllowableOffset=0.01&geometryPrecision=3&f=geojson`),
  ]);
  if (storm.status === 'rejected' && zones.status === 'rejected') throw zones.reason;
  const features: GeoJSON.Feature[] = [];
  for (const result of [zones, storm]) {
    if (result.status !== 'fulfilled') continue;
    for (const f of result.value?.features ?? []) {
      const p = f.properties ?? {};
      const code = alertCode(p.phenom, p.sig, p.prod_type);
      if (!f.geometry || !code || !alertShownByDefault(code)) continue;
      const style = ALERT_STYLES[code];
      features.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          code,
          name: style.name,
          color: style.color,
          lineWidth: alertLineWidth(code),
          // Mapbox draws lower sort keys first, so the most important alerts end up on top.
          sortKey: -style.priority,
          capId: p.cap_id ?? null,
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
