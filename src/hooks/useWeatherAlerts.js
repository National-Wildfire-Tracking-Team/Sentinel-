/**
 * useWeatherAlerts.js
 * Unified nationwide alert system with:
 * - NWS API (primary)
 * - NOAA MapServer (geometry backup)
 * - FEMA IPAWS (supplement)
 * - NWS Zone fallback (UGC-based geometry reconstruction)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useApp } from "../context/AppContext";

const REFRESH_MS = 60 * 1000;

/* =========================
   ZONES (LOAD ONCE)
========================= */
const ZONES_URL =
  "https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/LatestNWSZones/FeatureServer/0/query?where=1%3D1&outFields=STATE,ZONE&outSR=4326&f=geojson";

async function fetchZones() {
  try {
    const res = await fetch(ZONES_URL);
    if (!res.ok) throw new Error("Zones fetch failed");
    return await res.json();
  } catch (err) {
    console.warn("Zones failed:", err.message);
    return null;
  }
}

/* =========================
   NWS FETCH
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

    const mapped = data.features.map((f) => ({
      id: f.id,
      type: f.properties.event,
      headline: f.properties.headline,
      description: f.properties.description,
      severity: f.properties.severity,
      urgency: f.properties.urgency,
      affectedArea: f.properties.areaDesc,
      effective: f.properties.effective,
      onset: f.properties.onset,
      sent: f.properties.sent,
      expires: f.properties.expires,
      geometry: f.geometry,
      geocodes: f.properties.geocode?.UGC || [],
      source: "NWS",
    }));

    alerts.push(...mapped);
    url = data.pagination?.next || null;
  }

  return alerts;
}

/* =========================
   NOAA MAPSERVER
========================= */
const MAPSERVER_BASE =
  "https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/MapServer";

const MAPSERVER_LAYERS = [0, 1];

async function fetchNOAAMapServerAlerts() {
  const allFeatures = [];

  await Promise.all(
    MAPSERVER_LAYERS.map(async (layerId) => {
      const url =
        `${MAPSERVER_BASE}/${layerId}/query` +
        `?where=1%3D1&outFields=prod_type,msg_type,phenom,sig,url,expiration,onset,issuance,wfo,cap_id` +
        `&outSR=4326&f=geojson`;

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const data = await res.json();
        allFeatures.push(...(data.features || []));
      } catch {
        console.warn(`MapServer layer ${layerId} failed`);
      }
    })
  );

  return allFeatures.map((f) => {
    const p = f.properties || {};
    return {
      id: p.cap_id || null,
      type: p.prod_type || null,
      headline: p.prod_type || null,
      description: null,
      severity: sigToSeverity(p.sig),
      urgency: sigToUrgency(p.sig),
      affectedArea: p.wfo || null,
      effective: p.issuance || null,
      onset: p.onset || null,
      sent: p.issuance || null,
      expires: p.expiration || null,
      geometry: f.geometry || null,
      geocodes: [],
      source: "NWS",
    };
  });
}

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
  if (sig === "Y") return "Expected";
  if (sig === "S") return "Future";
  return "Unknown";
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

    return entries.map((e) => {
      const getText = (tag) => e.querySelector(tag)?.textContent ?? null;

      return {
        id: getText("id"),
        type: getText("cap\\:event, event"),
        severity: getText("cap\\:severity, severity"),
        urgency: getText("cap\\:urgency, urgency"),
        affectedArea: getText("cap\\:areaDesc, areaDesc"),
        effective: getText("cap\\:effective, effective"),
        sent: getText("cap\\:sent, sent"),
        geometry: null,
        geocodes: [],
        source: "FEMA",
      };
    });
  } catch (err) {
    console.warn("FEMA failed:", err.message);
    return [];
  }
}

/* =========================
   MERGE (GEOMETRY-AWARE)
========================= */
function mergeAlerts(primary, ...rest) {
  const byId = new Map();

  function add(alert) {
    if (!alert.id) return;

    const existing = byId.get(alert.id);

    if (!existing || (!existing.geometry && alert.geometry)) {
      byId.set(alert.id, alert);
    }
  }

  primary.forEach(add);
  rest.flat().forEach(add);

  return Array.from(byId.values());
}

/* =========================
   GEOMETRY HELPERS
========================= */
function normalizeGeometry(geom) {
  if (!geom) return null;

  if (geom.type === "GeometryCollection") {
    return geom.geometries.find(
      (g) => g.type === "Polygon" || g.type === "MultiPolygon"
    );
  }

  return geom;
}

function getZoneGeometry(alert, zoneMap) {
  if (alert.geometry) return normalizeGeometry(alert.geometry);

  if (!alert.geocodes || !zoneMap) return null;

  const matches = alert.geocodes
    .map((code) => zoneMap.get(code))
    .filter(Boolean);

  if (!matches.length) return null;

  return {
    type: "MultiPolygon",
    coordinates: matches.flatMap((g) => g.coordinates),
  };
}

/* =========================
   GEOJSON
========================= */
function toGeoJSON(alerts, zoneMap) {
  return {
    type: "FeatureCollection",
    features: alerts
      .map((a) => {
        const geom = getZoneGeometry(a, zoneMap);

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
  const [error, setError] = useState(null);

  const { setAlerts } = useApp();

  const mountedRef = useRef(true);
  const intervalRef = useRef(null);
  const zoneMapRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setError(null);

      const [nws, mapserver, fema] = await Promise.all([
        fetchAllNWSAlerts(),
        fetchNOAAMapServerAlerts(),
        fetchFemaAlerts(),
      ]);

      if (!mountedRef.current) return;

      const merged = mergeAlerts(nws, mapserver, fema);

      setAlertsState(merged);
      setAlerts(merged);

      setGeoJSON(toGeoJSON(merged, zoneMapRef.current));
      setLoading(false);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
      setLoading(false);
    }
  }, [setAlerts]);

  useEffect(() => {
    mountedRef.current = true;

    // Load zones once
    if (!zoneMapRef.current) {
      fetchZones().then((zones) => {
        if (!zones) return;

        const map = new Map();

        zones.features.forEach((f) => {
          const key = f.properties.STATE + "Z" + f.properties.ZONE;
          map.set(key, f.geometry);
        });

        zoneMapRef.current = map;
      });
    }

    load();
    intervalRef.current = setInterval(load, REFRESH_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [load]);

  return {
    alerts,
    geoJSON,
    loading,
    error,
    refresh: load,
  };
}
