/**
 * useWeatherAlerts.js
 * Unified nationwide alert system:
 * - NOAA/NWS API (primary, full coverage)
 * - NOAA MapServer (secondary, guaranteed polygon geometry, 5-min refresh)
 * - FEMA IPAWS (supplement)
 * - Deduplication + merging
 * - GeoJSON output for mapping
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useApp } from "../context/AppContext";

const REFRESH_MS = 60 * 1000;

// ArcGIS MapServer base URL — NOAA event-driven WWA service
const MAPSERVER_BASE =
  "https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/MapServer";
// Layer 1 (WatchesWarnings) covers all active watches, warnings, and advisories.
// Layer 0 (CurrentWarnings) holds only the highest-priority immediate-danger
// warnings (Tornado, Severe Thunderstorm, Flash Flood, Snow Squall, Special Marine).
// Both are queried so we get complete coverage with guaranteed polygon geometry.
const MAPSERVER_LAYERS = [0, 1];

/* =========================
   NWS FETCH (FULL NATIONWIDE)
========================= */
async function fetchAllNWSAlerts() {
  let url = "https://api.weather.gov/alerts/active";
  let alerts = [];

  while (url) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "sentinel-app (your@email.com)",
        "Accept": "application/geo+json"
      }
    });

    if (!res.ok) throw new Error("NWS fetch failed");

    const data = await res.json();

    const mapped = data.features.map(f => ({
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
      source: "NWS"
    }));

    alerts.push(...mapped);
    url = data.pagination?.next || null;
  }

  return alerts;
}

/* =========================
   NOAA MAPSERVER FETCH
========================= */
/**
 * Fetch active warnings/watches/advisories from the NOAA NWS ArcGIS MapServer.
 * The service is updated every 5 minutes and always includes polygon geometry,
 * making it a reliable supplement when the NWS JSON API has alerts without shapes.
 * Both layer 0 (immediate-danger warnings) and layer 1 (all watches/warnings/
 * advisories) are queried; the deduplication step below collapses any overlap.
 */
async function fetchNOAAMapServerAlerts() {
  const allFeatures = [];

  await Promise.all(
    MAPSERVER_LAYERS.map(async (layerId) => {
      // Request GeoJSON with coordinates reprojected to WGS-84 (outSR=4326) so
      // the geometry is directly usable by Mapbox without further transformation.
      const url =
        `${MAPSERVER_BASE}/${layerId}/query` +
        `?where=1%3D1&outFields=prod_type,msg_type,phenom,sig,url,expiration,onset,issuance,wfo,cap_id` +
        `&outSR=4326&f=geojson`;

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`MapServer layer ${layerId} HTTP ${res.status}`);
        const data = await res.json();
        allFeatures.push(...(data.features || []));
      } catch (err) {
        console.warn(`[NOAA MapServer] Layer ${layerId} failed:`, err.message);
      }
    })
  );

  return allFeatures.map(f => {
    const p = f.properties || {};
    // cap_id is a URN that matches the NWS JSON API alert id, enabling cross-source
    // deduplication via the existing id-based Set check in mergeAlerts().
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
      // Use the same source label as the NWS JSON API so all NWS-origin alerts
      // are treated identically by the map layer, sidebar, and color utilities.
      source: "NWS"
    };
  });
}

/** Map NWS significance code (sig field) to a human-readable severity string. */
function sigToSeverity(sig) {
  if (sig === "W") return "Extreme";
  if (sig === "A") return "Severe";
  if (sig === "Y") return "Moderate";
  if (sig === "S") return "Minor";
  return "Unknown";
}

/** Map NWS significance code (sig field) to a human-readable urgency string. */
function sigToUrgency(sig) {
  if (sig === "W") return "Immediate";
  if (sig === "A") return "Expected";
  if (sig === "Y") return "Expected";
  if (sig === "S") return "Future";
  return "Unknown";
}

/* =========================
   FEMA IPAWS FETCH
========================= */
async function fetchFemaAlerts() {
  try {
    const url = "/api/fema";

    const res = await fetch(url);
    const xml = await res.text();

    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const entries = Array.from(doc.querySelectorAll("entry"));

    return entries.map(e => {
      const getText = tag => e.querySelector(tag)?.textContent ?? null;
      return {
        id: getText("id"),
        type: getText("cap\\:event, event"),
        severity: getText("cap\\:severity, severity"),
        urgency: getText("cap\\:urgency, urgency"),
        affectedArea: getText("cap\\:areaDesc, areaDesc"),
        effective: getText("cap\\:effective, effective"),
        sent: getText("cap\\:sent, sent"),
        geometry: null,
        source: "FEMA"
      };
    });
  } catch (err) {
    console.warn("FEMA failed:", err.message);
    return [];
  }
}

/* =========================
   DEDUPLICATION
========================= */
function fingerprint(alert) {
  const event = (alert.type || "")
    .toLowerCase()
    .replace(/\s+/g, "");

  const area = (alert.affectedArea || "")
    .slice(0, 30)
    .toLowerCase()
    .replace(/\W/g, "");

  const time = (alert.effective || alert.sent || "").slice(0, 13);

  return `${event}|${area}|${time}`;
}

/**
 * Merge alerts from multiple sources into a single deduplicated array.
 * The first argument is treated as the primary (highest-fidelity) source;
 * subsequent arrays are added only when no duplicate id or fingerprint exists.
 * Accepts any number of source arrays.
 */
function mergeAlerts(primary, ...rest) {
  const seenIds  = new Set(primary.map(a => a.id).filter(Boolean));
  const seenKeys = new Set(primary.map(fingerprint));

  function addUnique(candidates) {
    return candidates.filter(a => {
      if (a.id && seenIds.has(a.id)) return false;
      const key = fingerprint(a);
      if (seenKeys.has(key)) return false;
      if (a.id) seenIds.add(a.id);
      seenKeys.add(key);
      return true;
    });
  }

  return [...primary, ...rest.flatMap(addUnique)];
}

/* =========================
   GEOJSON CONVERSION
========================= */
function toGeoJSON(alerts) {
  return {
    type: "FeatureCollection",
    features: alerts
      .filter(a => a.geometry)
      .map(a => ({
        type: "Feature",
        geometry: a.geometry,
        properties: {
          id: a.id,
          type: a.type,
          severity: a.severity,
          urgency: a.urgency,
          source: a.source
        }
      }))
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

  const load = useCallback(async () => {
    try {
      setError(null);

      const [nws, mapserver, fema] = await Promise.all([
        fetchAllNWSAlerts(),
        fetchNOAAMapServerAlerts(),
        fetchFemaAlerts(),
      ]);

      if (!mountedRef.current) return;

      // Merge order: NWS API first (richest metadata), then MapServer (fills
      // geometry gaps), then FEMA (broadest supplemental coverage).
      const merged = mergeAlerts(nws, mapserver, fema);

      setAlertsState(merged);
      setAlerts(merged);
      setGeoJSON(toGeoJSON(merged));
      setLoading(false);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
      setLoading(false);
    }
  }, [setAlerts]);

  useEffect(() => {
    mountedRef.current = true;

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
    refresh: load
  };
}
