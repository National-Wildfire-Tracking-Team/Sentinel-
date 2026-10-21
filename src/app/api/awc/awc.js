/**
 * awc.js
 * Aviation Weather Center Data API (aviationweather.gov/api/data, OpenAPI
 * v4.0), through netlify/edge-functions/awc-proxy.js at /api/awc/<route>.
 *
 * Every endpoint in the spec is a product here, each with its own switch in
 * the Aviation Weather Center drawer (LayerControl/AwcControls):
 *   metar + taf   → "Airport weather": a dot per METAR station, coloured by
 *                   flight rules, with a wind barb; a click reads that
 *                   station's METAR and TAF
 *   pirep, sigmet (split U.S. / international), gairmet (split Sierra /
 *   Tango / Zulu), airmet (Alaska), cwa, tcf → map layers
 *   windtemp, fcstdisc, mis, areafcst → text, read in the drawer
 *   airport, stationinfo, navaid, fix, obstacle, feature → navigation map
 *   layers, loaded for the map view once zoomed in
 * airsigmet and isigmet are deprecated subsets of sigmet and the dataserver
 * endpoint repeats metar/taf/pirep/sigmet/gairmet, so none are fetched.
 *
 * AWC allows 100 requests a minute and 400 results a query. Nothing here
 * polls faster than the product changes, and the CDN in front (awc-proxy)
 * collapses everyone's polls into one upstream request per TTL.
 */

export const AWC_BASE = '/api/awc';

// ─── Products ───────────────────────────────────────────────────────────────

/**
 * Drawer groups, in order. `key` is the AppContext layer switch; `kind` says
 * how it shows (map | text); `minZoom` gates viewport-loaded layers.
 */
