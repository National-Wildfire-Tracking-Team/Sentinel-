/**
 * useNexradRadar.js
 * Polls the Python radar service for NEXRAD scan metadata.
 * Returns scan timestamp and a tile URL template that includes a cache-bust
 * token so MapLibre GL automatically refetches tiles when a new scan arrives.
 *
 * Falls back to the Iowa Environmental Mesonet WMS when the radar service is
 * unavailable, so the map never shows a blank radar layer.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// Base URL of the Python radar service.
// In development the Vite proxy forwards /api/radar → localhost:8765.
// In production set VITE_RADAR_SERVICE_URL to point at your deployed service.
const RADAR_SERVICE_BASE =
  (import.meta.env.VITE_RADAR_SERVICE_URL || '').replace(/\/$/, '') || '/api/radar-svc';

// How often to check for new scans (ms). The Python service polls S3 every
// 2.5 min, so polling every 30 s is more than sufficient.
const POLL_INTERVAL_MS = 30_000;

// IEM WMS fallback — provides the national NEXRAD mosaic via a standard WMS
const IEM_FALLBACK_URL =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi' +
  '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=nexrad-n0q-900913' +
  '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857' +
  '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

/**
 * @returns {{
 *   tileUrl: string,          — XYZ tile URL template (includes {z}/{x}/{y})
 *   scanTime: Date | null,    — UTC time of the latest scan
 *   isServiceAvailable: bool, — false → fallback WMS is active
 *   isLoading: bool,
 *   error: string | null,
 *   refresh: () => void,      — manually trigger a metadata check
 * }}
 */
export function useNexradRadar(enabled = true) {
  const [scanTime, setScanTime] = useState(null);
  const [scanKey, setScanKey] = useState(null);   // used as cache-bust token
  const [isServiceAvailable, setIsServiceAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const abortRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    if (!enabled) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${RADAR_SERVICE_BASE}/status`, {
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const newScanTime = data.latestScanTime ? new Date(data.latestScanTime) : null;

      setScanTime(newScanTime);
      // Use the ISO timestamp string as a stable cache-bust token
      const token = data.latestScanTime || '';
      setScanKey((prev) => (prev !== token ? token : prev));
      setIsServiceAvailable(true);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message);
      setIsServiceAvailable(false);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  // Polling loop
  useEffect(() => {
    if (!enabled) return;

    fetchStatus();
    timerRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);

    return () => {
      clearInterval(timerRef.current);
      abortRef.current?.abort();
    };
  }, [enabled, fetchStatus]);

  // Build tile URL
  const tileUrl = isServiceAvailable
    ? `${RADAR_SERVICE_BASE}/tiles/reflectivity/{z}/{x}/{y}.png` +
      (scanKey ? `?t=${encodeURIComponent(scanKey)}` : '')
    : IEM_FALLBACK_URL;

  return {
    tileUrl,
    scanTime,
    isServiceAvailable,
    isLoading,
    error,
    refresh: fetchStatus,
  };
}
