/**
 * goesSatellite.js
 * Configuration and clients for the live map's Satellite layer: which
 * satellites, regions and products exist, which combinations are valid, and
 * where each one's imagery and timestamps come from.
 *
 * Two public sources, both already reprojected to Web Mercator, so the
 * browser only ever downloads small map tiles (never raw ABI files):
 *
 *  - Iowa Environmental Mesonet (IEM) WMS: every ABI band (1-16) per scan
 *    sector (CONUS/PACUS, Full Disk, Mesoscale 1/2, Puerto Rico, Alaska,
 *    Hawaii), latest scan only. Scan times come from IEM's per-band JSON.
 *  - NASA GIBS WMTS: GOES-East/West full-disk mosaics every 10 minutes with
 *    a time dimension (GeoColor, Band 2, Band 13, Fire Temperature, Air Mass,
 *    Dust). These drive the recent-imagery loop. Frame times come from GIBS
 *    DescribeDomains (a few hundred bytes), not the multi-MB capabilities.
 *
 * Everything satellite-specific lives in the tables below; components only
 * call the helpers, so adding a satellite, region or product is a config edit.
 * Availability mirrors what the sources publish (checked against IEM's WMS
 * GetCapabilities and GIBS's WMTS capabilities, Oct 2026).
 */

const IEM_WMS = 'https://mesonet.agron.iastate.edu/cgi-bin/wms';
import { withClock } from '../utils/formatUtils';
const IEM_LATEST = 'https://mesonet.agron.iastate.edu/data/gis/images/GOES';
const GIBS_WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const TIMEOUT_MS = 15 * 1000;

// ── Satellites ───────────────────────────────────────────────────────────────

export const SATELLITES = [
  { id: 'goes-east', label: 'GOES-East', platform: 'GOES-19', iemService: 'goes_east', gibsPrefix: 'GOES-East' },
  { id: 'goes-west', label: 'GOES-West', platform: 'GOES-18', iemService: 'goes_west', gibsPrefix: 'GOES-West' },
];

// ── Regions ──────────────────────────────────────────────────────────────────
// `sector` is the ABI scan sector whose imagery is drawn (IEM layer prefix).
// Scan sectors are real data; "view" regions are areas of a scan sector that
// the map zooms to (CONUS/Full Disk imagery). Mesoscale sectors move with the
// weather, so they have no fixed bounds to zoom to.

const ALL_BANDS = Array.from({ length: 16 }, (_, i) => i + 1);

export const SECTORS = {
  conus: { iem: 'conus', bands: ALL_BANDS, mesoscale: false },
  fulldisk: { iem: 'fulldisk', bands: ALL_BANDS, mesoscale: false },
  meso1: { iem: 'mesoscale-1', bands: ALL_BANDS, mesoscale: true },
  meso2: { iem: 'mesoscale-2', bands: ALL_BANDS, mesoscale: true },
  // IEM's Puerto Rico sector carries only these bands.
  puertorico: { iem: 'puertorico', bands: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 15], mesoscale: false },
  alaska: { iem: 'alaska', bands: ALL_BANDS, mesoscale: false },
  hawaii: { iem: 'hawaii', bands: ALL_BANDS, mesoscale: false },
};

