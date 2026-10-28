/**
 * ArcGIS FeatureServer / MapServer `query` helpers for the point and line layers. The web reaches
 * these through its /api/arcgis/* proxies; native apps have no CORS, so the app asks directly.
 */
export interface Viewport {
  /** [west, south, east, north] */
  bounds: [number, number, number, number];
  zoom: number;
  center: [number, number];
  heading?: number;
  pitch?: number;
}

const TIMEOUT_MS = 20_000;

export async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Esri JSON point features → GeoJSON points (geometry.x/y in WGS84). */
export function esriPointsToGeoJSON(
  features: any[],
  toProps: (attrs: Record<string, any>) => Record<string, any> | null,
): GeoJSON.Feature[] {
  const out: GeoJSON.Feature[] = [];
  for (const f of features ?? []) {
    const x = f?.geometry?.x;
    const y = f?.geometry?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const props = toProps(f.attributes ?? {});
    if (!props) continue;
    out.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [x, y] } });
  }
  return out;
}

/** Query every page of a layer (servers cap each page at `pageSize`). */
export async function queryAllPages(
  layerUrl: string,
  params: Record<string, string>,
  { pageSize = 2000, maxPages = 8 }: { pageSize?: number; maxPages?: number } = {},
): Promise<any[]> {
  const all: any[] = [];
  for (let page = 0; page < maxPages; page++) {
    const qs = new URLSearchParams({
      ...params,
      resultOffset: String(page * pageSize),
      resultRecordCount: String(pageSize),
    });
    const body = await fetchJson(`${layerUrl}/query?${qs.toString()}`);
    const features = body?.features ?? [];
    all.push(...features);
    if (features.length < pageSize && !body?.exceededTransferLimit) break;
    if (features.length === 0) break;
  }
  return all;
}

/** The web's viewport query envelope: ±512 px around the center, padded 35% on each side. */
export function viewportEnvelope(view: Viewport, snapDegrees = 0): [number, number, number, number] {
  const [lng, lat] = view.center;
  const cos = Math.cos((lat * Math.PI) / 180);
  const mpp = (156543.03 * cos) / 2 ** view.zoom;
  const halfLng = (512 * mpp) / (111320 * Math.max(cos, 0.01));
  const halfLat = (512 * mpp) / 110540;
  let w = lng - halfLng * 1.7;
  let e = lng + halfLng * 1.7;
  let s = Math.max(-85, lat - halfLat * 1.7);
  let n = Math.min(85, lat + halfLat * 1.7);
  if (snapDegrees > 0) {
    w = Math.floor(w / snapDegrees) * snapDegrees;
    s = Math.floor(s / snapDegrees) * snapDegrees;
    e = Math.ceil(e / snapDegrees) * snapDegrees;
    n = Math.ceil(n / snapDegrees) * snapDegrees;
  }
  return [w, s, e, n];
}

/** GeoJSON features in an envelope from a FeatureServer/MapServer layer. */
export async function queryEnvelope(
  layerUrl: string,
  [w, s, e, n]: [number, number, number, number],
  extra: Record<string, string> = {},
): Promise<GeoJSON.FeatureCollection> {
  const qs = new URLSearchParams({
    where: '1=1',
    geometry: JSON.stringify({ xmin: w, ymin: s, xmax: e, ymax: n, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outSR: '4326',
    returnGeometry: 'true',
    f: 'geojson',
    resultRecordCount: '2000',
    ...extra,
  });
  const body = await fetchJson(`${layerUrl}/query?${qs.toString()}`);
  return { type: 'FeatureCollection', features: body?.features ?? [] };
}

export const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
};
