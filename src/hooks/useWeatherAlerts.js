/**
 * useWeatherAlerts.js
 * Unified nationwide alert system:
 * - NWS API (primary) — shown first for fast weather-tab paint
 * - NOAA MapServer (geometry backup)
 * - FEMA IPAWS (supplement)
 * - NWS Zones (UGC fallback)
 * - Counties (county fallback)
 * - CWA (County Warning Area fallback) ← FIXES MIDWEST GAPS
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useApp } from "../context/AppContext";
import { geometryAreaSqMi } from "../utils/geoArea";

const REFRESH_MS = 60 * 1000;

/* =========================
   ZONES
========================= */
const ZONES_URL =
  "https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/LatestNWSZones/FeatureServer/0/query?where=1%3D1&outFields=STATE,ZONE&outSR=4326&f=geojson";

/* =========================
   COUNTIES (YOU MUST PROVIDE THIS FILE)
========================= */
const COUNTY_URL = "/counties.geojson";

/* =========================
   CWA LAYER (FIX FOR MIDWEST)
========================= */
const CWA_URL =
  "https://mapservices.weather.noaa.gov/static/rest/services/nws_reference_maps/nws_reference_map/FeatureServer/2/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";

/* =========================
   LOAD HELPERS
========================= */
async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${url}`);
    return await res.json();
  } catch (err) {
    console.warn(err.message);
    return null;
  }
}

/* =========================
   NWS ALERTS
========================= */
async function fetchAllNWSAlerts() {
  let url = "https://api.weather.gov/alerts/active";
  let alerts = [];

  while (url) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "sentinel-app (your@email.com)",
        Accept: "application/geo+json",
      },
    });

    if (!res.ok) throw new Error("NWS fetch failed");

    const data = await res.json();

    alerts.push(
      ...data.features.map((f) => {
        const p = f.properties || {};
        return {
          id: p.id || f.id,
          type: p.event,
          headline: p.headline,
          description: p.description,
          instruction: p.instruction,
          severity: p.severity,
          urgency: p.urgency,
          certainty: p.certainty,
          sent: p.sent,
          effective: p.effective,
          onset: p.onset,
          expires: p.expires,
          senderName: p.senderName,
          affectedArea: p.areaDesc,
          response: p.response,
          parameters: p.parameters,
          geocode: p.geocode,
          geocodes: p.geocode?.UGC || [],
          geometry: f.geometry,
          source: "NWS",
        };
      })
    );

    url = data.pagination?.next || null;
  }

  return alerts;
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
    geocodes: [],
    source: "NWS",
  }));
}

/* =========================
   FEMA
========================= */
async function fetchFemaAlerts() {
  try {
    const res = await fetch("/api/fema");
    const xml = await res.text();

    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const entries = Array.from(doc.querySelectorAll("entry"));

    return entries.map((e) => ({
      id: e.querySelector("id")?.textContent,
      type: null,
      severity: null,
      urgency: null,
      geometry: null,
      geocodes: [],
      source: "FEMA",
    }));
  } catch {
    return [];
  }
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
   MERGE (DO NOT LOSE GEOMETRY)
========================= */
function mergeAlerts(primary, ...rest) {
  const map = new Map();

  function add(a) {
    if (!a.id) return;

    const existing = map.get(a.id);

    if (!existing) {
      map.set(a.id, a);
      return;
    }

    if (!existing.geometry && a.geometry) {
      map.set(a.id, { ...a, ...existing, geometry: a.geometry });
      return;
    }

    if (existing.geometry && !a.geometry && (a.description || a.headline)) {
      map.set(a.id, { ...a, ...existing, geometry: existing.geometry });
      return;
    }

    if (existing.geometry && a.geometry && (a.description || a.instruction) && !existing.description && !existing.instruction) {
      map.set(a.id, { ...existing, ...a, geometry: existing.geometry });
    }
  }

  primary.forEach(add);
  rest.flat().forEach(add);

  return [...map.values()];
}

/* =========================
   GEOMETRY HELPERS
========================= */
function normalizeGeometry(g) {
  if (!g) return null;

  if (g.type === "GeometryCollection") {
    return g.geometries.find(
      (x) => x.type === "Polygon" || x.type === "MultiPolygon"
    );
  }

  return g;
}

function getGeometry(alert, zoneMap, countyMap, cwaMap) {
  if (alert.geometry) return normalizeGeometry(alert.geometry);

  if (!alert.geocodes) return null;

  const matches = [];

  for (const code of alert.geocodes) {
    if (zoneMap?.has(code)) matches.push(zoneMap.get(code));
    else if (countyMap?.has(code)) matches.push(countyMap.get(code));
    else if (cwaMap?.has(code)) matches.push(cwaMap.get(code));
  }

  if (!matches.length) return null;

  return {
    type: "MultiPolygon",
    coordinates: matches.flatMap((g) => g.coordinates),
  };
}

/* =========================
   GEOJSON BUILDER
========================= */
function toGeoJSON(alerts, zoneMap, countyMap, cwaMap) {
  return {
    type: "FeatureCollection",
    features: alerts
      .map((a) => {
        const geom = getGeometry(a, zoneMap, countyMap, cwaMap);

        return {
          type: "Feature",
          geometry: geom,
          properties: {
            id: a.id,
            type: a.type,
            severity: a.severity,
            urgency: a.urgency,
            source: a.source,
          },
        };
      })
      .filter((f) => f.geometry),
  };
}

/* =========================
   MAIN HOOK
========================= */
export function useWeatherAlerts() {
  const [alerts, setAlertsState] = useState([]);
  const [geoJSON, setGeoJSON] = useState(null);
  const [loading, setLoading] = useState(true);

  const { setAlerts } = useApp();

  const zoneMapRef = useRef(null);
  const countyMapRef = useRef(null);
  const cwaMapRef = useRef(null);
  const mountedRef = useRef(true);
  const mergedRef = useRef([]);

  const applyGeoJSON = useCallback(() => {
    const withArea = mergedRef.current.map((a) => {
      const geom = getGeometry(a, zoneMapRef.current, countyMapRef.current, cwaMapRef.current);
      const areaSqMi = geom ? geometryAreaSqMi(geom) : null;
      return { ...a, areaSqMi };
    });
    mergedRef.current = withArea;
    setGeoJSON(
      toGeoJSON(
        withArea,
        zoneMapRef.current,
        countyMapRef.current,
        cwaMapRef.current
      )
    );
    setAlertsState(withArea);
    setAlerts(withArea);
  }, [setAlerts]);

  const load = useCallback(async () => {
    setLoading(true);
    let nws = [];
    try {
      nws = await fetchAllNWSAlerts();
    } catch (err) {
      console.warn(err?.message || err);
    }

    if (!mountedRef.current) return;

    // Phase 1: NWS only — unblock UI quickly (feed + map with API geometry)
    mergedRef.current = mergeAlerts(nws);
    applyGeoJSON();
    setLoading(false);

    // Phase 2: MapServer + FEMA in parallel, then merge (fills geometry gaps)
    let mapserver = [];
    let fema = [];
    try {
      [mapserver, fema] = await Promise.all([
        fetchNOAAMapServerAlerts(),
        fetchFemaAlerts(),
      ]);
    } catch (err) {
      console.warn(err?.message || err);
    }

    if (!mountedRef.current) return;

    mergedRef.current = mergeAlerts(nws, mapserver, fema);
    applyGeoJSON();
  }, [setAlerts, applyGeoJSON]);

  useEffect(() => {
    mountedRef.current = true;

    /* =========================
       LOAD ZONES
    ========================= */
    fetchJSON(ZONES_URL).then((zones) => {
      if (!zones) return;
      const map = new Map();

      zones.features.forEach((f) => {
        const key = f.properties.STATE + "Z" + f.properties.ZONE;
        map.set(key, f.geometry);
      });

      zoneMapRef.current = map;
      if (mountedRef.current) applyGeoJSON();
    });

    /* =========================
       LOAD COUNTIES
    ========================= */
    fetchJSON(COUNTY_URL).then((counties) => {
      if (!counties) return;
      const map = new Map();

      counties.features.forEach((f) => {
        const key = f.properties.STATE_ABBR + "C" + f.properties.COUNTYFP;
        map.set(key, f.geometry);
      });

      countyMapRef.current = map;
      if (mountedRef.current) applyGeoJSON();
    });

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
    refresh: load,
  };
}