/** bounds: [west, south, east, north] */
export const REGIONS = [
  { id: 'conus', label: 'CONUS', kind: 'sector', sector: 'conus', satellites: ['goes-east'], bounds: [-125, 24, -66, 50] },
  { id: 'pacus', label: 'PACUS (Western U.S. & Pacific)', kind: 'sector', sector: 'conus', satellites: ['goes-west'], bounds: [-140, 22, -100, 52] },
  { id: 'fulldisk', label: 'Full Disk', kind: 'sector', sector: 'fulldisk', satellites: ['goes-east', 'goes-west'] },
  { id: 'meso1', label: 'Mesoscale 1', kind: 'sector', sector: 'meso1', satellites: ['goes-east', 'goes-west'] },
  { id: 'meso2', label: 'Mesoscale 2', kind: 'sector', sector: 'meso2', satellites: ['goes-east', 'goes-west'] },
  { id: 'puerto-rico', label: 'Puerto Rico', kind: 'sector', sector: 'puertorico', satellites: ['goes-east'], bounds: [-72, 15, -62, 21] },
  { id: 'alaska', label: 'Alaska', kind: 'sector', sector: 'alaska', satellites: ['goes-west'], bounds: [-170, 50, -130, 72] },
  { id: 'hawaii', label: 'Hawaii', kind: 'sector', sector: 'hawaii', satellites: ['goes-west'], bounds: [-162, 18, -154, 23] },

  { id: 'northeast', label: 'Northeast', kind: 'view', sector: 'conus', satellites: ['goes-east'], bounds: [-82, 37, -66, 48] },
  { id: 'southeast', label: 'Southeast', kind: 'view', sector: 'conus', satellites: ['goes-east'], bounds: [-92, 24, -75, 37] },
  { id: 'gulf', label: 'Gulf of America', kind: 'view', sector: 'conus', satellites: ['goes-east'], bounds: [-98, 18, -80, 31] },
  { id: 'caribbean', label: 'Caribbean', kind: 'view', sector: 'fulldisk', satellites: ['goes-east'], bounds: [-88, 9, -59, 25] },
  { id: 'mexico', label: 'Mexico', kind: 'view', sector: 'fulldisk', satellites: ['goes-east', 'goes-west'], bounds: [-118, 14, -86, 33] },
  { id: 'east-pacific', label: 'Mexico & East Pacific', kind: 'view', sector: 'fulldisk', satellites: ['goes-west'], bounds: [-140, 5, -95, 33] },
  { id: 'central-america', label: 'Central America', kind: 'view', sector: 'fulldisk', satellites: ['goes-east'], bounds: [-93, 6, -76, 19] },
  { id: 'atlantic', label: 'Atlantic', kind: 'view', sector: 'fulldisk', satellites: ['goes-east'], bounds: [-80, 10, -20, 50] },
  { id: 'western-us', label: 'Western U.S.', kind: 'view', sector: 'conus', satellites: ['goes-west'], bounds: [-125, 31, -102, 49] },
  { id: 'pacific-northwest', label: 'Pacific Northwest', kind: 'view', sector: 'conus', satellites: ['goes-west'], bounds: [-125, 41, -110, 49.5] },
  { id: 'pacific-southwest', label: 'Pacific Southwest', kind: 'view', sector: 'conus', satellites: ['goes-west'], bounds: [-124, 31, -109, 42] },
  { id: 'pacific', label: 'Pacific', kind: 'view', sector: 'fulldisk', satellites: ['goes-west'], bounds: [-180, 0, -115, 55] },
];

/**
 * Longitude west of which GOES-West has the better view: about halfway
 * between GOES-East (75.2°W) and GOES-West (137.0°W), so East and Central
 * Pacific storms go to West and Atlantic/Gulf/Caribbean ones to East.
 */
const WEST_OF_LNG = -106;
const STORM_BOX_DEG = { lng: 9, lat: 6 };

/**
 * Selection and zoom for watching a storm at (lng, lat): the satellite that
 * sees it best, the smallest full-disk view containing it (full-disk imagery
 * covers open ocean that CONUS sectors miss), and GeoColor — infrared clouds
 * at night, and loopable.
 */
export function stormSatelliteView(lng, lat) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const satellite = lng < WEST_OF_LNG ? 'goes-west' : 'goes-east';
  const inside = ([w, s, e, n]) => lng >= w && lng <= e && lat >= s && lat <= n;
  const area = ([w, s, e, n]) => (e - w) * (n - s);
  const views = REGIONS
    .filter((r) => r.kind === 'view' && r.sector === 'fulldisk' && r.satellites.includes(satellite) && r.bounds && inside(r.bounds))
    .sort((a, b) => area(a.bounds) - area(b.bounds));
  return {
    selection: { satellite, region: views[0]?.id ?? 'fulldisk', product: 'true-color' },
    bounds: [lng - STORM_BOX_DEG.lng, lat - STORM_BOX_DEG.lat, lng + STORM_BOX_DEG.lng, lat + STORM_BOX_DEG.lat],
  };
}

// ── Products ─────────────────────────────────────────────────────────────────
// band: ABI band drawn from IEM (latest scan, any sector that carries it).
// gibs: GIBS layer suffix + tile matrix level (10-minute frames; loopable).
// When both exist, the latest image comes from IEM (sharper, newer) and the
// loop from GIBS. legend: key into LEGENDS, per source.

export const PRODUCT_GROUPS = ['Visible', 'Water Vapor', 'Infrared', 'Composites', 'Fire'];

