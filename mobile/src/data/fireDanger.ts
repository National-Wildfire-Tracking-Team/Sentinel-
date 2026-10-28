/**
 * Fire Danger & Fuels (Plus), after the web's src/app/api/fireDanger/*: NWCG 7-day significant
 * fire potential, FEMS NFDRS station values (Sentinel's AWS fire-danger feed), NWCC live fuel
 * moisture samples, the USGS WFPI grid and LANDFIRE FBFM40 fuel models.
 */
import { fetchJson, num } from './arcgisQuery';

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });
const FIRE_DANGER = 'https://d17msnxo4ql3yx.cloudfront.net/fire-danger/v1';

// ── Significant fire potential (NWCG Predictive Services) ────────────────────────────────────────

const SFP_URL = 'https://fsapps.nwcg.gov/psp/arcgis/rest/services/npsg/outlooks_forecast/MapServer';

export const SFP_CLASSES = {
  nodata: { label: 'No data', color: '#9c9c9c', rank: 0, detail: null },
  little: { label: 'Little or no risk', color: '#5fb336', rank: 1, detail: null },
  low: { label: 'Low risk', color: '#ffff40', rank: 2, detail: null },
  moderate: { label: 'Moderate risk', color: '#d9b46f', rank: 3, detail: null },
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
} as const;
export type SfpClass = keyof typeof SFP_CLASSES;
const SFP_NOT_UPDATED = { label: 'Not yet updated for this date', color: '#52525b' };

function classifySfp(p: Record<string, any>): SfpClass | null {
  if (Number(p.isvalid) !== 1) return null;
  const type = String(p.type ?? '').toUpperCase();
  if (type === 'IGNITION') return 'highRed';
  if (type === 'CRITICAL') return 'highOrange';
  return (['nodata', 'little', 'low', 'moderate'] as const)[Number(p.drynesscode)] ?? null;
}

/** Day 1–7 polygons by Predictive Service Area. */
export async function fetchSignificantFirePotential(day = 1): Promise<GeoJSON.FeatureCollection> {
  const qs = new URLSearchParams({
    where: '1=1',
    outFields: 'drynesscode,type,isvalid,timestampdate,nat_code,gacc',
    returnGeometry: 'true',
    outSR: '4326',
    maxAllowableOffset: '0.01',
    geometryPrecision: '4',
    f: 'geojson',
  });
  const body = await fetchJson(`${SFP_URL}/${day - 1}/query?${qs.toString()}`);
  return fc(
    (body?.features ?? [])
      .filter((f: any) => f.geometry)
      .map((f: any) => {
        const p = f.properties ?? {};
        const cls = classifySfp(p);
        return {
          type: 'Feature',
          geometry: f.geometry,
          properties: {
            sfpClass: cls,
            sfpColor: cls ? SFP_CLASSES[cls].color : SFP_NOT_UPDATED.color,
            sfpLabel: cls ? SFP_CLASSES[cls].label : SFP_NOT_UPDATED.label,
            psa: p.nat_code ?? null,
            gacc: p.gacc ?? null,
            forecastDate: p.timestampdate ? new Date(p.timestampdate).toISOString().slice(0, 10) : null,
            day,
          },
        };
      }),
  );
}

// ── FEMS NFDRS stations ──────────────────────────────────────────────────────────────────────────

export interface FireDangerManifest {
  products: { stations: { path: string; detailPath: string; run: string } };
  sources: { fems: { latestObservedDate?: string }; wfpi?: { validDates?: string[]; status?: string } };
}

export async function fetchFireDangerManifest(): Promise<FireDangerManifest> {
  const m = await fetchJson(`${FIRE_DANGER}/manifest.json`);
  if (m?.schemaVersion !== 1 || m?.kind !== 'sentinel-fire-danger') throw new Error('Unexpected fire danger manifest');
  return m;
}

const STATION_FIELDS = [
  'erc', 'bi', 'sc', 'ic', 'fm1', 'fm10', 'fm100', 'fm1000', 'herbFM', 'woodyFM', 'kbdi', 'gsi', 'ercChange7d', 'fm100Change7d',
];

