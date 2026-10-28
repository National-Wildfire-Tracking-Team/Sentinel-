/**
 * Fire activity, smoke and air-quality layers (the web's FireHotspotsLayer, NgfsDetectionsLayer,
 * CalFirePerimetersLayer, NdgdSmokeForecastLayer and AQILayer), asked from the upstream services.
 *
 * FIRMS: the web calls the area API with a MAP_KEY; the app reads NASA's keyless 48-hour CSVs for
 * the same three satellites instead, clipped to the web's US bounds.
 */
import { fetchJson, num, queryAllPages } from './arcgisQuery';

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });

// ── NASA FIRMS hotspots ──────────────────────────────────────────────────────────────────────────

const FIRMS = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire';
const FIRMS_FEEDS = [
  { source: 'VIIRS_SNPP_NRT', url: `${FIRMS}/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_USA_contiguous_and_Hawaii_48h.csv` },
  { source: 'VIIRS_NOAA20_NRT', url: `${FIRMS}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_USA_contiguous_and_Hawaii_48h.csv` },
  { source: 'MODIS_NRT', url: `${FIRMS}/modis-c6.1/csv/MODIS_C6_1_USA_contiguous_and_Hawaii_48h.csv` },
];
const US_BOUNDS = { w: -130, s: 24, e: -65, n: 50 };

export const FIRMS_FEED_LABEL: Record<string, string> = {
  VIIRS_SNPP_NRT: 'VIIRS SNPP',
  VIIRS_NOAA20_NRT: 'VIIRS NOAA-20',
  MODIS_NRT: 'MODIS',
};

function firmsConfidence(raw: string): 'high' | 'nominal' | 'low' {
  const c = raw.trim().toLowerCase();
  if (c === 'h' || c === 'high') return 'high';
  if (c === 'l' || c === 'low') return 'low';
  const n = Number(c);
  if (Number.isFinite(n) && c !== '') return n >= 80 ? 'high' : n >= 40 ? 'nominal' : 'low';
  return 'nominal';
}

export async function fetchFireHotspots(): Promise<GeoJSON.FeatureCollection> {
  const now = Date.now();
  const results = await Promise.allSettled(
    FIRMS_FEEDS.map(async feed => {
      const res = await fetch(feed.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { feed, text: await res.text() };
    }),
  );
  if (results.every(r => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
  const features: GeoJSON.Feature[] = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { feed, text } = r.value;
    const lines = text.split('\n');
    const header = (lines[0] ?? '').split(',');
    const col = (name: string) => header.indexOf(name);
    const iLat = col('latitude');
    const iLon = col('longitude');
    const iBright = col('bright_ti4') >= 0 ? col('bright_ti4') : col('brightness');
    const iDate = col('acq_date');
    const iTime = col('acq_time');
    const iSat = col('satellite');
    const iConf = col('confidence');
    const iFrp = col('frp');
    const iDn = col('daynight');
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      const lat = Number(row[iLat]);
      const lng = Number(row[iLon]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lng < US_BOUNDS.w || lng > US_BOUNDS.e || lat < US_BOUNDS.s || lat > US_BOUNDS.n) continue;
      const date = row[iDate];
      const time = (row[iTime] ?? '').padStart(4, '0');
      const t = Date.parse(`${date}T${time.slice(0, 2)}:${time.slice(2)}:00Z`);
      if (Number.isFinite(t) && now - t > 48 * 3600_000) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          frp: num(row[iFrp]) ?? 0,
          brightness: num(row[iBright]),
          confidence: firmsConfidence(row[iConf] ?? ''),
          satellite: row[iSat] ?? null,
          source: feed.source,
          acq_date: date,
          acq_time: time,
          daynight: row[iDn]?.trim() ?? null,
        },
      });
    }
  }
  return fc(features);
}

export function frpIntensity(frp: number): string {
  if (frp >= 500) return 'Extreme';
  if (frp >= 200) return 'Very High';
  if (frp >= 100) return 'High';
  if (frp >= 50) return 'Moderate';
  if (frp >= 10) return 'Low';
  return 'Very Low';
}

// ── NOAA NESDIS NGFS (GOES) detections ───────────────────────────────────────────────────────────

const NGFS = 'https://fire.data.nesdis.noaa.gov/api/ogc/detections/collections';
const NGFS_COLLECTIONS = ['ngfs_schema.ngfs_detections_scene_east_conus', 'ngfs_schema.ngfs_detections_scene_west_conus'];
const NGFS_FIELDS = [
  'latitude', 'longitude', 'frp', 'bright_t7', 'confidence', 'satellite', 'acq_date_time', 'daynight', 'state', 'county',
  'known_incident_name', 'type_description',
];