export const PRODUCTS = [
  { id: 'true-color', label: 'True Color', detail: 'GeoColor', group: 'Visible', gibs: { layer: 'ABI_GeoColor', level: 7 }, legend: { gibs: 'trueColor' } },
  { id: 'blue', label: 'Blue', detail: 'Band 1 · 0.47 µm', group: 'Visible', band: 1, legend: { iem: 'reflectance' } },
  { id: 'visible', label: 'Visible', detail: 'Band 2 · 0.64 µm', group: 'Visible', band: 2, gibs: { layer: 'ABI_Band2_Red_Visible_1km', level: 7 }, legend: { iem: 'reflectance', gibs: 'reflectance' } },
  { id: 'veggie', label: 'Veggie', detail: 'Band 3 · 0.86 µm', group: 'Visible', band: 3, legend: { iem: 'reflectance' } },
  { id: 'cirrus', label: 'Cirrus', detail: 'Band 4 · 1.37 µm', group: 'Visible', band: 4, legend: { iem: 'reflectance' } },
  { id: 'snow-ice', label: 'Snow/Ice', detail: 'Band 5 · 1.6 µm', group: 'Visible', band: 5, legend: { iem: 'reflectance' } },
  { id: 'cloud-particle', label: 'Cloud Particle Size', detail: 'Band 6 · 2.2 µm', group: 'Visible', band: 6, legend: { iem: 'reflectance' } },

  { id: 'upper-wv', label: 'Upper Water Vapor', detail: 'Band 8 · 6.2 µm', group: 'Water Vapor', band: 8, legend: { iem: 'waterVapor' } },
  { id: 'mid-wv', label: 'Mid Water Vapor', detail: 'Band 9 · 6.9 µm', group: 'Water Vapor', band: 9, legend: { iem: 'waterVapor' } },
  { id: 'lower-wv', label: 'Lower Water Vapor', detail: 'Band 10 · 7.3 µm', group: 'Water Vapor', band: 10, legend: { iem: 'waterVapor' } },

  { id: 'clean-ir', label: 'Clean IR', detail: 'Band 13 · 10.3 µm', group: 'Infrared', band: 13, gibs: { layer: 'ABI_Band13_Clean_Infrared', level: 6 }, legend: { iem: 'infrared', gibs: 'infraredColor' } },
  { id: 'ir', label: 'IR', detail: 'Band 14 · 11.2 µm', group: 'Infrared', band: 14, legend: { iem: 'infrared' } },
  { id: 'ir-window', label: 'IR Window', detail: 'Band 15 · 12.3 µm', group: 'Infrared', band: 15, legend: { iem: 'infrared' } },
  { id: 'co2', label: 'CO₂ / Upper Atmosphere', detail: 'Band 16 · 13.3 µm', group: 'Infrared', band: 16, legend: { iem: 'infrared' } },
  { id: 'cloud-top-phase', label: 'Cloud Top Phase', detail: 'Band 11 · 8.4 µm', group: 'Infrared', band: 11, legend: { iem: 'infrared' } },
  { id: 'ozone', label: 'Ozone', detail: 'Band 12 · 9.6 µm', group: 'Infrared', band: 12, legend: { iem: 'infrared' } },

  { id: 'air-mass', label: 'Air Mass', detail: 'RGB', group: 'Composites', gibs: { layer: 'ABI_Air_Mass', level: 6 }, legend: { gibs: 'airMass' } },
  { id: 'dust', label: 'Dust', detail: 'RGB', group: 'Composites', gibs: { layer: 'ABI_Dust', level: 7 }, legend: { gibs: 'dust' } },

  { id: 'fire-temperature', label: 'Fire Temperature', detail: 'RGB', group: 'Fire', gibs: { layer: 'ABI_FireTemp', level: 7 }, legend: { gibs: 'fireTemperature' } },
  { id: 'shortwave-ir', label: 'Fire / Hotspot', detail: 'Band 7 · 3.9 µm', group: 'Fire', band: 7, legend: { iem: 'shortwave' } },
];

/** Shown when the layer is first switched on: the same imagery as the old "GOES East Imagery" toggle. */
export const DEFAULT_SELECTION = { satellite: 'goes-east', region: 'conus', product: 'visible' };

export const LOOP_HOURS = [1, 2, 3];
export const GIBS_FRAME_MINUTES = 10;

// ── Legends ─────────────────────────────────────────────────────────────────
// Qualitative, matching how each source colours the imagery.

