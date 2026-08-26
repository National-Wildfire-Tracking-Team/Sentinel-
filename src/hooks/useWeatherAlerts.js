/**
 * useWeatherAlerts.js
 * Unified nationwide alert system:
 * - NWS API (primary) — via noaaWeather.js, single source of truth
 * - NOAA MapServer (geometry backup)
 * - FEMA IPAWS (supplement) — via api/fema.js
 * - NWS Zones (UGC fallback)
 * - Counties (county fallback)
 * - CWA (County Warning Area fallback) — FIXES MIDWEST GAPS
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useApp } from "../context/AppContext";
import { geometryAreaSqMi } from "../utils/geoArea";
import {
  fetchNWSAlerts,
  filterFireWeatherAlerts,
  flattenGeometry,
} from "../api/noaaWeather";
import { fetchFemaAlerts } from "../api/fema";

const REFRESH_MS = 60 * 1000;

/* =========================
   ZONES — three sources to cover all NWS zone types
   ========================= */
const PUBLIC_ZONES_URL =
  "https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/LatestNWSZones/FeatureServer/0/query?where=1%3D1&outFields=STATE,ZONE&outSR=4326&f=geojson";
const FIRE_WX_ZONES_URL = "/api/noaa/firewxzones";
const MARINE_ZONES_URL = "/api/noaa/marinezones";

/* =========================
   COUNTIES (Census Bureau TIGERweb API)
========================= */
const COUNTY_URL = '/api/census/counties';

const FIPS_TO_STATE = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT",
  "10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL",
  "18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD",
  "25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE",
  "32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND",
  "39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD",
  "47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV",
  "55":"WI","56":"WY","60":"AS","66":"GU","69":"MP","72":"PR","78":"VI",
};

/* =========================
   CWA LAYER (FIX FOR MIDWEST)
========================= */
const CWA_URL = "/api/noaa/cwa";

/* =========================
   LOAD HELPERS
========================= */
async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn("[WeatherAlerts]", err.message, url);
    return null;
  }
}

/* =========================
   UGC KEY NORMALIZATION
   Handles zero-padding mismatches (e.g. "CAZ006" vs "CAZ6")
========================= */
function ugcKeyVariants(code) {
  const variants = [code];
  const match = code.match(/^([A-Z]{2})([CZFM])(\d+)$/i);
  if (match) {
    const [, state, type, number] = match;
    const num = parseInt(number, 10);
    const zero = String(num).padStart(3, '0');
    const noZero = String(num);
    if (zero !== number) variants.push(`${state}${type}${zero}`);
    if (noZero !== number) variants.push(`${state}${type}${noZero}`);
  }
  return variants;
}

/* =========================
   MAPSERVER
========================= */
const MAPSERVER_BASE =
  "https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/MapServer";

const MAPSERVER_LAYERS = [0, 1];

async function fetchNOAAMapServerAlerts() {
  const all = [];

  await Promise.all(
    MAPSERVER_LAYERS.map(async (id) => {
      const url =
        `${MAPSERVER_BASE}/${id}/query` +
        `?where=1%3D1&outFields=prod_type,sig,cap_id,issuance,expiration` +
        `&outSR=4326&f=geojson`;

      const data = await fetchJSON(url);
      if (data?.features) all.push(...data.features);
    })
  );

  return all.map((f) => ({
    id: f.properties.cap_id || null,
    type: f.properties.prod_type || null,
    severity: sigToSeverity(f.properties.sig),
    urgency: sigToUrgency(f.properties.sig),
    geometry: f.geometry,
    geocode: null,
    source: "NWS",
  }));
}

/* =========================
   SEVERITY MAP
========================= */
function sigToSeverity(sig) {
  if (sig === "W") return "Extreme";
  if (sig === "A") return "Severe";
  if (sig === "Y") return "Moderate";
  if (sig === "S") return "Minor";
  return "Unknown";
}

function sigToUrgency(sig) {
  if (sig === "W") return "Immediate";
  if (sig === "A") return "Expected";
  return "Unknown";
}

/* =========================
   MERGE (field-by-field non-null preference, R8)
========================= */
function mergeAlerts(primary, ...rest) {
  const map = new Map();

  function add(a) {
    if (!a.id) return;
    const existing = map.get(a.id);
    if (!existing) {
      map.set(a.id, { ...a });
      return;
    }
    const merged = { ...existing };
    for (const key of Object.keys(a)) {
      const aVal = a[key];
      const eVal = existing[key];
      if (aVal != null && aVal !== '' && aVal !== eVal) {
        if (key === 'geometry') {
          if (!eVal && aVal) merged[key] = aVal;
        } else if (key === 'description' || key === 'instruction' || key === 'headline') {
          if (!eVal || (typeof eVal === 'string' && eVal.length < (aVal?.length || 0))) {
            merged[key] = aVal;
          }
        } else if (eVal == null || eVal === '' || eVal === 'Unknown') {
          if (aVal != null && aVal !== '' && aVal !== 'Unknown') {
            merged[key] = aVal;
          }
        }
      }
    }
    map.set(a.id, merged);
  }

  primary.forEach(add);
  rest.flat().forEach(add);

  return [...map.values()];
}

