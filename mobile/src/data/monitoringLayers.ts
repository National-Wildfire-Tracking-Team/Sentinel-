/**
 * Monitoring, aviation and infrastructure layers, loaded the way the web's layer components do
 * (RAWSLayer, AirNowMonitorsLayer, CaliforniaCamerasLayer, WaterGaugesLayer, TfrLayer, AwcLayers,
 * NationalMapCollegesLayer, CriticalInfrastructureLayer, CaliforniaLandOwnershipLayer), but asking
 * the upstream services directly instead of through the web's /api proxies.
 */
import { inflate } from 'pako';

import {
  EMPTY_FC,
  esriPointsToGeoJSON,
  fetchJson,
  num,
  queryAllPages,
  queryEnvelope,
  viewportEnvelope,
  type Viewport,
} from './arcgisQuery';

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });

// ── RAWS ─────────────────────────────────────────────────────────────────────────────────────────

const RAWS_URL = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/PublicView_RAWS/FeatureServer/1';

export async function fetchRaws(): Promise<GeoJSON.FeatureCollection> {
  const features = await queryAllPages(RAWS_URL, { where: '1=1', outFields: '*', outSR: '4326', f: 'json' });
  return fc(
    esriPointsToGeoJSON(features, a => ({
      stationName: a.StationName ?? 'RAWS station',
      stationId: a.StationID ?? a.WXID ?? a.NESSID ?? a.NWSID ?? null,
      temp: num(a.AirTempStandPlace),
      relHumidity: num(a.RelativeHumidity),
      windSpeed: num(a.WindSpeedMPH),
      windDir: num(a.WindDirDegrees),
      windSpeedPeak: num(a.WindSpeedPeak),
      windDirPeak: num(a.WindDirPeak),
      precip: num(a.RainAccumulation),
      fuelMoisture: num(a.FuelMoisture),
      fuelTemp: num(a.FuelTemp),
      observationTime: num(a.ObservedDate),
      elevation: num(a.Elevation),
      state: a.State ?? null,
      county: a.County ?? null,
      agency: a.Agency ?? null,
      noaaUrl: a.NOAA_URL ?? a.MesoWestURL ?? null,
    })),
  );
}

// ── AirNow monitors ──────────────────────────────────────────────────────────────────────────────

const AIRNOW_URL = 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Air_Now_Monitor_Data_Public/FeatureServer/0';
const AIRNOW_FIELDS =
  'AQSID,SiteName,StateName,Status,PM25_AQI,PM25_AQI_LABEL,PM10_AQI,PM10_AQI_LABEL,OZONE_AQI,OZONE_AQI_LABEL,OZONEPM_AQI,OZONEPM_AQI_LABEL,PM_AQI,PM_AQI_LABEL,LocalTimeString,MonitorType';

export async function fetchAirNowMonitors(): Promise<GeoJSON.FeatureCollection> {
  const features = await queryAllPages(
    AIRNOW_URL,
    { where: "CountryCode='US' OR CountryCode='CA'", outFields: AIRNOW_FIELDS, outSR: '4326', f: 'json' },
    { pageSize: 2000, maxPages: 5 },
  );
  return fc(
    esriPointsToGeoJSON(features, a => ({
      aqsid: a.AQSID,
      siteName: a.SiteName ?? 'Air monitor',
      stateName: a.StateName ?? null,
      aqi: a.OZONEPM_AQI ?? a.PM_AQI ?? a.PM25_AQI ?? a.OZONE_AQI ?? null,
      aqiLabel: a.OZONEPM_AQI_LABEL ?? a.PM_AQI_LABEL ?? a.PM25_AQI_LABEL ?? a.OZONE_AQI_LABEL ?? 'ND',
      pm25Aqi: a.PM25_AQI ?? null,
      pm10Aqi: a.PM10_AQI ?? null,
      ozoneAqi: a.OZONE_AQI ?? null,
      localTime: a.LocalTimeString ?? null,
      monitorType: a.MonitorType ?? null,
    })),
  );
}

