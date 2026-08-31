/**
 * USGS National Map colleges/universities (layer 56) for the current viewport.
 * Pro / Team / reporter entitlement — same gate as other infrastructure layers.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchNationalMapStructuresInBounds } from '../api/nationalMapStructures';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const DEBOUNCE_MS = 450;

function padBounds(west, south, east, north, padRatio = 0.35) {
  const lngSpan = Math.max(east - west, 1e-6);
  const latSpan = Math.max(north - south, 1e-6);
  const pw = lngSpan * padRatio;
  const ph = latSpan * padRatio;
  return {
    west: Math.max(-180, west - pw),
    east: Math.min(180, east + pw),
    south: Math.max(-85, south - ph),
    north: Math.min(85, north + ph),
  };
}

function boundsFromViewport(viewport) {
  if (!viewport) return null;
  const { longitude, latitude, zoom } = viewport;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !Number.isFinite(zoom)) {
    return null;
  }
  const latRad = (latitude * Math.PI) / 180;
  const metersPerPixel = (156543.03 * Math.cos(latRad)) / 2 ** zoom;
  const widthM = 512 * metersPerPixel;
  const heightM = 512 * metersPerPixel;
  const degLng = widthM / (111320 * Math.cos(latRad));
  const degLat = heightM / 110540;
  const west = longitude - degLng;
  const east = longitude + degLng;
  const south = latitude - degLat;
  const north = latitude + degLat;
  return padBounds(west, south, east, north);
}

/**
 * @param {boolean} enabled Layer on AND user entitled
 * @param {object|null} viewport AppContext viewport
 */
export function useNationalMapColleges(enabled, viewport) {
  const [geoJSON, setGeoJSON] = useState(EMPTY_GEOJSON);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    const bounds = boundsFromViewport(viewport);
    if (!bounds) return;

    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNationalMapStructuresInBounds(bounds);
      if (seq !== seqRef.current) return;
      setGeoJSON(data?.features ? data : EMPTY_GEOJSON);
    } catch (err) {
      if (seq !== seqRef.current) return;
      console.warn('[NationalMapColleges]', err.message);
      setError(err.message);
      setGeoJSON(EMPTY_GEOJSON);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [enabled, viewport]);

  useEffect(() => {
    if (!enabled) {
      seqRef.current += 1;
      setGeoJSON(EMPTY_GEOJSON);
      setLoading(false);
      setError(null);
      return undefined;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      load();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, load, viewport?.longitude, viewport?.latitude, viewport?.zoom]);

  return { geoJSON, loading, error, refresh: load };
}
