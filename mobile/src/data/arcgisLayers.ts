/**
 * Weather and hazard layers drawn as raster tiles from NOAA's ArcGIS MapServers — the same services
 * the web reaches through its /api/nws/* proxy (netlify/edge-functions/nws-mapservices-proxy.js).
 * Native apps have no CORS, so the app asks the MapServers directly. Each server renders its own
 * official symbology; tapping the map runs an ArcGIS identify to show what is under the finger.
 */
const NOAA = 'https://mapservices.weather.noaa.gov';
const VECTOR = `${NOAA}/vector/rest/services`;

export interface ArcgisLayerDef {
  url: string;
  /** Sub-layers to draw ('show:1,2'); omitted = the service's default visibility. */
  layers?: string;
  /** Per-sublayer SQL filters, keyed by sublayer id. */
  layerDefs?: Record<string, string>;
  opacity: number;
  /** How often to re-request tiles (the services update in place). */
  refreshMinutes: number;
  minZoom?: number;
  /** Label for identify results. */
  title: string;
}

// NWS alerts are drawn as styled polygons (data/alertPolygons.ts), not MapServer images.
export const ARCGIS_LAYERS: Record<string, ArcgisLayerDef> = {
  nhcTropical: {
    url: `${NOAA}/tropical/rest/services/tropical/NHC_tropical_weather/MapServer`,
    opacity: 0.85,
    refreshMinutes: 10,
    title: 'NHC tropical',
  },
  stormReports: {
    url: `${VECTOR}/obs/nws_local_storm_reports/MapServer`,
    layers: 'show:0',
    opacity: 1,
    refreshMinutes: 5,
    title: 'Storm report',
  },
  damageAssessment: {
    url: 'https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/MapServer',
    opacity: 0.9,
    refreshMinutes: 15,
    title: 'Damage survey',
  },
  spcWeatherOutlooks: {
    url: `${VECTOR}/outlooks/SPC_wx_outlks/MapServer`,
    layers: 'show:1',
    opacity: 0.5,
    refreshMinutes: 15,
    title: 'SPC Day 1 outlook',
  },
  fireWeatherOutlooks: {
    url: `${VECTOR}/fire_weather/SPC_firewx/MapServer`,
    layers: 'show:1,2',
    opacity: 0.55,
    refreshMinutes: 15,
    title: 'SPC Day 1 fire weather',
  },
  wpcEro: {
    url: `${VECTOR}/hazards/wpc_precip_hazards/MapServer`,
    layers: 'show:0',
    opacity: 0.5,
    refreshMinutes: 30,
    title: 'Excessive rainfall, Day 1',
  },
  wpcWssi: {
    url: `${VECTOR}/outlooks/wpc_wssi/MapServer`,
    layers: 'show:1',
    opacity: 0.5,
    refreshMinutes: 30,
    title: 'Winter storm severity, Day 1',
  },
  wpcQpf: {
    url: `${VECTOR}/precip/wpc_qpf/MapServer`,
    layers: 'show:1',
    opacity: 0.55,
    refreshMinutes: 30,
    title: 'Precipitation, Day 1',
  },
  wpcFronts: {
    url: `${VECTOR}/outlooks/natl_fcst_wx_chart/MapServer`,
    layers: 'show:1,2',
    opacity: 0.95,
    refreshMinutes: 30,
    title: 'Surface fronts',
  },
  droughtOutlook: {
    url: `${VECTOR}/outlooks/cpc_drought_outlk/MapServer`,
    layers: 'show:1',
    opacity: 0.5,
    refreshMinutes: 60,
    title: 'Monthly drought outlook',
  },
  floodHazard: {
    url: 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer',
    layers: 'show:28',
    opacity: 0.5,
    refreshMinutes: 24 * 60,
    minZoom: 11,
    title: 'FEMA flood zone',
  },
};

/** The ArcGIS layer a catalog key draws, if it's one of these. */
export function arcgisKeyFor(layerKey: string): string | null {
  return ARCGIS_LAYERS[layerKey] ? layerKey : null;
}

/** Tile URL template for Mapbox, with a refresh bucket so tiles reload as the data changes. */
export function arcgisTileUrl(def: ArcgisLayerDef, now = Date.now()): string {
  const bucket = Math.floor(now / (def.refreshMinutes * 60_000));
  const params = [
    'bbox={bbox-epsg-3857}',
    'bboxSR=3857',
    'imageSR=3857',
    'size=512,512',
    'format=png32',
    'transparent=true',
    'dpi=144',
    'f=image',
    `_r=${bucket}`,
  ];
  if (def.layers) params.push(`layers=${encodeURIComponent(def.layers)}`);
  if (def.layerDefs) params.push(`layerDefs=${encodeURIComponent(JSON.stringify(def.layerDefs))}`);
  return `${def.url}/export?${params.join('&')}`;
}

export interface IdentifyResult {
  title: string;
  layerName: string;
  attributes: Record<string, string>;
}

const HIDDEN_FIELDS = /^(objectid|shape.*|fid|globalid|idp_.*|st_.*|.*_id|cap_id|gis .*|.*ingest.*|.*file ?date.*)$/i;

/** Features of one layer at a point (ArcGIS identify), with readable attributes only. */
export async function identifyArcgis(def: ArcgisLayerDef, lng: number, lat: number, zoom: number): Promise<IdentifyResult[]> {
  // A map extent around the tap sized so `tolerance` pixels ≈ a fingertip at this zoom.
  const span = 360 / 2 ** zoom;
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    sr: '4326',
    layers: def.layers ? def.layers.replace('show', 'visible') : 'visible',
    tolerance: '8',
    mapExtent: `${lng - span},${lat - span},${lng + span},${lat + span}`,
    imageDisplay: '512,512,96',
    returnGeometry: 'false',
    f: 'json',
  });
  if (def.layerDefs) params.set('layerDefs', JSON.stringify(def.layerDefs));
  const res = await fetch(`${def.url}/identify?${params.toString()}`);
  if (!res.ok) return [];
  const body = await res.json();
  return (body?.results ?? []).slice(0, 8).map((r: any) => {
    const attributes: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.attributes ?? {})) {
      if (HIDDEN_FIELDS.test(k) || v == null || v === '' || v === 'Null') continue;
      attributes[k] = String(v);
    }
    return { title: def.title, layerName: r.layerName ?? '', attributes };
  });
}