export const LEGENDS = {
  trueColor: {
    note: 'Natural color by day. At night, GeoColor shows infrared clouds over city lights.',
  },
  reflectance: {
    gradient: ['#000000', '#555555', '#aaaaaa', '#ffffff'],
    ends: ['Low reflectance', 'Clouds, snow'],
    note: 'Daytime only: reflected sunlight. Brighter means more reflective.',
  },
  waterVapor: {
    gradient: ['#c2410c', '#facc15', '#9ca3af', '#1e3a8a', '#e0e7ff'],
    ends: ['Dry / warm', 'Moist / cold'],
    note: 'Moisture in the column the band senses. Not visible surface features.',
  },
  infrared: {
    gradient: ['#1f1f1f', '#6b6b6b', '#ffffff', '#3b82f6', '#d946ef'],
    ends: ['Warm surface', 'Cold cloud tops'],
    note: 'Brightness temperature, day and night. The coldest, tallest tops are colored blue to magenta.',
  },
  infraredColor: {
    gradient: ['#3a3a3a', '#d4d4d4', '#2563eb', '#22c55e', '#facc15', '#dc2626'],
    ends: ['Warm', 'Coldest tops'],
    note: 'Brightness temperature (NASA GIBS enhancement). Colors mark progressively colder, taller cloud tops.',
  },
  shortwave: {
    gradient: ['#ffffff', '#9a9a9a', '#3a3a3a', '#000000'],
    ends: ['Cold (clouds)', 'Hot'],
    note: 'Sensitive to intense heat: active fires show as small dark hot spots. Confirm with fire detections.',
  },
  fireTemperature: {
    gradient: ['#7f1d1d', '#ef4444', '#f97316', '#facc15', '#ffffff'],
    ends: ['Cooler fire', 'Hottest fire'],
    note: 'Fires appear red, then orange, yellow and white as they intensify. Background colors are not fire.',
  },
  airMass: {
    swatches: [
      { color: '#16a34a', label: 'Warm, moist air mass' },
      { color: '#7c3aed', label: 'Cold air mass' },
      { color: '#c2410c', label: 'Dry upper air (jet / intrusion)' },
      { color: '#f5f5f4', label: 'Thick high clouds' },
    ],
  },
  dust: {
    swatches: [
      { color: '#ec4899', label: 'Airborne dust' },
      { color: '#7f1d1d', label: 'Thick high ice cloud' },
    ],
    note: 'Night and day. Other colors are clouds and the surface.',
  },
};

// ── Lookups ─────────────────────────────────────────────────────────────────

export const getSatellite = (id) => SATELLITES.find((s) => s.id === id) ?? null;
export const getRegion = (id) => REGIONS.find((r) => r.id === id) ?? null;
export const getProduct = (id) => PRODUCTS.find((p) => p.id === id) ?? null;

/** Regions the satellite actually scans or covers, scan sectors first. */
export function regionsFor(satelliteId) {
  return REGIONS.filter((r) => r.satellites.includes(satelliteId));
}

export function isMesoscale(region) {
  return Boolean(region && SECTORS[region.sector]?.mesoscale);
}

function iemCarries(product, region) {
  return Boolean(product?.band && SECTORS[region.sector]?.bands.includes(product.band));
}

function gibsCovers(product, region) {
  // GIBS layers are full-disk mosaics: they cover every fixed region, but not
  // the moving 1-minute mesoscale sectors.
  return Boolean(product?.gibs) && !isMesoscale(region);
}

/** { ok: true } or { ok: false, reason } for one satellite/region/product. */
export function productAvailability(productId, satelliteId, regionId) {
  const product = getProduct(productId);
  const satellite = getSatellite(satelliteId);
  const region = getRegion(regionId);
  if (!product || !satellite) return { ok: false, reason: 'Unknown product' };
  if (!region || !region.satellites.includes(satellite.id)) {
    return { ok: false, reason: `${region?.label ?? 'This region'} is not covered by ${satellite.label}` };
  }
  if (iemCarries(product, region) || gibsCovers(product, region)) return { ok: true };
  if (isMesoscale(region)) return { ok: false, reason: 'Not produced for mesoscale sectors' };
  return { ok: false, reason: `Not produced for ${region.label}` };
}

/** Whether a recent-imagery loop exists for this product and region. */
export function loopAvailable(productId, regionId) {
  const product = getProduct(productId);
  const region = getRegion(regionId);
  return Boolean(product && region && gibsCovers(product, region));
}

/**
 * Brings a (possibly user- or URL-supplied) selection to a valid one. Never
 * silent: anything that had to change is described in `notice`.
 */
