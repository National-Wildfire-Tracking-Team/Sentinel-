/**
 * California Land Ownership (CAL FIRE FRAP public-ownership polygons) for
 * the current viewport. Pro / Team / reporter entitlement — same gate as
 * other infrastructure layers.
 *
 * Only meant to be enabled once the map is zoomed in close — see
 * isWithinLandOwnershipRange below — since the statewide dataset is only
 * useful once individual ownership parcels are distinguishable, and loading
 * it any further out would mean downloading far more polygons than the
 * viewport could usefully render.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCaliforniaLandOwnershipInBounds } from '../api/californiaLandOwnership';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const DEBOUNCE_MS = 450;

// Same assumed-viewport-width approximation as useNexradComposite.js's
// visible-radius cull — a soft relevance gate has no need for pixel-precise
// map bounds.
const ASSUMED_VIEWPORT_PX = 1600;
export const MAX_DISTANCE_MILES = 5;

function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

function visibleRadiusMiles(latitude, zoom) {
  const meters = metersPerPixel(latitude, zoom) * (ASSUMED_VIEWPORT_PX / 2);
  return meters / 1609.34;
}

/** True once the map's visible radius is within MAX_DISTANCE_MILES. */
export function isWithinLandOwnershipRange(viewport) {
  const { latitude, zoom } = viewport || {};
  if (!Number.isFinite(latitude) || !Number.isFinite(zoom)) return false;
  return visibleRadiusMiles(latitude, zoom) <= MAX_DISTANCE_MILES;
}

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
  const metersPerPx = (156543.03 * Math.cos(latRad)) / 2 ** zoom;
  const widthM = 512 * metersPerPx;
  const heightM = 512 * metersPerPx;
  const degLng = widthM / (111320 * Math.cos(latRad));
  const degLat = heightM / 110540;
  const west = longitude - degLng;
  const east = longitude + degLng;
  const south = latitude - degLat;
  const north = latitude + degLat;
  return padBounds(west, south, east, north);
}

/**
 * @param {boolean} enabled Layer on AND user entitled AND within range (see isWithinLandOwnershipRange)
 * @param {object|null} viewport AppContext viewport
 */
export function useCaliforniaLandOwnership(enabled, viewport) {
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
      const data = await fetchCaliforniaLandOwnershipInBounds(bounds);
      if (seq !== seqRef.current) return;
      setGeoJSON(data?.features ? data : EMPTY_GEOJSON);
    } catch (err) {
      if (seq !== seqRef.current) return;
      console.warn('[CaliforniaLandOwnership]', err.message);
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