/* =========================
   GEOMETRY HELPERS
========================= */
function lookupGeometry(code, zoneMap, countyMap, cwaMap) {
  for (const variant of ugcKeyVariants(code)) {
    if (zoneMap?.has(variant)) return zoneMap.get(variant);
  }
  for (const variant of ugcKeyVariants(code)) {
    if (countyMap?.has(variant)) return countyMap.get(variant);
  }
  for (const variant of ugcKeyVariants(code)) {
    if (cwaMap?.has(variant)) return cwaMap.get(variant);
  }
  return null;
}

function getGeometry(alert, zoneMap, countyMap, cwaMap) {
  if (alert.geometry) return flattenGeometry(alert.geometry);

  const ugcCodes = alert.geocode?.UGC || [];
  if (!ugcCodes.length) return null;

  const matches = [];
  for (const code of ugcCodes) {
    const geom = lookupGeometry(code, zoneMap, countyMap, cwaMap);
    if (geom) matches.push(geom);
  }

  if (!matches.length) return null;

  return {
    type: "MultiPolygon",
    coordinates: matches.flatMap((g) =>
      g.type === 'Polygon' ? [g.coordinates] : g.coordinates
    ),
  };
}

/* =========================
   GEOJSON BUILDER (R5: per-alert try/catch)
========================= */
function toGeoJSON(alerts, zoneMap, countyMap, cwaMap) {
  const features = [];

  for (const a of alerts) {
    try {
      const geom = getGeometry(a, zoneMap, countyMap, cwaMap);
      if (!geom) continue;

      const feature = {
        type: "Feature",
        id: a.id,
        geometry: geom,
        properties: {
          id: a.id,
          type: a.type,
          headline: a.headline,
          severity: a.severity,
          urgency: a.urgency,
          source: a.source,
        },
      };

      if (feature.geometry) {
        features.push(feature);
      }
    } catch (err) {
      console.warn(`[WeatherAlerts] Geometry skipped for alert ${a.id}:`, err.message);
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

/* =========================
   MAIN HOOK
========================= */
export function useWeatherAlerts() {
  const [alerts, setAlertsState] = useState([]);
  const [geoJSON, setGeoJSON] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorDetail, setErrorDetail] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const { setAlerts, setAlertsStatus } = useApp();

  const zoneMapRef = useRef(null);
  const countyMapRef = useRef(null);
  const cwaMapRef = useRef(null);
  const mountedRef = useRef(true);
  const mergedRef = useRef([]);
  const loadIdRef = useRef(0);

  const applyGeoJSON = useCallback(() => {
    const withArea = filterFireWeatherAlerts(mergedRef.current).map((a) => {
      const geom = getGeometry(a, zoneMapRef.current, countyMapRef.current, cwaMapRef.current);
      const areaSqMi = geom ? geometryAreaSqMi(geom) : null;
      return { ...a, areaSqMi };
    });
    mergedRef.current = withArea;
    const gj = toGeoJSON(
      withArea,
      zoneMapRef.current,
      countyMapRef.current,
      cwaMapRef.current
    );
    console.log(
      "[WeatherAlerts] applying GeoJSON:",
      mergedRef.current.length,
      "alerts,",
      gj.features.length,
      "features"
    );
    setGeoJSON(gj);
    setAlertsState(withArea);
    setAlerts(withArea);
  }, [setAlerts]);

  useEffect(() => {
    setAlertsStatus({
      loading,
      error,
      errorDetail,
      lastRefresh,
    });
  }, [loading, error, errorDetail, lastRefresh, setAlertsStatus]);

  const load = useCallback(async () => {
    const myId = ++loadIdRef.current;
    setLoading(true);

    let nwsError = false;
    let partialNws = false;

    let nws = [];
    try {
      nws = await fetchNWSAlerts();
      if (nws.length === 0) {
        nwsError = true;
      }
    } catch (err) {
      console.warn("[WeatherAlerts] NWS fetch error:", err?.message || err);
      nwsError = true;
    }

    if (myId !== loadIdRef.current || !mountedRef.current) return;

    const enrichedNws = nws.map((a) => ({
      ...a,
      geocodes: a.geocode?.UGC || [],
      response: a.response || null,
      source: a.source || "NWS",
    }));

    if (nwsError) {
      if (mergedRef.current.length > 0) {
        console.log("[WeatherAlerts] NWS fetch failed, keeping", mergedRef.current.length, "stale alerts");
        setError('full');
        setErrorDetail('NWS API is currently unavailable');
        setLoading(false);
        return;
      }
      mergedRef.current = [];
      setError('full');
      setErrorDetail('NWS API is currently unavailable — no cached alerts available');
      applyGeoJSON();
      setLoading(false);
      return;
    }

    if (partialNws) {
      setError('partial');
      setErrorDetail(`Partial data — loaded ${nws.length} alerts`);
    } else {
      setError(null);
      setErrorDetail(null);
    }

    console.log("[WeatherAlerts] NWS fetch complete:", enrichedNws.length, "alerts");
    mergedRef.current = mergeAlerts(enrichedNws);
    try {
      applyGeoJSON();
    } catch (err) {
      console.warn("[WeatherAlerts] applyGeoJSON error:", err?.message || err);
      setError('full');
      setErrorDetail('Error processing alert geometry');
      setLoading(false);
      return;
    }
    setLastRefresh(Date.now());
    setLoading(false);

    let mapserver = [];
    let fema = [];
    try {
      [mapserver, fema] = await Promise.all([
        fetchNOAAMapServerAlerts(),
        fetchFemaAlerts(),
      ]);
    } catch (err) {
      console.warn("[WeatherAlerts] Supplemental fetch error:", err?.message || err);
    }

    if (myId !== loadIdRef.current || !mountedRef.current) return;

    const existingIds = new Set(mergedRef.current.map((a) => a.id));
    const newAlerts = [...mapserver, ...fema].filter(
      (a) => a.id && !existingIds.has(a.id)
    );

    if (newAlerts.length > 0) {
      console.log("[WeatherAlerts] adding", newAlerts.length, "supplemental alerts");
      mergedRef.current = mergeAlerts(enrichedNws, newAlerts);
      try {
        applyGeoJSON();
      } catch (err) {
        console.warn("[WeatherAlerts] applyGeoJSON error (supplemental):", err?.message || err);
      }
    }
  }, [setAlerts, applyGeoJSON]);

  useEffect(() => {
    mountedRef.current = true;

    /* =========================
       LOAD ZONES (public + fire weather + marine)
    ========================= */
    async function loadZoneMap(url, keyFn, map) {
      const data = await fetchJSON(url);
      if (!data?.features) return;
      for (const f of data.features) {
        const key = keyFn(f);
        if (key) {
          map.set(key, f.geometry);
          for (const variant of ugcKeyVariants(key)) {
            if (variant !== key) map.set(variant, f.geometry);
          }
        }
      }
    }

    const zoneMap = new Map();

    Promise.all([
      loadZoneMap(PUBLIC_ZONES_URL, (f) => {
        const st = f.properties.STATE;
        const zn = f.properties.ZONE;
        return st && zn ? st + "Z" + zn : null;
      }, zoneMap),
      loadZoneMap(FIRE_WX_ZONES_URL, (f) => {
        const st = f.properties.state;
        const zn = f.properties.zone;
        return st && zn ? st + "Z" + zn : null;
      }, zoneMap),
      loadZoneMap(MARINE_ZONES_URL, (f) => {
        return f.properties.id || null;
      }, zoneMap),
    ]).then(() => {
      if (zoneMap.size > 0) {
        zoneMapRef.current = zoneMap;
        if (mountedRef.current) applyGeoJSON();
      }
    });

    /* =========================
       LOAD COUNTIES (paginated to avoid timeouts)
    ========================= */
    (async () => {
      const PAGE_SIZE = 500;
      let offset = 0;
      const allFeatures = [];

      while (true) {
        const page = await fetchJSON(
          `${COUNTY_URL}?resultRecordCount=${PAGE_SIZE}&resultOffset=${offset}`
        );
        if (!page?.features?.length) break;
        allFeatures.push(...page.features);
        if (page.features.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      if (!allFeatures.length) return;

      const map = new Map();
      allFeatures.forEach((f) => {
        const stateAbbr = FIPS_TO_STATE[f.properties.STATE];
        if (!stateAbbr) return;
        const key = stateAbbr + "C" + f.properties.COUNTY;
        map.set(key, f.geometry);
        for (const variant of ugcKeyVariants(key)) {
          if (variant !== key) map.set(variant, f.geometry);
        }
      });

      countyMapRef.current = map;
      if (mountedRef.current) applyGeoJSON();
    })();

    /* =========================
       LOAD CWA (FIX MIDWEST)
    ========================= */
    fetchJSON(CWA_URL).then((cwa) => {
      if (!cwa) return;
      const map = new Map();

      cwa.features.forEach((f) => {
        const key = f.properties?.WFO || f.properties?.ID;
        if (key) map.set(key, f.geometry);
      });

      cwaMapRef.current = map;
      if (mountedRef.current) applyGeoJSON();
    });

    load();
    const interval = setInterval(load, REFRESH_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [load, applyGeoJSON]);

  return {
    alerts,
    geoJSON,
    loading,
    error,
    errorDetail,
    lastRefresh,
    alertCount: alerts.length,
    geoCount: geoJSON?.features?.length || 0,
    refresh: load,
  };
}