export function normalizeSelection(input = {}) {
  const notices = [];
  let satellite = getSatellite(input.satellite) ? input.satellite : DEFAULT_SELECTION.satellite;
  if (input.satellite && satellite !== input.satellite) notices.push(`Unknown satellite "${input.satellite}"`);
  const satLabel = getSatellite(satellite).label;

  let region = input.region ?? DEFAULT_SELECTION.region;
  // Each satellite's "CONUS" scan sector (GOES-West's is PACUS): the same choice, not a substitution.
  if (region === 'conus' && satellite === 'goes-west') region = 'pacus';
  if (region === 'pacus' && satellite === 'goes-east') region = 'conus';
  const regionDef = getRegion(region);
  if (!regionDef || !regionDef.satellites.includes(satellite)) {
    const fallback = regionsFor(satellite)[0];
    if (input.region) notices.push(`${regionDef?.label ?? `"${input.region}"`} isn't available from ${satLabel}. Showing ${fallback.label}.`);
    region = fallback.id;
  }

  let product = input.product ?? DEFAULT_SELECTION.product;
  const availability = productAvailability(product, satellite, region);
  if (!availability.ok) {
    const label = getProduct(product)?.label ?? `"${product}"`;
    if (input.product) notices.push(`${label} isn't available for ${getRegion(region).label} (${availability.reason.toLowerCase()}). Showing Visible.`);
    product = 'visible';
  }

  return { selection: { satellite, region, product }, notice: notices.join(' ') || null };
}

/**
 * Where the image currently shown comes from.
 *   latest: IEM when it carries the band for this sector, otherwise GIBS's newest frame.
 *   frameTime: a loop frame, always GIBS.
 */
export function resolveSource({ satellite, region, product }, { frameTime = null } = {}) {
  const sat = getSatellite(satellite);
  const reg = getRegion(region);
  const prod = getProduct(product);
  if (!sat || !reg || !prod) return null;
  if (!frameTime && iemCarries(prod, reg)) {
    return {
      kind: 'iem',
      layer: `${SECTORS[reg.sector].iem}_ch${String(prod.band).padStart(2, '0')}`,
      service: sat.iemService,
      legend: prod.legend.iem,
    };
  }
  if (gibsCovers(prod, reg)) {
    return {
      kind: 'gibs',
      layer: `${sat.gibsPrefix}_${prod.gibs.layer}`,
      level: prod.gibs.level,
      time: frameTime,
      legend: prod.legend.gibs,
    };
  }
  return null;
}

// ── Tile URLs ───────────────────────────────────────────────────────────────

const envOr = (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim() : fallback);

// Deployments could already point the old East/West visible toggles at their
// own tile service; keep honouring that for the matching CONUS Band 2 view.
const VISIBLE_OVERRIDES = {
  'goes-east': envOr(import.meta.env.VITE_GOES_EAST_VISIBLE_TILE_URL, null),
  'goes-west': envOr(import.meta.env.VITE_GOES_WEST_VISIBLE_TILE_URL, null),
};

/** IEM WMS tile template. `version` (the scan time) busts the tile cache when a new scan lands. */
export function iemTileUrl(source, version = null, satelliteId = null) {
  const override = satelliteId && source.layer === 'conus_ch02' ? VISIBLE_OVERRIDES[satelliteId] : null;
  if (override) return override;
  return `${IEM_WMS}/${source.service}.cgi?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap`
    + `&LAYERS=${source.layer}&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857`
    + '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}'
    + (version ? `&_v=${encodeURIComponent(version)}` : '');
}

/** GIBS WMTS tile template for one frame (or GIBS's own latest when time is null). */
export function gibsTileUrl(layer, level, time = null) {
  return `${GIBS_WMTS}/${layer}/default/${time ?? 'default'}/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.png`;
}

export function attributionFor(source) {
  if (!source) return null;
  return source.kind === 'iem'
    ? 'NOAA GOES ABI via Iowa Environmental Mesonet'
    : 'NOAA GOES ABI via NASA GIBS';
}

// ── Timestamps ──────────────────────────────────────────────────────────────

/** IEM's "latest scan" JSON for one sector/band, e.g. conus/channel02/GOES-19_C02.json. */
export function iemScanTimeUrl(satelliteId, regionId, productId) {
  const sat = getSatellite(satelliteId);
  const reg = getRegion(regionId);
  const prod = getProduct(productId);
  if (!sat || !reg || !prod?.band) return null;
  const nn = String(prod.band).padStart(2, '0');
  return `${IEM_LATEST}/${SECTORS[reg.sector].iem}/channel${nn}/${sat.platform}_C${nn}.json`;
}

