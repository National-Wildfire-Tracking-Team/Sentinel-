/**
 * useNexradRadar.js
 * Polls the Python radar service for NEXRAD scan metadata.
 * Returns scan timestamp and a tile URL template that includes a cache-bust
 * token so MapLibre GL automatically refetches tiles when a new scan arrives.
 *
 * Source: https://registry.opendata.aws/noaa-nexrad/
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// Data source: https://registry.opendata.aws/noaa-nexrad/
// Base URL of the Python radar service.
// In development the Vite proxy forwards /api/radar-svc → localhost:8765.
// In production set VITE_RADAR_SERVICE_URL to point at your deployed service.
const RADAR_SERVICE_BASE =
  (import.meta.env.VITE_RADAR_SERVICE_URL || '').replace(/\/$/, '') || '/api/radar-svc';

// How often to check for new scans (ms). The Python service polls S3 every
// 2.5 min, so polling every 30 s is more than sufficient.
const POLL_INTERVAL_MS = 30_000;

/**
 * @returns {{
 *   tileUrl: string | null,   — XYZ tile URL (null until service responds)
 *   scanTime: Date | null,    — UTC time of the latest scan
 *   isServiceAvailable: bool,
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

  // Tile URL — null when service is unavailable (layer renders nothing)
  const tileUrl = isServiceAvailable
    ? `${RADAR_SERVICE_BASE}/tiles/reflectivity/{z}/{x}/{y}.png` +
      (scanKey ? `?t=${encodeURIComponent(scanKey)}` : '')
    : null;

  return {
    tileUrl,
    scanTime,
    isServiceAvailable,
    isLoading,
    error,
    refresh: fetchStatus,
  };
}