export const AWC_GROUPS = [
  {
    label: 'Airports & pilot reports',
    layers: [
      { key: 'awcMetarTaf', label: 'Airport weather', sublabel: 'METAR & TAF · flight rules and wind at each airport', kind: 'map' },
      { key: 'awcPirep', label: 'Pilot reports', sublabel: 'PIREPs & AIREPs · turbulence and icing, last 90 min', kind: 'map' },
    ],
  },
  {
    // What to draw: one switch per hazard, across every advisory source below.
    label: 'Hazard shapes',
    hazards: true,
    layers: [
      { key: 'awcHzConvective', hz: ['CONV'], label: 'Thunderstorms & convection', sublabel: 'Convective SIGMETs, TS, CWAs, TCF', kind: 'hazard' },
      { key: 'awcHzTurbulence', hz: ['TURB', 'TURB_HI', 'TURB_LO'], label: 'Turbulence', sublabel: 'High & low level', kind: 'hazard' },
      { key: 'awcHzMtnWave', hz: ['MTW'], label: 'Mountain wave', sublabel: 'Severe mountain wave', kind: 'hazard' },
      { key: 'awcHzLlws', hz: ['LLWS'], label: 'Low-level wind shear', sublabel: 'Below 2,000 ft', kind: 'hazard' },
      { key: 'awcHzSfcWind', hz: ['SFC_WND'], label: 'Strong surface wind', sublabel: 'Sustained over 30 kt', kind: 'hazard' },
      { key: 'awcHzIcing', hz: ['ICE'], label: 'Icing', sublabel: 'Moderate or greater', kind: 'hazard' },
      { key: 'awcHzFreezing', hz: ['FZLVL', 'M_FZLVL'], label: 'Freezing level', sublabel: 'Contour lines', kind: 'hazard' },
      { key: 'awcHzIfr', hz: ['IFR'], label: 'IFR', sublabel: 'Low ceilings & visibility', kind: 'hazard' },
      { key: 'awcHzMtnObsc', hz: ['MT_OBSC'], label: 'Mountain obscuration', sublabel: 'Clouds, precipitation, smoke or haze', kind: 'hazard' },
      { key: 'awcHzPrecip', hz: ['PCPN'], label: 'Precipitation', sublabel: 'From Center Weather Advisories', kind: 'hazard' },
      { key: 'awcHzTropical', hz: ['TC'], label: 'Tropical cyclone', sublabel: 'International SIGMETs', kind: 'hazard' },
      { key: 'awcHzAsh', hz: ['VA'], label: 'Volcanic ash', sublabel: 'Ash clouds', kind: 'hazard' },
      { key: 'awcHzDust', hz: ['DS', 'SS'], label: 'Dust & sand storms', sublabel: 'Reduced visibility', kind: 'hazard' },
      { key: 'awcHzOther', hz: ['UNK'], label: 'Other hazards', sublabel: 'Anything not listed above', kind: 'hazard' },
    ],
  },
  {
    // Where shapes come from; a shape draws when its source and its hazard are both on.
    label: 'Advisory sources',
    layers: [
      { key: 'awcSigmetUs', label: 'SIGMETs · U.S.', sublabel: 'Convective & non-convective, U.S.-issued', kind: 'map' },
      { key: 'awcSigmetIntl', label: 'SIGMETs · international', sublabel: 'Issued by other countries', kind: 'map' },
      { key: 'awcCwa', label: 'Center Weather Advisories', sublabel: 'Short-term CWSU advisories', kind: 'map' },
      { key: 'awcGairmetSierra', label: 'G-AIRMET Sierra', sublabel: 'IFR & mountain obscuration', kind: 'map' },
      { key: 'awcGairmetTango', label: 'G-AIRMET Tango', sublabel: 'Turbulence, low-level wind shear, surface wind', kind: 'map' },
      { key: 'awcGairmetZulu', label: 'G-AIRMET Zulu', sublabel: 'Icing & freezing level', kind: 'map' },
      { key: 'awcAirmetAk', label: 'AIRMETs · Alaska', sublabel: 'Alaska AIRMETs (G-AIRMETs cover the lower 48)', kind: 'map' },
      { key: 'awcTcf', label: 'Convective forecast (TCF)', sublabel: 'Traffic Flow Management convective forecast', kind: 'map' },
    ],
  },
  {
    label: 'Forecasts & discussions',
    layers: [
      { key: 'awcWindTemp', label: 'Winds & temps aloft', sublabel: 'FB winds table · 3,000–39,000 ft', kind: 'text' },
      { key: 'awcFcstDisc', label: 'Aviation forecast discussion', sublabel: 'From the NWS office you pick', kind: 'text' },
      { key: 'awcMis', label: 'Meteorological Impact Statements', sublabel: 'CWSU outlooks · every center', kind: 'text' },
      { key: 'awcAreaFcst', label: 'Area forecasts · Alaska', sublabel: 'Alaska text area forecasts', kind: 'text' },
    ],
  },
  {
    label: 'Navigation',
    layers: [
      { key: 'awcAirports', label: 'Airports', sublabel: 'Larger airports · runways & frequencies', kind: 'map', minZoom: 7 },
      { key: 'awcStations', label: 'Observation stations', sublabel: 'Where reports come from', kind: 'map', minZoom: 7 },
      { key: 'awcNavaids', label: 'Navaids', sublabel: 'VOR, VORTAC, NDB & more', kind: 'map', minZoom: 7 },
      { key: 'awcFixes', label: 'Fixes & waypoints', sublabel: 'Named airspace fixes', kind: 'map', minZoom: 9 },
      { key: 'awcObstacles', label: 'Obstacles', sublabel: 'Towers & other tall obstructions', kind: 'map', minZoom: 10 },
      { key: 'awcFeatures', label: 'Landmarks', sublabel: 'Stadiums & other features', kind: 'map', minZoom: 8 },
    ],
  },
];

export const AWC_LAYERS = AWC_GROUPS.flatMap((g) => g.layers);
export const AWC_SUBLAYER_KEYS = AWC_LAYERS.map((l) => l.key);
export const AWC_LAYER_BY_KEY = Object.fromEntries(AWC_LAYERS.map((l) => [l.key, l]));
export const AWC_HAZARD_TOGGLES = AWC_LAYERS.filter((l) => l.kind === 'hazard');