export function aqiCategory(aqi: number | null): string {
  if (aqi == null) return 'No data';
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

// ── Caltrans cameras ─────────────────────────────────────────────────────────────────────────────

export async function fetchCaltransCameras(): Promise<GeoJSON.FeatureCollection> {
  const districts = Array.from({ length: 12 }, (_, i) => i + 1);
  const results = await Promise.allSettled(
    districts.map(d => fetchJson(`https://cwwp2.dot.ca.gov/data/d${d}/cctv/cctvStatusD${String(d).padStart(2, '0')}.json`)),
  );
  const features: GeoJSON.Feature[] = [];
  results.forEach(r => {
    if (r.status !== 'fulfilled') return;
    (r.value?.data ?? []).forEach((entry: any, index: number) => {
      const c = entry?.cctv;
      const loc = c?.location ?? {};
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
      const image = c?.imageData ?? {};
      features.push({
        type: 'Feature',
        properties: {
          id: `${loc.district}-${index}`,
          name: loc.locationName || image.imageDescription || 'Caltrans Camera',
          nearbyPlace: loc.nearbyPlace ?? null,
          route: loc.route ?? null,
          direction: loc.direction ?? null,
          county: loc.county ?? null,
          imageUrl: image.static?.currentImageURL || null,
          streamUrl: image.streamingVideoURL || null,
          updateFrequencyMin: Number(image.static?.currentImageUpdateFrequency) || 1,
          inService: String(c?.inService).toLowerCase() === 'true',
        },
        geometry: { type: 'Point', coordinates: [lng, lat] },
      });
    });
  });
  return fc(features);
}

// ── River gauges ─────────────────────────────────────────────────────────────────────────────────

const GAUGES_URL = 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/water/riv_gauges/MapServer';
const ABOVE_ACTION = new Set(['action', 'minor', 'moderate', 'major']);

function floodCategory(status: unknown): string {
  const s = String(status ?? '').toLowerCase();
  for (const c of ['major', 'moderate', 'minor', 'action']) if (s.includes(c)) return c;
  if (!s || s === 'no_flood' || s === 'none' || s === 'normal') return 'no_flooding';
  return s;
}

export async function fetchWaterGauges(): Promise<GeoJSON.FeatureCollection> {
  const opts = { pageSize: 10000, maxPages: 6 };
  const [gauges, forecasts] = await Promise.all([
    queryAllPages(
      `${GAUGES_URL}/0`,
      { where: '1=1', outFields: 'gaugelid,status,location,waterbody,state,wfo,url,action,flood,moderate,major,observed,hdatum', outSR: '4326', f: 'geojson' },
      opts,
    ),
    queryAllPages(`${GAUGES_URL}/15`, { where: '1=1', outFields: 'gaugelid,status,forecast,action', returnGeometry: 'false', f: 'json' }, opts).catch(() => []),
  ]);
  const forecastById = new Map<string, any>();
  for (const f of forecasts) {
    const a = f.attributes ?? f.properties;
    if (a?.gaugelid) forecastById.set(a.gaugelid, a);
  }
  const features: GeoJSON.Feature[] = [];
  for (const g of gauges) {
    const p = g.properties ?? {};
    if (!g.geometry) continue;
    const fcst = forecastById.get(p.gaugelid);
    const actionStage = num(p.action);
    const forecastStage = fcst && num(fcst.forecast) != null && num(fcst.forecast)! > -999 ? num(fcst.forecast) : null;
    const forecastCategory = fcst ? floodCategory(fcst.status) : null;
    const forecastAboveAction =
      forecastCategory && ABOVE_ACTION.has(forecastCategory)
        ? true
        : forecastStage != null && actionStage != null && !fcst?.status
          ? forecastStage >= actionStage
          : false;
    const currentStage = num(p.observed);
    features.push({
      type: 'Feature',
      geometry: g.geometry,
      properties: {
        lid: p.gaugelid,
        name: p.location || p.waterbody || p.gaugelid,
        state: p.state ?? null,
        hsa: p.wfo ?? null,
        datum: p.hdatum ?? null,
        currentStage: currentStage != null && currentStage > -999 ? currentStage : null,
        actionStage,
        minorStage: num(p.flood),
        moderateStage: num(p.moderate),
        majorStage: num(p.major),
        floodCategory: floodCategory(p.status),
        forecastStage,
        forecastCategory,
        forecastAboveAction,
      },
    });
  }
  return fc(features);
}

export const FLOOD_CATEGORY_LABEL: Record<string, string> = {
  major: 'Major Flooding',
  moderate: 'Moderate Flooding',
  minor: 'Minor Flooding',
  action: 'Action Stage',
  no_flooding: 'Normal / No Flooding',
};

export interface GaugeSeriesPoint {
  t: number;
  ft: number;
}

export interface GaugeDetail {
  stage: number | null;
  category: string | null;
  thresholds: Partial<Record<'action' | 'minor' | 'moderate' | 'major', number>>;
  impacts: { stage: number; statement: string }[];
  county: string | null;
  observed: GaugeSeriesPoint[];
  forecast: GaugeSeriesPoint[];
}

const NWPS = 'https://api.water.noaa.gov/nwps/v1/gauges';

function trimSeries(body: any): GaugeSeriesPoint[] {
  const now = Date.now();
  const week = 7 * 24 * 3600_000;
  return (body?.data ?? [])
    .map((d: any) => ({ t: Date.parse(d.validTime), ft: num(d.primary) }))
    .filter((d: any) => Number.isFinite(d.t) && d.ft != null && d.ft > -999 && Math.abs(d.t - now) <= week);
}

/** NWPS gauge detail and hydrograph (WaterGaugePanel). */
export async function fetchGaugeDetail(lid: string): Promise<GaugeDetail> {
  const [gauge, observed, forecast] = await Promise.allSettled([
    fetchJson(`${NWPS}/${encodeURIComponent(lid)}`),
    fetchJson(`${NWPS}/${encodeURIComponent(lid)}/stageflow/observed`),
    fetchJson(`${NWPS}/${encodeURIComponent(lid)}/stageflow/forecast`),
  ]);
  const g = gauge.status === 'fulfilled' ? gauge.value : null;
  const cats = g?.flood?.categories ?? {};
  const thresholds: GaugeDetail['thresholds'] = {};
  for (const k of ['action', 'minor', 'moderate', 'major'] as const) {
    const v = num(cats[k]?.stage);
    if (v != null && v > -999) thresholds[k] = v;
  }
  const stage = num(g?.status?.observed?.primary);
  return {
    stage: stage != null && stage > -999 ? stage : null,
    category: g?.status?.observed?.floodCategory ?? null,
    thresholds,
    impacts: (g?.flood?.impacts ?? [])
      .map((i: any) => ({ stage: num(i.stage) ?? 0, statement: String(i.statement ?? '').trim() }))
      .filter((i: any) => i.statement),
    county: g?.county ?? null,
    observed: observed.status === 'fulfilled' ? trimSeries(observed.value) : [],
    forecast: forecast.status === 'fulfilled' ? trimSeries(forecast.value) : [],
  };
}

// ── FAA TFRs ─────────────────────────────────────────────────────────────────────────────────────

const TFR_TYPES: Record<string, string> = {
  HAZARDS: 'Hazards (incl. wildfire)',
  SECURITY: 'Security',
  VIP: 'VIP movement',
  'SPACE OPERATIONS': 'Space operations',
  'AIR SHOWS/SPORTS': 'Air shows & sports',
  'UAS PUBLIC GATHERING': 'Drone (UAS) restriction',
  SPECIAL: 'Special',
};

function tfrModified(raw: unknown): string | null {
  const s = String(raw ?? '');
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z` : null;
}

export async function fetchTfrs(): Promise<GeoJSON.FeatureCollection> {
  const body = await fetchJson(
    'https://tfr.faa.gov/geoserver/TFR/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=TFR:V_TFR_LOC&maxFeatures=1000&outputFormat=application/json&srsname=EPSG:4326',
  );
  return fc(
    (body?.features ?? [])
      .filter((f: any) => f.geometry)
      .map((f: any) => {
        const p = f.properties ?? {};
        const type = String(p.LEGAL ?? '').toUpperCase();
        return {
          type: 'Feature',
          geometry: f.geometry,
          properties: {
            notam: String(p.NOTAM_KEY ?? '').split('-')[0],
            title: p.TITLE ?? '',
            type,
            typeLabel: TFR_TYPES[type] ?? (type ? type.charAt(0) + type.slice(1).toLowerCase() : 'TFR'),
            state: p.STATE ?? null,
            facility: p.CNS_LOCATION_ID ?? null,
            modified: tfrModified(p.LAST_MODIFICATION_DATETIME),
          },
        };
      }),
  );
}

export interface TfrDetail {
  effective: string | null;
  expires: string | null;
  regulation: string | null;
  location: string | null;
  airspace: { name: string; range: string }[];
  text: string | null;
}

const xmlTag = (xml: string, tag: string): string | null => {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? m[1].trim() : null;
};

function tfrTime(raw: string | null, zone: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(raw);
  if (!m) return raw;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]} ${m[4]}:${m[5]}${zone ? ` ${zone}` : ''}`;
}

function altitude(val: string | null, uom: string | null, code: string | null): string {
  const n = Number(val);
  if ((uom ?? '').toUpperCase() === 'FL' || (code ?? '').toUpperCase() === 'STD') return `FL${String(Math.round(n)).padStart(3, '0')}`;
  if ((code ?? '').toUpperCase() === 'HEI') return n === 0 ? 'Surface' : `${n.toLocaleString()} ft AGL`;
  return `${n.toLocaleString()} ft MSL`;
}

/** The FAA's XNOTAM detail (TfrDetail on the web). */
export async function fetchTfrDetail(notam: string): Promise<TfrDetail> {
  const res = await fetch(`https://tfr.faa.gov/download/detail_${notam.replace('/', '_')}.xml`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = (await res.text()).replace(/^﻿/, '');
  const airspace: TfrDetail['airspace'] = [];
  const areaRe = /<aseTFRArea>([\s\S]*?)<\/aseTFRArea>/g;
  let m: RegExpExecArray | null;
  while ((m = areaRe.exec(xml))) {
    const a = m[1];
    airspace.push({
      name: xmlTag(a, 'txtName') ?? 'Area',
      range: `${altitude(xmlTag(a, 'valDistVerLower'), xmlTag(a, 'uomDistVerLower'), xmlTag(a, 'codeDistVerLower'))} to ${altitude(
        xmlTag(a, 'valDistVerUpper'),
        xmlTag(a, 'uomDistVerUpper'),
        xmlTag(a, 'codeDistVerUpper'),
      )}`,
    });
  }
  const zone = xmlTag(xml, 'codeTimeZone');
  const city = xmlTag(xml, 'txtNameCity');
  const state = xmlTag(xml, 'txtNameUSState');
  const codeType = xmlTag(xml, 'codeType');
  return {
    effective: tfrTime(xmlTag(xml, 'dateEffective'), zone),
    expires: tfrTime(xmlTag(xml, 'dateExpire'), xmlTag(xml, 'codeExpirationTimeZone') ?? zone),
    regulation: codeType ? `14 CFR ${codeType}` : null,
    location: [city, state].filter(Boolean).join(', ') || null,
    airspace,
    text: xmlTag(xml, 'txtDescrTraditional'),
  };
}

// ── Aviation Weather Center ──────────────────────────────────────────────────────────────────────

const AWC = 'https://aviationweather.gov';

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Every station's latest METAR from AWC's gzip cache file: flight category and wind. */
export async function fetchMetars(): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(`${AWC}/data/cache/metars.cache.csv.gz`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = inflate(bytes, { toText: true }) as unknown as string;
  const lines = text.split('\n');
  const header = parseCsvLine(lines[0] ?? '');
  const col = (name: string) => header.indexOf(name);
  const iRaw = col('raw_text');
  const iId = col('station_id');
  const iTime = col('observation_time');
  const iLat = col('latitude');
  const iLon = col('longitude');
  const iDir = col('wind_dir_degrees');
  const iSpd = col('wind_speed_kt');
  const iGst = col('wind_gust_kt');
  const iCat = col('flight_category');
  const byStation = new Map<string, { time: string; feature: GeoJSON.Feature }>();
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const row = parseCsvLine(lines[i]);
    const id = row[iId];
    const lat = Number(row[iLat]);
    const lng = Number(row[iLon]);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const time = row[iTime] ?? '';
    const prev = byStation.get(id);
    if (prev && prev.time >= time) continue;
    const wspd = num(row[iSpd]) ?? 0;
    const wdir = num(row[iDir]) ?? 0;
    const vrb = /\bVRB\d/.test(row[iRaw] ?? '');
    byStation.set(id, {
      time,
      feature: {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          id,
          fltcat: row[iCat] || 'UNK',
          wspd,
          wgst: num(row[iGst]),
          wdir,
          // Arrow only when the wind has a direction.
          showWind: wspd >= 3 && !vrb && wdir > 0,
        },
      },
    });
  }
  return fc([...byStation.values()].map(v => v.feature));
}