export async function fetchNgfsDetections(): Promise<GeoJSON.FeatureCollection> {
  const results = await Promise.allSettled(NGFS_COLLECTIONS.map(id => fetchJson(`${NGFS}/${id}/items?f=json&limit=3000`)));
  if (results.every(r => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
  const features: GeoJSON.Feature[] = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const f of r.value?.features ?? []) {
      const p = f.properties ?? {};
      // 0 = possible wildland fire, 1 = known incident; others are industrial and the like.
      if (!f.geometry || (p.type !== 0 && p.type !== 1)) continue;
      const props: Record<string, any> = { id: p.id };
      for (const k of NGFS_FIELDS) props[k] = p[k] ?? null;
      features.push({ type: 'Feature', geometry: f.geometry, properties: props });
    }
  }
  return fc(features);
}

// ── CAL FIRE FRAP historical perimeters ──────────────────────────────────────────────────────────

const FRAP_MIRROR =
  'https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/California_Historic_Fire_Perimeters/FeatureServer/0';

export async function fetchCalFirePerimeters(): Promise<GeoJSON.FeatureCollection> {
  const since = new Date().getFullYear() - 10;
  // Simplified geometry: page 1 is ~1.7 MB instead of ~40 MB at full detail.
  const features = await queryAllPages(
    FRAP_MIRROR,
    {
      where: `YEAR_>=${since}`,
      outFields: 'YEAR_,AGENCY,UNIT_ID,FIRE_NAME,INC_NUM,ALARM_DATE,CONT_DATE,CAUSE,GIS_ACRES,COMPLEX_NAME',
      orderByFields: 'OBJECTID',
      outSR: '4326',
      maxAllowableOffset: '0.001',
      geometryPrecision: '4',
      f: 'geojson',
    },
    { pageSize: 2000, maxPages: 5 },
  );
  return fc(
    features
      .filter(f => f.geometry)
      .map(f => {
        const p = f.properties ?? {};
        return {
          type: 'Feature',
          geometry: f.geometry,
          properties: {
            FireName: p.FIRE_NAME || p.COMPLEX_NAME || 'Unknown Fire',
            FireYear: p.YEAR_ ?? null,
            GISAcres: num(p.GIS_ACRES),
            AlarmDate: p.ALARM_DATE ?? null,
            ContainedDate: p.CONT_DATE ?? null,
            Agency: p.AGENCY ?? null,
            UnitId: p.UNIT_ID ?? null,
            Cause: p.CAUSE ?? null,
            IncidentNum: p.INC_NUM ?? null,
          },
        } as GeoJSON.Feature;
      }),
  );
}

/** CAL FIRE FRAP cause codes (the service's CAUSE domain). */
export const FRAP_CAUSES: Record<number, string> = {
  1: 'Lightning',
  2: 'Equipment use',
  3: 'Smoking',
  4: 'Campfire',
  5: 'Debris',
  6: 'Railroad',
  7: 'Arson',
  8: 'Playing with fire',
  9: 'Miscellaneous',
  10: 'Vehicle',
  11: 'Electrical power',
  12: 'Firefighter training',
  13: 'Non-firefighter training',
  14: 'Unknown / unidentified',
  15: 'Structure',
  16: 'Aircraft',
  17: 'Volcanic',
  18: 'Escaped prescribed burn',
  19: 'Illegal alien campfire',
};

// ── NDGD smoke forecast ──────────────────────────────────────────────────────────────────────────

const NDGD = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/NDGD_SmokeForecast_v1/FeatureServer/0';

/** Every forecast hour's smoke polygons; the map shows one hour at a time (`todate`). */
export async function fetchNdgdSmoke(): Promise<GeoJSON.FeatureCollection> {
  // The server caps pages at 2000 (the web asks for 8000 and so misses later hours).
  const features = await queryAllPages(
    NDGD,
    { where: '1=1', outFields: 'todate,smoke_classdesc', orderByFields: 'OBJECTID', f: 'geojson' },
    { pageSize: 2000, maxPages: 10 },
  );
  return fc(features.filter(f => f.geometry).map(f => ({ type: 'Feature', geometry: f.geometry, properties: f.properties ?? {} })));
}

/** Sorted unique forecast hours (epoch ms) in a smoke collection. */
export function smokeHours(data: GeoJSON.FeatureCollection | undefined): number[] {
  const set = new Set<number>();
  for (const f of data?.features ?? []) {
    const t = Number(f.properties?.todate);
    if (Number.isFinite(t)) set.add(t);
  }
  return [...set].sort((a, b) => a - b);
}

// ── AirNow AQI contours ──────────────────────────────────────────────────────────────────────────

export async function fetchAqiContours(): Promise<GeoJSON.FeatureCollection> {
  const body = await fetchJson(
    'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/AirNowLatestContoursCombined/FeatureServer/0/query?where=1%3D1&outFields=gridcode,Timestamp&outSR=4326&f=geojson',
  );
  return fc((body?.features ?? []).filter((f: any) => f.geometry));
}

export const AQI_CATEGORIES = [
  { label: 'Good', color: '#00e400' },
  { label: 'Moderate', color: '#ffff00' },
  { label: 'Unhealthy for sensitive groups', color: '#ff7e00' },
  { label: 'Unhealthy', color: '#ff0000' },
  { label: 'Very unhealthy', color: '#8f3f97' },
  { label: 'Hazardous', color: '#7e0023' },
];