/** NFDRS stations from the latest run, each flagged stale when its last observation is old. */
export async function fetchFireDangerStations(): Promise<GeoJSON.FeatureCollection> {
  const manifest = await fetchFireDangerManifest();
  const body = await fetchJson(`${FIRE_DANGER}/${manifest.products.stations.path}`);
  const latest = manifest.sources.fems.latestObservedDate;
  const latestMs = latest ? Date.parse(latest) : NaN;
  return fc(
    (body?.features ?? [])
      .filter((f: any) => f.geometry)
      .map((f: any) => {
        const p = f.properties ?? {};
        const observedMs = p.observedDate ? Date.parse(p.observedDate) : NaN;
        const stale = !p.observedDate || (Number.isFinite(latestMs) && (latestMs - observedMs) / 86_400_000 > 2);
        const props: Record<string, any> = {
          id: p.id,
          name: p.name ?? 'Station',
          state: p.state ?? null,
          observedDate: p.observedDate ?? null,
          qa: p.qa ?? null,
          stale,
          forecastPeakErc: Array.isArray(p.forecastErc) ? Math.max(...p.forecastErc.map(Number).filter(Number.isFinite)) : null,
        };
        for (const k of STATION_FIELDS) props[k] = num(p[k]);
        return { type: 'Feature', geometry: f.geometry, properties: props };
      }),
  );
}

export type StationField = 'erc' | 'bi' | 'sc' | 'fm1' | 'fm10' | 'fm100' | 'fm1000' | 'herbFM' | 'woodyFM';

const RAMP = ['#fff7bc', '#fee391', '#fec44f', '#fe9929', '#ec7014', '#cc4c02', '#8c2d04'];
const FIELD_RANGES: Record<StationField, { min: number; max: number; moisture: boolean; label: string }> = {
  erc: { min: 0, max: 100, moisture: false, label: 'ERC' },
  bi: { min: 0, max: 120, moisture: false, label: 'BI' },
  sc: { min: 0, max: 60, moisture: false, label: 'SC' },
  fm1: { min: 2, max: 30, moisture: true, label: '1-h' },
  fm10: { min: 2, max: 30, moisture: true, label: '10-h' },
  fm100: { min: 4, max: 35, moisture: true, label: '100-h' },
  fm1000: { min: 5, max: 35, moisture: true, label: '1000-h' },
  herbFM: { min: 30, max: 250, moisture: true, label: 'Herb' },
  woodyFM: { min: 60, max: 200, moisture: true, label: 'Woody' },
};

/** The catalog key's field (dead / live fuel moisture use the web's default class). */
export const STATION_LAYER_FIELD: Record<string, StationField> = {
  fdErc: 'erc',
  fdBi: 'bi',
  fdSc: 'sc',
  fdDeadFm: 'fm100',
  fdLiveFm: 'herbFM',
};
export const STATION_LAYER_KEYS = Object.keys(STATION_LAYER_FIELD);

/** Mapbox paint for a station field: dry/high values dark red, as on the web. */
export function stationPaint(field: StationField) {
  const { min, max, moisture } = FIELD_RANGES[field];
  const colors = moisture ? [...RAMP].reverse() : RAMP;
  const stops = colors.flatMap((c, i) => [min + ((max - min) * i) / (colors.length - 1), c]);
  const hasValue = ['all', ['!', ['get', 'stale']], ['!=', ['get', field], null]];
  return {
    hasValue,
    color: ['case', hasValue, ['interpolate', ['linear'], ['get', field], ...stops], 'rgba(0,0,0,0)'],
    label: ['concat', ['to-string', ['round', ['get', field]]], moisture ? '%' : ''],
  };
}

// ── NWCC live fuel moisture samples ──────────────────────────────────────────────────────────────

const LFM_URL = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/NWCC_FEMS_Fuel_Moisture/FeatureServer/0';

export interface FuelSample {
  fuel: string;
  part: string | null;
  value: number;
  date: string;
  implausible: boolean;
}

export async function fetchFuelMoistureSamples(): Promise<GeoJSON.FeatureCollection> {
  const qs = new URLSearchParams({
    where:
      "fuel_category IN ('Tree','Shrub','Grass','Forb') AND sample_status IN ('Submitted','Edited') AND sample_date_dt >= CURRENT_TIMESTAMP - 60",
    outFields: 'site_id,site_name,state_id,elevation,fuel_type,fuel_category,sub_category,sample_average_value,sample_date',
    outSR: '4326',
    resultRecordCount: '2000',
    f: 'geojson',
  });
  const body = await fetchJson(`${LFM_URL}/query?${qs.toString()}`);
  const sites = new Map<string, { geometry: GeoJSON.Geometry; props: Record<string, any>; fuels: Map<string, FuelSample> }>();
  for (const f of body?.features ?? []) {
    const p = f.properties ?? {};
    const value = num(p.sample_average_value);
    if (!f.geometry || p.site_id == null || !p.sample_date || value == null) continue;
    const id = String(p.site_id);
    let site = sites.get(id);
    if (!site) {
      site = {
        geometry: f.geometry,
        props: { id, name: p.site_name ?? 'Sample site', state: p.state_id ?? null, elevation: num(p.elevation) },
        fuels: new Map(),
      };
      sites.set(id, site);
    }
    const key = `${p.fuel_type}|${p.sub_category ?? ''}`;
    const date = String(p.sample_date).slice(0, 10);
    const prev = site.fuels.get(key);
    if (prev && prev.date >= date) continue;
    site.fuels.set(key, {
      fuel: p.fuel_type ?? 'Fuel',
      part: p.sub_category === 'New' ? 'new growth' : p.sub_category === 'Old' ? 'old foliage' : null,
      value,
      date,
      implausible: value > 400,
    });
  }
  const recentCutoff = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  return fc(
    [...sites.values()].map(site => {
      const fuels = [...site.fuels.values()].sort((a, b) => b.date.localeCompare(a.date) || a.fuel.localeCompare(b.fuel));
      const latestDate = fuels[0]?.date ?? null;
      return {
        type: 'Feature',
        geometry: site.geometry,
        properties: { ...site.props, latestDate, recent: Boolean(latestDate && latestDate >= recentCutoff), fuels: JSON.stringify(fuels) },
      };
    }),
  );
}

