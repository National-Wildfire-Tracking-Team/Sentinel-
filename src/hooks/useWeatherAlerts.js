/**
 * useWeatherAlerts.js
 * Unified nationwide alert system:
 * - NOAA/NWS (primary, full coverage)
 * - FEMA IPAWS (supplement)
 * - OpenWeatherMap One Call API (supplement)
 * - Deduplication + merging
 * - GeoJSON output for mapping
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useApp } from "../context/AppContext";
import { fetchOpenWeatherAlerts } from "../api/openWeatherAlerts";

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

function mergeAlerts(nws, fema, openWeather) {
  const seenIds  = new Set(nws.map(a => a.id));
  const seenKeys = new Set(nws.map(fingerprint));

  function addUnique(candidates) {
    return candidates.filter(a => {
      if (a.id && seenIds.has(a.id)) return false;
      const key = fingerprint(a);
      if (seenKeys.has(key)) return false;
      seenIds.add(a.id);
      seenKeys.add(key);
      return true;
    });
  }

  return [...nws, ...addUnique(fema), ...addUnique(openWeather)];
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

      const [nws, fema, openWeather] = await Promise.all([
        fetchAllNWSAlerts(),
        fetchFemaAlerts(),
        fetchOpenWeatherAlerts(),
      ]);

      if (!mountedRef.current) return;

      const merged = mergeAlerts(nws, fema, openWeather);

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