const HZ_ALIASES: Record<string, string> = {
  MTN_OBS: 'MT_OBSC',
  MTN_OBSC: 'MT_OBSC',
  MT_OBS: 'MT_OBSC',
  CONVECTIVE: 'CONV',
  TS: 'CONV',
  TSGR: 'CONV',
  SFC_WIND: 'SFC_WND',
  ICING: 'ICE',
};
const KNOWN_HZ = new Set([
  'CONV', 'TURB', 'TURB_HI', 'TURB_LO', 'MTW', 'LLWS', 'SFC_WND', 'ICE', 'FZLVL', 'M_FZLVL', 'IFR', 'MT_OBSC', 'PCPN', 'TC', 'VA', 'DS', 'SS',
]);

function hazardKey(hazard: unknown): string {
  const k = String(hazard ?? '').toUpperCase().replace(/[-\s]/g, '_');
  const aliased = HZ_ALIASES[k] ?? k;
  return KNOWN_HZ.has(aliased) ? aliased : 'UNK';
}

const US_SIGMET_OFFICES = new Set(['KKCI', 'PHFO', 'PAWU']);

/** US SIGMETs and Center Weather Advisories (the web's default-on AWC advisories). */
export async function fetchAwcAdvisories(): Promise<GeoJSON.FeatureCollection> {
  const [sigmets, cwas] = await Promise.allSettled([
    fetchJson(`${AWC}/api/data/sigmet?format=geojson`),
    fetchJson(`${AWC}/api/data/cwa?format=geojson`),
  ]);
  if (sigmets.status === 'rejected' && cwas.status === 'rejected') throw sigmets.reason;
  const features: GeoJSON.Feature[] = [];
  const add = (f: any, kind: 'SIGMET' | 'CWA') => {
    if (!f?.geometry) return;
    const p = f.properties ?? {};
    features.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        kind,
        hz: hazardKey(p.hazard),
        hazard: p.hazard ?? null,
        qualifier: p.qualifier ?? null,
        issuer: kind === 'CWA' ? `${p.cwsu ?? ''} ${p.name ?? ''}`.trim() : p.icaoId ?? null,
        validFrom: p.validTimeFrom ?? null,
        validTo: p.validTimeTo ?? null,
        base: p.base ?? p.altitudeLow1 ?? null,
        top: p.top ?? p.altitudeHi1 ?? null,
        raw: p.rawSigmet ?? p.cwaText ?? null,
      },
    });
  };
  if (sigmets.status === 'fulfilled')
    for (const f of sigmets.value?.features ?? []) if (US_SIGMET_OFFICES.has(f?.properties?.icaoId)) add(f, 'SIGMET');
  if (cwas.status === 'fulfilled') for (const f of cwas.value?.features ?? []) add(f, 'CWA');
  return fc(features);
}

