/**
 * useWeatherAlerts.js
 * Unified nationwide alert system:
 * - NOAA/NWS (primary, full coverage)
 * - FEMA IPAWS (supplement)
 * - Deduplication + merging
 * - GeoJSON output for mapping
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useApp } from "../context/AppContext";
import xml2js from "xml2js";

const REFRESH_MS = 60 * 1000;

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
   FEMA IPAWS FETCH
========================= */
async function fetchFemaAlerts() {
  try {
    const url =
      "https://apps.fema.gov/IPAWSOPEN_EAS_SERVICE/rest/feed";

    const res = await fetch(url);
    const xml = await res.text();

    const parser = new xml2js.Parser({ explicitArray: false });
    const data = await parser.parseStringPromise(xml);

    const entries = data.feed?.entry || [];

    return entries.map(e => ({
      id: e.id,
      type: e["cap:event"],
      severity: e["cap:severity"],
      urgency: e["cap:urgency"],
      affectedArea: e["cap:areaDesc"],
      effective: e["cap:effective"],
      sent: e["cap:sent"],
      geometry: null,
      source: "FEMA"
    }));
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

function mergeAlerts(nws, fema) {
  const seenIds = new Set(nws.map(a => a.id));
  const seenKeys = new Set(nws.map(fingerprint));

  const filteredFema = fema.filter(a => {
    if (a.id && seenIds.has(a.id)) return false;

    const key = fingerprint(a);
    if (seenKeys.has(key)) return false;

    seenIds.add(a.id);
    seenKeys.add(key);

    return true;
  });

  return [...nws, ...filteredFema];
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

      const [nws, fema] = await Promise.all([
        fetchAllNWSAlerts(),
        fetchFemaAlerts()
      ]);

      if (!mountedRef.current) return;

      const merged = mergeAlerts(nws, fema);

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