/** Normalised hazard keys (hazardKey) whose switches are on, for a map filter. */
export function enabledHazards(layers) {
  return AWC_HAZARD_TOGGLES.filter((t) => layers?.[t.key]).flatMap((t) => t.hz);
}

/** Which hazard switch a normalised hazard key belongs to. */
export const hazardToggleFor = (hz) => AWC_HAZARD_TOGGLES.find((t) => t.hz.includes(hz)) ?? null;

/** Navigation layers: switch → API route. */
export const AWC_NAV_ROUTES = {
  awcAirports: 'airport',
  awcStations: 'stationinfo',
  awcNavaids: 'navaid',
  awcFixes: 'fix',
  awcObstacles: 'obstacle',
  awcFeatures: 'feature',
};

export const AWC_MAX_RESULTS = 400;

// ─── Fetching ───────────────────────────────────────────────────────────────

/**
 * GET /api/awc/<route>. AWC answers "valid request, nothing to report" with
 * 204 and no body (the proxy passes that on as an empty 200), so an empty
 * body is `empty`, not an error.
 * @param {string} route
 * @param {Record<string, string|number|undefined>} [params]
 * @param {{ signal?: AbortSignal, as?: 'json'|'text', empty?: any }} [opts]
 */
export async function fetchAwc(route, params = {}, { signal, as = 'json', empty = null } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.set(k, String(v));
  }
  const query = qs.toString().replace(/%2C/g, ',');
  const res = await fetch(`${AWC_BASE}/${route}${query ? `?${query}` : ''}`, { signal });
  if (!res.ok) throw new Error(`AWC ${route}: HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) return empty;
  return as === 'text' ? text : JSON.parse(text);
}

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

/** GeoJSON from a geojson-format route; always a FeatureCollection. */
export async function fetchAwcGeoJSON(route, params = {}, opts = {}) {
  const fc = await fetchAwc(route, { ...params, format: 'geojson' }, { ...opts, empty: EMPTY_FC });
  return fc?.features ? fc : EMPTY_FC;
}

/** Bytes → text, gunzipping when they're still gzip (magic 1f 8b). */
async function gunzipToText(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  return new TextDecoder().decode(bytes);
}

/** Every current METAR worldwide (AWC's cache file), as dots + full records. */
export async function fetchMetarCache(signal) {
  const res = await fetch(`${AWC_BASE}/metar-cache`, { signal });
  if (!res.ok) throw new Error(`AWC METARs: HTTP ${res.status}`);
  return metarCsvToCollection(await gunzipToText(await res.arrayBuffer()));
}

/** One station's latest METAR and current TAF, decoded (JSON format). */
export async function fetchStationReports(icaoId, signal) {
  const ids = String(icaoId || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(ids)) return { metar: null, taf: null };
  const [metars, tafs] = await Promise.all([
    fetchAwc('metar', { ids, format: 'json' }, { signal, empty: [] }),
    fetchAwc('taf', { ids, format: 'json' }, { signal, empty: [] }),
  ]);
  return {
    metar: Array.isArray(metars) ? metars[0] ?? null : null,
    taf: Array.isArray(tafs) ? tafs.find((t) => t.mostRecent) ?? tafs[0] ?? null : null,
  };
}

// ─── CSV (METAR cache file) ─────────────────────────────────────────────────

/** One CSV line → fields (quoted fields with doubled quotes), scanning by indexOf. */
export function parseCsvLine(line) {
  const out = [];
  const n = line.length;
  let i = 0;
  while (i <= n) {
    if (line[i] === '"') {
      let val = '';
      let j = i + 1;
      for (;;) {
        const q = line.indexOf('"', j);
        if (q === -1) { val += line.slice(j); i = n; break; }
        if (line[q + 1] === '"') { val += line.slice(j, q + 1); j = q + 2; continue; }
        val += line.slice(j, q);
        i = q + 1;
        break;
      }
      out.push(val);
      if (line[i] !== ',') break;
      i += 1;
    } else {
      const comma = line.indexOf(',', i);
      if (comma === -1) { out.push(line.slice(i)); break; }
      out.push(line.slice(i, comma));
      i = comma + 1;
    }
  }
  return out;
}

/**
 * CSV → rows of strings. Line-based: fields in AWC's files never span lines,
 * and this is several times faster than a character-by-character parser on
 * the ~5,000-row METAR file.
 */
export function parseCsv(text) {
  return String(text).split(/\r?\n/).filter((l) => l !== '').map(parseCsvLine);
}

const numOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const CATEGORIES = ['VFR', 'MVFR', 'IFR', 'LIFR'];
const normCategory = (v) => (CATEGORIES.includes(String(v || '').toUpperCase()) ? String(v).toUpperCase() : null);

/**
 * AWC's METAR cache CSV → { geojson, byId }. The CSV repeats sky_cover /
 * cloud_base_ft_agl once per layer, so columns are read by position.
 * Map features keep only what's drawn (nested values would be stringified by
 * Mapbox anyway); the full record is looked up by station id on click.
 */
export function metarCsvToCollection(text) {
  const rows = parseCsv(text);
  const headerAt = rows.findIndex((r) => r[0] === 'raw_text');
  if (headerAt === -1) return { geojson: EMPTY_FC, byId: new Map() };
  const header = rows[headerAt];
  const col = (name) => header.indexOf(name);
  const c = {
    raw: col('raw_text'), id: col('station_id'), time: col('observation_time'),
    lat: col('latitude'), lon: col('longitude'), temp: col('temp_c'), dewp: col('dewpoint_c'),
    wdir: col('wind_dir_degrees'), wspd: col('wind_speed_kt'), wgst: col('wind_gust_kt'),
    visib: col('visibility_statute_mi'), altim: col('altim_in_hg'), slp: col('sea_level_pressure_mb'),
    wx: col('wx_string'), cat: col('flight_category'), vv: col('vert_vis_ft'),
    type: col('metar_type'), elev: col('elevation_m'),
  };
  const coverCols = header.map((h, i) => (h === 'sky_cover' ? i : -1)).filter((i) => i >= 0);
  const baseCols = header.map((h, i) => (h === 'cloud_base_ft_agl' ? i : -1)).filter((i) => i >= 0);

  const byId = new Map();
  for (const r of rows.slice(headerAt + 1)) {
    const id = r[c.id];
    const lat = numOrNull(r[c.lat]);
    const lon = numOrNull(r[c.lon]);
    if (!id || lat == null || lon == null) continue;
    const clouds = coverCols
      .map((ci, k) => ({ cover: r[ci], base: numOrNull(r[baseCols[k]]) }))
      .filter((cl) => cl.cover);
    const wdirRaw = r[c.wdir];
    const rawOb = r[c.raw] || '';
    const record = {
      id,
      rawOb,
      obsTime: r[c.time] || null,
      lat,
      lon,
      temp: numOrNull(r[c.temp]),
      dewp: numOrNull(r[c.dewp]),
      wdir: numOrNull(wdirRaw),
      // The file writes a variable wind (VRB04KT) as direction 0; only the report says so.
      vrb: String(wdirRaw).toUpperCase() === 'VRB' || /\sVRB\d{2,3}(G\d{2,3})?(KT|MPS)\b/.test(rawOb),
      wspd: numOrNull(r[c.wspd]),
      wgst: numOrNull(r[c.wgst]),
      visib: r[c.visib] || null,
      altimInHg: numOrNull(r[c.altim]),
      slp: numOrNull(r[c.slp]),
      wx: r[c.wx] || null,
      clouds,
      vertVis: numOrNull(r[c.vv]),
      fltcat: normCategory(r[c.cat]),
      metarType: r[c.type] || 'METAR',
      elevM: numOrNull(r[c.elev]),
    };
    // A station can appear once per report (METAR and SPECI): keep the newest.
    const prev = byId.get(id);
    if (prev && (prev.obsTime || '') >= (record.obsTime || '')) continue;
    byId.set(id, record);
  }
  const features = [...byId.values()].map((record, i) => ({
    type: 'Feature',
    id: i,
    geometry: { type: 'Point', coordinates: [record.lon, record.lat] },
    properties: {
      id: record.id,
      fltcat: record.fltcat ?? 'UNK',
      wspd: record.wspd ?? 0,
      wgst: record.wgst,
      // Wind barb: needs a direction (not calm, not variable) and ≥ 5 kt once rounded.
      barb: record.wdir != null && !record.vrb ? barbBucket(record.wspd) : 0,
      wdir: record.wdir ?? 0,
    },
  }));
  return { geojson: { type: 'FeatureCollection', features }, byId };
}

// ─── Flight rules, wind, clouds ─────────────────────────────────────────────

export const FLIGHT_CATEGORY_COLORS = {
  VFR: '#22c55e',
  MVFR: '#3b82f6',
  IFR: '#ef4444',
  LIFR: '#d946ef',
  UNK: '#9ca3af',
};

export const FLIGHT_CATEGORY_LABELS = {
  VFR: 'VFR · ceiling above 3,000 ft and visibility above 5 mi',
  MVFR: 'MVFR · ceiling 1,000–3,000 ft and/or visibility 3–5 mi',
  IFR: 'IFR · ceiling 500 to below 1,000 ft and/or visibility 1 to below 3 mi',
  LIFR: 'LIFR · ceiling below 500 ft and/or visibility below 1 mi',
  UNK: 'Not reported',
};

/** Rounded to the nearest 5 kt, as a wind barb shows it. 0 = no barb. */
export function barbBucket(speedKt) {
  const s = Number(speedKt);
  if (!Number.isFinite(s) || s <= 0) return 0;
  return Math.min(195, Math.round(s / 5) * 5);
}

/** Barb parts for a speed: 50-kt pennants, 10-kt long lines, a 5-kt short line. */
export function barbParts(speedKt) {
  let rest = barbBucket(speedKt);
  const pennants = Math.floor(rest / 50);
  rest -= pennants * 50;
  const full = Math.floor(rest / 10);
  rest -= full * 10;
  return { pennants, full, half: rest >= 5 };
}

/** "6+", "10+", "1 1/2", "3/4", "M1/4", 2.5 → statute miles (number) or null. */
export function parseVisibility(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/^[PM]/, '').replace(/\+$/, '').replace(/SM$/, '');
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Lowest broken/overcast layer, or vertical visibility, in ft AGL. */
export function ceilingFt(clouds = [], vertVis = null) {
  const bases = (clouds || [])
    .filter((c) => ['BKN', 'OVC', 'OVX'].includes(String(c.cover).toUpperCase()) && Number.isFinite(Number(c.base)) && c.base != null)
    .map((c) => Number(c.base));
  if (Number.isFinite(Number(vertVis)) && vertVis != null) bases.push(Number(vertVis));
  return bases.length ? Math.min(...bases) : null;
}

/** FAA flight rules from ceiling (ft) and visibility (SM); null if neither is known. */
export function flightCategory(ceiling, visibility) {
  if (ceiling == null && visibility == null) return null;
  const c = ceiling ?? Infinity;
  const v = visibility ?? Infinity;
  if (c < 500 || v < 1) return 'LIFR';
  if (c < 1000 || v < 3) return 'IFR';
  if (c <= 3000 || v <= 5) return 'MVFR';
  return 'VFR';
}

/** "270° at 15 kt, gusts 25 kt" / "Variable at 3 kt" / "Calm". */
export function windText(wdir, wspd, wgst) {
  const spd = Number(wspd);
  if (!Number.isFinite(spd) || spd === 0) return 'Calm';
  const dir = String(wdir).toUpperCase() === 'VRB' || wdir == null ? 'Variable' : `${String(Math.round(Number(wdir))).padStart(3, '0')}°`;
  const gust = Number.isFinite(Number(wgst)) && wgst ? `, gusts ${Math.round(wgst)} kt` : '';
  return `${dir} at ${Math.round(spd)} kt${gust}`;
}

const COVER_WORDS = { SKC: 'Clear', CLR: 'Clear', CAVOK: 'Clear', NSC: 'No significant cloud', FEW: 'Few', SCT: 'Scattered', BKN: 'Broken', OVC: 'Overcast', OVX: 'Obscured' };

/** "Broken 1,200 ft · Overcast 3,000 ft". */
export function cloudsText(clouds = [], vertVis = null) {
  const parts = (clouds || []).map((c) => {
    const word = COVER_WORDS[String(c.cover).toUpperCase()] ?? c.cover;
    return c.base != null && Number.isFinite(Number(c.base)) ? `${word} ${Number(c.base).toLocaleString('en-US')} ft` : word;
  });
  if (vertVis != null && Number.isFinite(Number(vertVis))) parts.push(`Vertical visibility ${Number(vertVis).toLocaleString('en-US')} ft`);
  return parts.join(' · ');
}

export function visibilityText(v) {
  if (v == null || v === '') return null;
  const s = String(v);
  return s.endsWith('+') ? `${s.slice(0, -1)}+ mi` : `${s} mi`;
}

export const cToF = (c) => (c == null ? null : Math.round((Number(c) * 9) / 5 + 32));
export const hPaToInHg = (hpa) => (hpa == null ? null : Number(hpa) * 0.0295300);

// ─── TAF ────────────────────────────────────────────────────────────────────

const CHANGE_WORDS = { FM: 'From', TEMPO: 'Temporarily', BECMG: 'Becoming', PROB: 'Chance' };

/** API TAF (JSON format) → periods with times, change type and flight rules. */
export function tafPeriods(taf) {
  return (taf?.fcsts || []).map((f) => {
    const visibility = parseVisibility(f.visib);
    const ceiling = ceilingFt(f.clouds, f.vertVis);
    const change = f.fcstChange ? String(f.fcstChange).toUpperCase() : null;
    return {
      from: f.timeFrom ? new Date(f.timeFrom * 1000) : null,
      to: f.timeTo ? new Date(f.timeTo * 1000) : null,
      change,
      changeLabel: change
        ? (change === 'PROB' && f.probability ? `${f.probability}% chance` : CHANGE_WORDS[change] ?? change)
        : 'Initially',
      wind: f.wspd != null ? windText(f.wdir, f.wspd, f.wgst) : null,
      visibility: visibilityText(f.visib),
      clouds: cloudsText(f.clouds, f.vertVis),
      wx: f.wxString || null,
      windShear: f.wshearHgt != null ? `${f.wshearHgt * 100} ft: ${windText(f.wshearDir, f.wshearSpd)}` : null,
      category: flightCategory(ceiling, visibility),
    };
  });
}

/** Breaks a raw TAF onto one line per change group, as it's usually read. */
export function formatRawTaf(raw) {
  return String(raw || '').replace(/\s+(FM\d{6}|TEMPO|BECMG|PROB\d{2})/g, '\n  $1');
}

// ─── PIREPs ─────────────────────────────────────────────────────────────────

const INTENSITY_RANK = {
  NEG: 0, SMTH: 0, 'SMTH-LGT': 1, TRC: 1, 'TRC-LGT': 1, LGT: 1,
  'LGT-MOD': 2, MOD: 2, 'MOD-SEV': 3, SEV: 3, HVY: 3, 'SEV-EXTM': 4, EXTM: 4,
};

const rank = (v) => INTENSITY_RANK[String(v || '').toUpperCase()] ?? null;

/** Worst reported turbulence/icing (0 none … 4 extreme) and what it was. */
export function pirepSeverity(p) {
  const tb = Math.max(rank(p.tbInt1) ?? -1, rank(p.tbInt2) ?? -1);
  const ic = Math.max(rank(p.icgInt1) ?? -1, rank(p.icgInt2) ?? -1);
  const sev = Math.max(tb, ic, 0);
  const kind = tb >= 0 && ic >= 0 ? (tb >= ic ? 'TB' : 'IC') : tb >= 0 ? 'TB' : ic >= 0 ? 'IC' : '';
  return { sev, kind };
}

export const PIREP_SEVERITY_COLORS = ['#a1a1aa', '#facc15', '#f97316', '#ef4444', '#b91c1c'];
export const PIREP_SEVERITY_LABELS = ['None or smooth', 'Light', 'Moderate', 'Severe', 'Extreme'];

/** Adds sev / kind / urgent / fid to each PIREP for styling and click lookup. */
export function decoratePireps(fc) {
  return {
    type: 'FeatureCollection',
    features: (fc?.features || []).map((f, i) => {
      const { sev, kind } = pirepSeverity(f.properties || {});
      return {
        ...f,
        id: i,
        properties: {
          ...f.properties,
          fid: i,
          sev,
          kind,
          urgent: /URGENT|UUA/i.test(String(f.properties?.airepType || '')) || /\bUUA\b/.test(String(f.properties?.rawOb || '')),
        },
      };
    }),
  };
}

// ─── Advisories ─────────────────────────────────────────────────────────────

const HAZARD_ALIASES = {
  MTN_OBS: 'MT_OBSC', MTN_OBSC: 'MT_OBSC', MT_OBS: 'MT_OBSC',
  CONVECTIVE: 'CONV', TS: 'CONV', TSGR: 'CONV',
  SFC_WIND: 'SFC_WND',
  ICING: 'ICE',
};

/**
 * Normalised hazard key across products: "TURB-HI" → TURB_HI, "MT-OBSC" /
 * "MTN_OBS" → MT_OBSC, "TS" / "CONVECTIVE" → CONV. Anything unrecognised → UNK.
 */
export function hazardKey(h) {
  const raw = String(h || '').toUpperCase().trim().replace(/[-\s]/g, '_');
  const k = HAZARD_ALIASES[raw] ?? raw;
  return HAZARD_STYLES[k] ? k : 'UNK';
}

export const HAZARD_STYLES = {
  CONV: { color: '#ef4444', label: 'Thunderstorms / convection' },
  TURB: { color: '#f59e0b', label: 'Turbulence' },
  TURB_HI: { color: '#f59e0b', label: 'Turbulence, high level' },
  TURB_LO: { color: '#fbbf24', label: 'Turbulence, low level' },
  MTW: { color: '#fb923c', label: 'Mountain wave' },
  ICE: { color: '#38bdf8', label: 'Icing' },
  FZLVL: { color: '#60a5fa', label: 'Freezing level' },
  M_FZLVL: { color: '#93c5fd', label: 'Multiple freezing levels' },
  IFR: { color: '#a855f7', label: 'IFR conditions' },
  MT_OBSC: { color: '#c084fc', label: 'Mountain obscuration' },
  LLWS: { color: '#14b8a6', label: 'Low-level wind shear' },
  SFC_WND: { color: '#84cc16', label: 'Strong surface wind' },
  PCPN: { color: '#22d3ee', label: 'Precipitation' },
  VA: { color: '#a1a1aa', label: 'Volcanic ash' },
  TC: { color: '#ec4899', label: 'Tropical cyclone' },
  DS: { color: '#ca8a04', label: 'Duststorm' },
  SS: { color: '#ca8a04', label: 'Sandstorm' },
  UNK: { color: '#e5e7eb', label: 'Other' },
};

export const hazardStyle = (h) => HAZARD_STYLES[hazardKey(h)] ?? HAZARD_STYLES.UNK;

/** Mapbox colour expression over a feature's normalised `hz` property. */
export const HAZARD_COLOR_EXPRESSION = [
  'match', ['get', 'hz'],
  ...Object.entries(HAZARD_STYLES).flatMap(([k, s]) => [k, s.color]),
  HAZARD_STYLES.UNK.color,
];

/** Adds `hz` (normalised hazard) and `fid` (click lookup) to each feature. */
export function decorateAdvisories(features) {
  return {
    type: 'FeatureCollection',
    features: (features || []).map((f, i) => ({
      ...f,
      id: i,
      properties: { ...f.properties, fid: i, hz: hazardKey(f.properties?.hazard) },
    })),
  };
}

// U.S. issuing offices: AWC (domestic + New York/Oakland/Houston oceanic), Honolulu, Anchorage.
const US_SIGMET_ISSUERS = new Set(['KKCI', 'PHFO', 'PAWU']);

/** /sigmet holds both what /airsigmet (U.S.) and /isigmet (international) did. */
export function splitSigmets(fc) {
  const us = [];
  const intl = [];
  for (const f of fc?.features || []) {
    (US_SIGMET_ISSUERS.has(String(f.properties?.icaoId || '').toUpperCase()) ? us : intl).push(f);
  }
  return { us: decorateAdvisories(us), intl: decorateAdvisories(intl) };
}

/** /gairmet returns all three products; one collection per product. */
export function splitGairmets(fc) {
  const out = { SIERRA: [], TANGO: [], ZULU: [] };
  for (const f of fc?.features || []) {
    const p = String(f.properties?.product || '').toUpperCase();
    if (out[p]) out[p].push(f);
  }
  return {
    SIERRA: decorateAdvisories(out.SIERRA),
    TANGO: decorateAdvisories(out.TANGO),
    ZULU: decorateAdvisories(out.ZULU),
  };
}

/** TCF polygons with `fid`, plus coverage/confidence normalised for styling. */
export function decorateTcf(fc) {
  return {
    type: 'FeatureCollection',
    features: (fc?.features || []).map((f, i) => ({
      ...f,
      id: i,
      properties: {
        ...f.properties,
        fid: i,
        hz: 'CONV',
        conf: String(f.properties?.confidence || '').toLowerCase() === 'high' ? 'high' : 'low',
        cov: String(f.properties?.coverage || '').toLowerCase(),
      },
    })),
  };
}

/** Navigation features get a `fid` for click lookup; AWC sometimes adds one with no geometry. */
export function decorateNav(fc) {
  return {
    type: 'FeatureCollection',
    features: (fc?.features || [])
      .filter((f) => f?.geometry?.coordinates?.length)
      .map((f, i) => ({ ...f, id: i, properties: { ...f.properties, fid: i } })),
  };
}

/** Accent colour for a clicked AWC record (AwcLayers buildAwcRecord): flight rules, PIREP severity or hazard. */
export function awcAccentColor(record) {
  const p = record?.props || {};
  if (record?.key === 'awcMetarTaf') return FLIGHT_CATEGORY_COLORS[p.fltcat] ?? FLIGHT_CATEGORY_COLORS.UNK;
  if (record?.key === 'awcPirep') return PIREP_SEVERITY_COLORS[Number(p.sev) || 0];
  if (p.hz) return hazardStyle(p.hz).color;
  return null;
}

/** AWC times come as epoch seconds or ISO strings, depending on product and format. */
export function awcDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    const n = Number(v);
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  // TCF writes "20261020_2300".
  const m = String(v).match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})$/);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Map view → bbox ────────────────────────────────────────────────────────

/**
 * A map view's [w, s, e, n], snapped outward to a `step`-degree grid so
 * nearby views share one CDN entry, as AWC's `bbox` (lat0,lon0,lat1,lon1).
 */
export function snappedBbox([w, s, e, n], step) {
  const snap = (v, fn) => Number((fn(v / step) * step).toFixed(4));
  const lat0 = Math.max(-90, snap(s, Math.floor));
  const lon0 = Math.max(-180, snap(w, Math.floor));
  const lat1 = Math.min(90, snap(n, Math.ceil));
  const lon1 = Math.min(180, snap(e, Math.ceil));
  return `${lat0},${lon0},${lat1},${lon1}`;
}

/** Grid for a zoom: wider views snap coarser. */
export const bboxStepForZoom = (zoom) => (zoom >= 10 ? 0.25 : zoom >= 8 ? 0.5 : 1);