export const AWC_HAZARD_LABEL: Record<string, string> = {
  CONV: 'Convective',
  TURB: 'Turbulence',
  TURB_HI: 'Turbulence (high)',
  TURB_LO: 'Turbulence (low)',
  MTW: 'Mountain wave',
  LLWS: 'Low-level wind shear',
  SFC_WND: 'Surface wind',
  ICE: 'Icing',
  FZLVL: 'Freezing level',
  M_FZLVL: 'Freezing level',
  IFR: 'IFR',
  MT_OBSC: 'Mountain obscuration',
  PCPN: 'Precipitation',
  TC: 'Tropical cyclone',
  VA: 'Volcanic ash',
  DS: 'Dust storm',
  SS: 'Sandstorm',
  UNK: 'Advisory',
};

export interface MetarDetail {
  name: string | null;
  raw: string | null;
  fltCat: string | null;
  rows: [string, string][];
  taf: string | null;
}

const cToF = (c: number) => Math.round((c * 9) / 5 + 32);

/** METAR and TAF for one station (AwcDetail). */
export async function fetchMetarDetail(icao: string): Promise<MetarDetail> {
  const [metar, taf] = await Promise.allSettled([
    fetchJson(`${AWC}/api/data/metar?ids=${encodeURIComponent(icao)}&format=json`),
    fetchJson(`${AWC}/api/data/taf?ids=${encodeURIComponent(icao)}&format=json`),
  ]);
  const m = metar.status === 'fulfilled' && Array.isArray(metar.value) ? metar.value[0] : null;
  const t = taf.status === 'fulfilled' && Array.isArray(taf.value) ? taf.value[0] : null;
  const rows: [string, string][] = [];
  if (m) {
    const wspd = num(m.wspd);
    if (wspd != null) {
      const dir = m.wdir === 'VRB' ? 'Variable' : `${m.wdir}°`;
      rows.push(['Wind', wspd === 0 ? 'Calm' : `${dir} at ${wspd} kt${m.wgst ? `, gusts ${m.wgst} kt` : ''}`]);
    }
    if (m.visib != null) rows.push(['Visibility', `${m.visib} sm`]);
    if (Array.isArray(m.clouds) && m.clouds.length)
      rows.push(['Sky', m.clouds.map((c: any) => (c.base != null ? `${c.cover} ${Number(c.base).toLocaleString()} ft` : c.cover)).join(', ')]);
    if (m.wxString) rows.push(['Weather', m.wxString]);
    const temp = num(m.temp);
    const dewp = num(m.dewp);
    if (temp != null) rows.push(['Temperature', `${temp}°C / ${cToF(temp)}°F`]);
    if (dewp != null) rows.push(['Dew point', `${dewp}°C / ${cToF(dewp)}°F`]);
    const altim = num(m.altim);
    if (altim != null) rows.push(['Altimeter', `${(altim * 0.02953).toFixed(2)} inHg`]);
  }
  return {
    name: m?.name ?? t?.name ?? null,
    raw: m?.rawOb ?? null,
    fltCat: m?.fltCat ?? null,
    rows,
    taf: t?.rawTAF ? String(t.rawTAF).replace(/\s+(FM\d{6}|TEMPO|BECMG|PROB\d{2})/g, '\n$1') : null,
  };
}