// ── USGS WFPI grid ───────────────────────────────────────────────────────────────────────────────

export function wfpiTileUrl(day: number): string {
  const layer = `wfpi-forecast-${day}_conus_day_data`;
  return (
    `https://dmsdata.cr.usgs.gov/geoserver/firedanger_${layer}/wms?service=WMS&version=1.3.0&request=GetMap&layers=${layer}` +
    '&styles=&crs=EPSG:3857&width=256&height=256&format=image/png&transparent=true&bbox={bbox-epsg-3857}'
  );
}

// ── LANDFIRE FBFM40 fuel models ──────────────────────────────────────────────────────────────────

const LFPS = 'https://lfps.usgs.gov/arcgis/rest/services';

/** Services in draw order, bottom to top (LF2025 covers only part of the West so far). */
export const LANDFIRE_SERVICES = [
  { id: 'conus-2024', path: 'Landfire_LF2024/LF2024_FBFM40_CONUS', label: 'CONUS', version: 'LF2024', bounds: [-128, 22, -65, 52] },
  { id: 'conus-2025', path: 'Landfire_LF2025/LF2025_FBFM40_CONUS', label: 'CONUS', version: 'LF2025', bounds: [-128, 22, -65, 52] },
  { id: 'ak-2025', path: 'Landfire_LF2025/LF2025_FBFM40_AK', label: 'Alaska', version: 'LF2025', bounds: [-180, 50, -129, 72] },
  { id: 'hi-2024', path: 'Landfire_LF2024/LF2024_FBFM40_HI', label: 'Hawaii', version: 'LF2024', bounds: [-161, 18.5, -154.5, 22.5] },
  { id: 'prvi-2024', path: 'Landfire_LF2024/LF2024_FBFM40_PRVI', label: 'Puerto Rico & USVI', version: 'LF2024', bounds: [-68, 17.5, -64.3, 18.8] },
] as const;

export function landfireTileUrl(path: string): string {
  return `${LFPS}/${path}/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image`;
}

const FUEL_GROUPS: Record<string, string> = {
  NB: 'Non-burnable',
  GR: 'Grass',
  GS: 'Grass-shrub',
  SH: 'Shrub',
  TU: 'Timber-understory',
  TL: 'Timber litter',
  SB: 'Slash-blowdown',
};