/** Scan time (ISO) of IEM's latest image, or null when IEM doesn't publish one (e.g. Hawaii). */
export async function fetchIemScanTime(url, { signal } = {}) {
  let res;
  try {
    res = await fetch(url, { signal: signal ?? AbortSignal.timeout(TIMEOUT_MS), cache: 'no-cache' });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error('Satellite imagery is unreachable', { cause: err });
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Satellite timestamp unavailable (HTTP ${res.status})`);
  const body = await res.json().catch(() => null);
  const valid = body?.meta?.valid;
  return valid && Number.isFinite(Date.parse(valid)) ? new Date(Date.parse(valid)).toISOString() : null;
}

/** "10:46 AM EDT · 4 min ago" for a scan or frame time. */
export function formatScanTime(isoTime, now = Date.now()) {
  if (!isoTime) return null;
  const t = Date.parse(isoTime);
  if (!Number.isFinite(t)) return null;
  const when = new Date(t).toLocaleTimeString([], withClock({ hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }));
  const minutes = Math.max(0, Math.round((now - t) / 60000));
  const ago = minutes < 1 ? 'just now' : minutes < 120 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
  return `${when} · ${ago}`;
}

const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

export function gibsDomainsUrl(layer, level, now = Date.now(), hours = Math.max(...LOOP_HOURS) + 1) {
  const start = iso(Math.floor((now - hours * 3600e3) / 60e3) * 60e3);
  const end = iso(Math.ceil((now + 3600e3) / 60e3) * 60e3);
  return `${GIBS_WMTS}/1.0.0/${layer}/default/GoogleMapsCompatible_Level${level}/all/${start}--${end}.xml`;
}

/**
 * Expands a GIBS time domain ("a/b/PT10M,c,d/e/PT10M") into a sorted list of
 * frame times. Gaps between intervals are real missing scans and are skipped.
 */
export function parseGibsDomain(xml) {
  const match = /<Domain>([^<]*)<\/Domain>/.exec(xml ?? '');
  if (!match) return [];
  const times = new Set();
  for (const part of match[1].split(',').map((s) => s.trim()).filter(Boolean)) {
    const [start, end, period] = part.split('/');
    const startMs = Date.parse(start);
    if (!Number.isFinite(startMs)) continue;
    if (!end) { times.add(iso(startMs)); continue; }
    const endMs = Date.parse(end);
    const minutes = Number(/^PT(\d+)M$/.exec(period ?? '')?.[1]) || GIBS_FRAME_MINUTES;
    if (!Number.isFinite(endMs)) continue;
    for (let t = startMs; t <= endMs && times.size < 1000; t += minutes * 60e3) times.add(iso(t));
  }
  return [...times].sort();
}

export async function fetchGibsFrameTimes(layer, level, { signal, now = Date.now() } = {}) {
  let res;
  try {
    res = await fetch(gibsDomainsUrl(layer, level, now), { signal: signal ?? AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error('Satellite imagery is unreachable', { cause: err });
  }
  if (!res.ok) throw new Error(`Satellite imagery unavailable (HTTP ${res.status})`);
  return parseGibsDomain(await res.text());
}

/** The last `hours` of frames ending at the newest one. */
export function loopFrames(times, hours) {
  if (!times.length) return [];
  const newest = Date.parse(times[times.length - 1]);
  const cutoff = newest - hours * 3600e3;
  return times.filter((t) => Date.parse(t) > cutoff).map((t) => ({ id: t, time: t }));
}

// ── URL state (?sat=goes-east&sat_region=conus&sat_product=visible) ─────────

export const SATELLITE_URL_KEYS = { satellite: 'sat', region: 'sat_region', product: 'sat_product' };

/** The selection a shared link asks for, or null when it isn't a satellite link. */
export function parseSatelliteQuery(search) {
  const p = new URLSearchParams(search);
  if (!p.has(SATELLITE_URL_KEYS.satellite)) return null;
  return {
    satellite: p.get(SATELLITE_URL_KEYS.satellite),
    region: p.get(SATELLITE_URL_KEYS.region) || undefined,
    product: p.get(SATELLITE_URL_KEYS.product) || undefined,
  };
}

/** Writes (or, with null, removes) the selection's keys on a URL. */
export function writeSatelliteQuery(url, selection) {
  for (const key of Object.values(SATELLITE_URL_KEYS)) url.searchParams.delete(key);
  if (selection) {
    for (const [field, key] of Object.entries(SATELLITE_URL_KEYS)) url.searchParams.set(key, selection[field]);
  }
  return url;
}