// ── Viewport-loaded layers ───────────────────────────────────────────────────────────────────────

export async function fetchColleges(view: Viewport): Promise<GeoJSON.FeatureCollection> {
  return queryEnvelope('https://carto.nationalmap.gov/arcgis/rest/services/structures/MapServer/56', viewportEnvelope(view, 1), {
    outFields: 'name,address,city,state,zipcode',
    resultRecordCount: '5000',
  });
}

export async function fetchCriticalInfrastructure(view: Viewport): Promise<GeoJSON.FeatureCollection> {
  const env = viewportEnvelope(view, 1);
  const [lines, gas] = await Promise.allSettled([
    queryEnvelope('https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0', env, {
      outFields: 'ID,TYPE,STATUS,OWNER,VOLTAGE,VOLT_CLASS,NAICS_DESC,SOURCE',
    }),
    queryEnvelope(
      'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Natural_Gas_Interstate_and_Intrastate_Pipelines_1/FeatureServer/0',
      env,
      { outFields: 'TYPEPIPE,Operator,Status' },
    ),
  ]);
  const tag = (r: PromiseSettledResult<GeoJSON.FeatureCollection>, kind: string) =>
    r.status === 'fulfilled' ? r.value.features.map(f => ({ ...f, properties: { ...f.properties, kind } })) : [];
  if (lines.status === 'rejected' && gas.status === 'rejected') throw lines.reason;
  return fc([...tag(gas, 'gas'), ...tag(lines, 'power')]);
}

/** The visible radius (miles) at which the web starts loading land ownership. */
export const LAND_OWNERSHIP_MAX_RADIUS_MI = 5;

export function visibleRadiusMiles(view: Viewport): number {
  return ((156543.03392 * Math.cos((view.center[1] * Math.PI) / 180)) / 2 ** view.zoom) * 800 / 1609.34;
}

export async function fetchLandOwnership(view: Viewport): Promise<GeoJSON.FeatureCollection> {
  if (visibleRadiusMiles(view) > LAND_OWNERSHIP_MAX_RADIUS_MI) return EMPTY_FC;
  const [w, s, e, n] = viewportEnvelope(view);
  const body = await fetchJson(
    `https://d17msnxo4ql3yx.cloudfront.net/california-land-ownership-proxy/land-ownership?bbox=${[w, s, e, n].map(v => v.toFixed(4)).join(',')}`,
  );
  return { type: 'FeatureCollection', features: body?.features ?? [] };
}