/** FBFM40 code → model, description, LANDFIRE colour (src/app/api/fireDanger/landfireFuels.js). */
const FBFM40: Record<number, { model: string; name: string; color: string | null }> = {
  91: { model: 'NB1', name: 'Urban / developed', color: '#686868' },
  92: { model: 'NB2', name: 'Snow / ice', color: '#e1e1e1' },
  93: { model: 'NB3', name: 'Agricultural', color: '#ffeded' },
  98: { model: 'NB8', name: 'Open water', color: '#000ed6' },
  99: { model: 'NB9', name: 'Bare ground', color: '#4d6e70' },
  101: { model: 'GR1', name: 'Short, sparse, dry climate grass', color: '#ffebbe' },
  102: { model: 'GR2', name: 'Low load, dry climate grass', color: '#ffd373' },
  103: { model: 'GR3', name: 'Low load, very coarse, humid climate grass', color: '#ffec8b' },
  104: { model: 'GR4', name: 'Moderate load, dry climate grass', color: '#ffff73' },
  105: { model: 'GR5', name: 'Low load, humid climate grass', color: '#f5de29' },
  106: { model: 'GR6', name: 'Moderate load, humid climate grass', color: '#e6e640' },
  107: { model: 'GR7', name: 'High load, dry climate grass', color: '#cdc673' },
  108: { model: 'GR8', name: 'High load, very coarse, humid climate grass', color: '#8b864e' },
  109: { model: 'GR9', name: 'Very high load, humid climate grass', color: null },
  121: { model: 'GS1', name: 'Low load, dry climate grass-shrub', color: '#ffaa00' },
  122: { model: 'GS2', name: 'Moderate load, dry climate grass-shrub', color: '#ffa77f' },
  123: { model: 'GS3', name: 'Moderate load, humid climate grass-shrub', color: '#ff6300' },
  124: { model: 'GS4', name: 'High load, humid climate grass-shrub', color: '#cd6600' },
  141: { model: 'SH1', name: 'Low load, dry climate shrub', color: '#d7c29e' },
  142: { model: 'SH2', name: 'Moderate load, dry climate shrub', color: '#d7b09e' },
  143: { model: 'SH3', name: 'Moderate load, humid climate shrub', color: '#cd8966' },
  144: { model: 'SH4', name: 'Low load, humid climate timber-shrub', color: '#895a44' },
  145: { model: 'SH5', name: 'High load, dry climate shrub', color: '#cdaa66' },
  146: { model: 'SH6', name: 'Low load, humid climate shrub', color: '#ed7044' },
  147: { model: 'SH7', name: 'Very high load, dry climate shrub', color: '#cd7d39' },
  148: { model: 'SH8', name: 'High load, humid climate shrub', color: '#a83800' },
  149: { model: 'SH9', name: 'Very high load, humid climate shrub', color: '#731a00' },
  161: { model: 'TU1', name: 'Low load, dry climate timber-grass-shrub', color: '#e9ffbe' },
  162: { model: 'TU2', name: 'Moderate load, humid climate timber-shrub', color: '#aaff00' },
  163: { model: 'TU3', name: 'Moderate load, humid climate timber-grass-shrub', color: '#b4d79e' },
  164: { model: 'TU4', name: 'Dwarf conifer with understory', color: '#70a800' },
  165: { model: 'TU5', name: 'Very high load, dry climate timber-shrub', color: '#267300' },
  181: { model: 'TL1', name: 'Low load, compact conifer litter', color: '#beffe8' },
  182: { model: 'TL2', name: 'Low load broadleaf litter', color: '#00ffc5' },
  183: { model: 'TL3', name: 'Moderate load conifer litter', color: '#bed2ff' },
  184: { model: 'TL4', name: 'Small downed logs', color: '#7b68ee' },
  185: { model: 'TL5', name: 'High load conifer litter', color: '#bee8ff' },
  186: { model: 'TL6', name: 'Moderate load broadleaf litter', color: '#00c5ff' },
  187: { model: 'TL7', name: 'Large downed logs', color: '#0084a8' },
  188: { model: 'TL8', name: 'Long-needle litter', color: '#005ce6' },
  189: { model: 'TL9', name: 'Very high load broadleaf litter', color: '#4d6e91' },
  201: { model: 'SB1', name: 'Low load activity fuel', color: '#e8beff' },
  202: { model: 'SB2', name: 'Moderate load activity fuel or low load blowdown', color: '#c500ff' },
  203: { model: 'SB3', name: 'High load activity fuel or moderate load blowdown', color: '#ffbee8' },
  204: { model: 'SB4', name: 'High load blowdown', color: null },
};

export interface FuelModelAt {
  model: string;
  name: string;
  color: string | null;
  group: string;
  burnable: boolean;
  dataset: string;
}

/** The fuel model at a point, from the newest LANDFIRE release with data there. */
export async function fetchFuelModelAt(lat: number, lng: number): Promise<FuelModelAt | null> {
  const services = LANDFIRE_SERVICES.filter(({ bounds: [w, s, e, n] }) => lng >= w && lng <= e && lat >= s && lat <= n).sort((a, b) =>
    b.version.localeCompare(a.version),
  );
  for (const service of services) {
    const qs = new URLSearchParams({
      geometry: JSON.stringify({ x: Number(lng.toFixed(5)), y: Number(lat.toFixed(5)), spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryPoint',
      returnGeometry: 'false',
      f: 'json',
    });
    const body = await fetchJson(`${LFPS}/${service.path}/ImageServer/identify?${qs.toString()}`);
    const entry = FBFM40[Number(body?.value)];
    if (!entry) continue;
    const group = entry.model.slice(0, 2);
    return {
      ...entry,
      group: FUEL_GROUPS[group] ?? group,
      burnable: group !== 'NB',
      dataset: `LANDFIRE ${service.version} FBFM40 (${service.label}), 30 m`,
    };
  }
  return null;
}
