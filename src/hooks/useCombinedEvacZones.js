/**
 * useCombinedEvacZones.js
 *
 * Merges evacuation zone polygons from two CalOES / ArcGIS services:
 *
 *   1. CA_EVACUATIONS_CalOESHosted_view  (caEvacZones.js)
 *      – Broad coverage; normalised to { warningType, zoneName, county, … }
 *
 *   2. CA_EVACUATIONS_PROD               (caEvacuations.js)
 *      – Authoritative prod feed; richer metadata (agency, jurisdiction, instructions)
 *
 * Normalisation strategy
 * ──────────────────────
 * Both sources are flattened to a shared schema:
 *   warningType  – "Evacuation Order" | "Evacuation Warning" | "Evacuation Watch/Advisory"
 *   zoneName     – display label
 *   county       – county name
 *   agency       – responsible agency (PROD feed only)
 *   jurisdiction – jurisdiction (PROD feed only)
 *   instructions – instructions text (PROD feed only)
 *   comments     – additional comments (PROD feed only)
 *   effectiveDate
 *   expirationDate
 *   externalURL
 *   source       – "hosted" | "prod" | "ipaws"
 *
 * IPAWS (optional)
 * ───────────────
 * When VITE_IPAWS_ALERTS_URL is set (default in dev: same-origin `/alerts` via Vite proxy),
 * CAP alerts with polygon/circle geometry are merged in as additional features (source: ipaws).
 *
 * Deduplication
 * ─────────────
 * When a feature from the PROD service is geographically identical (same centroid
 * within ~0.001°) or has the same zone name in the same county as a hosted feature,
 * the PROD record wins (richer metadata) and the hosted duplicate is dropped.
 * Features present only in one source are kept as-is.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCAEvacZones }    from '../api/caEvacZones';
import { fetchCaEvacuations }  from '../api/caEvacuations';
import { ipawsAlertsToEvacFeatures } from '../utils/ipawsEvacGeoJSON';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);
/** In dev, default to Vite proxy → Node poller; in prod default to edge function proxy. */
const IPAWS_ALERTS_URL = (
  import.meta.env.VITE_IPAWS_ALERTS_URL ?? (import.meta.env.DEV ? '/alerts' : '/api/fema')
).trim();
const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// ─── Schema normalisation ─────────────────────────────────────────────────────

/**
 * Map a Zone_Status value from the PROD service to the canonical warningType
 * strings used by EvacZonesLayer's Mapbox color expressions.
 */
function prodStatusToWarningType(status) {
  if (!status) return 'Evacuation Warning';
  const s = String(status).trim().toLowerCase();
  if (s.includes('order') || s.includes('mandatory')) return 'Evacuation Order';
  if (s.includes('watch')) return 'Evacuation Watch';
  return 'Evacuation Warning';
}

/**
 * Normalise a PROD feature to the unified schema.
 */
function normaliseProdFeature(f) {
  const p = f.properties || {};
  return {
    ...f,
    properties: {
      id:             p.OBJECTID ?? p.Zone_Name ?? '',
      warningType:    prodStatusToWarningType(p.Zone_Status),
      zoneName:       p.Zone_Name   || p.IncidentName || 'Evacuation Zone',
      county:         p.Jurisdiction || '',
      agency:         p.Agency       || '',
      jurisdiction:   p.Jurisdiction || '',
      instructions:   p.Instructions || '',
      comments:       p.Comments     || '',
      effectiveDate:  p.Date_Time_Issued || null,
      expirationDate: p.Last_Update      || null,
      externalURL:    '',
      source:         'prod',
    },
  };
}

/**
 * Normalise a hosted feature (already normalised by caEvacZones.js) to the
 * unified schema, adding the missing PROD-only fields as empty strings.
 */
function normaliseHostedFeature(f) {
  const p = f.properties || {};
  return {
    ...f,
    properties: {
      id:             p.id            ?? '',
      warningType:    p.warningType   || 'Evacuation Warning',
      zoneName:       p.zoneName      || 'Evacuation Zone',
      county:         p.county        || '',
      agency:         '',
      jurisdiction:   p.county        || '',
      instructions:   '',
      comments:       '',
      effectiveDate:  p.effectiveDate  || null,
      expirationDate: p.expirationDate || null,
      externalURL:    p.externalURL    || '',
      source:         'hosted',
    },
  };
}

// ─── Deduplication ───────────────────────────────────────────────────────────

/**
 * Build a rough centroid key for a GeoJSON feature.
 * For Polygon / MultiPolygon: average of first ring's first coordinate.
 * Falls back to "0,0" if the geometry is unparseable.
 */
function centroidKey(geometry) {
  try {
    if (!geometry) return '0,0';
    const coords =
      geometry.type === 'Polygon'
        ? geometry.coordinates[0]
        : geometry.type === 'MultiPolygon'
        ? geometry.coordinates[0][0]
        : null;
    if (!coords?.length) return '0,0';
    const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
    return `${lng.toFixed(3)},${lat.toFixed(3)}`;
  } catch {
    return '0,0';
  }
}

/**
 * Remove hosted features that are duplicated by a PROD feature.
 * A "duplicate" is detected when both the centroid key AND the zone name
 * match (case-insensitive), OR when the centroid alone matches within 0.001°.
 */
function deduplicateAgainstProd(hostedFeatures, prodFeatures) {
  const prodCentroids = new Set(prodFeatures.map(f => centroidKey(f.geometry)));

  const prodNamesByCounty = new Map();
  prodFeatures.forEach(f => {
    const key = `${(f.properties.county || '').toLowerCase()}:${(f.properties.zoneName || '').toLowerCase()}`;
    prodNamesByCounty.set(key, true);
  });

  return hostedFeatures.filter(f => {
    if (prodCentroids.has(centroidKey(f.geometry))) return false;
    const nameKey = `${(f.properties.county || '').toLowerCase()}:${(f.properties.zoneName || '').toLowerCase()}`;
    if (prodNamesByCounty.has(nameKey)) return false;
    return true;
  });
}

async function fetchIpawsEvacFeatures() {
  if (!IPAWS_ALERTS_URL) return [];
  try {
    const res = await fetch(IPAWS_ALERTS_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    return ipawsAlertsToEvacFeatures(data.alerts);
  } catch {
    return [];
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Fetches and combines CalOES hosted-view and PROD evacuation zones.
 * Falls back gracefully to whichever source succeeds if the other fails.
 *
 * @returns {{ geoJSON, loading, error, count, refresh }}
 */
export function useCombinedEvacZones(enabled = true) {
  const [geoJSON,  setGeoJSON]  = useState(EMPTY_GEOJSON);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);

    const [hosted, prod, ipawsFeatures] = await Promise.all([
      fetchCAEvacZones(),
      fetchCaEvacuations(),
      fetchIpawsEvacFeatures(),
    ]);

    if (!mountedRef.current) return;

    const normProd   = (prod?.features   || []).map(normaliseProdFeature);
    const normHosted = (hosted?.features || []).map(normaliseHostedFeature);

    // PROD features take precedence; remove hosted duplicates.
    const uniqueHosted = deduplicateAgainstProd(normHosted, normProd);

    const merged = {
      type: 'FeatureCollection',
      features: [...normProd, ...uniqueHosted, ...ipawsFeatures],
    };

    setGeoJSON(merged);
    setLoading(false);

    if (!merged.features.length) {
      setError(null); // empty is valid (no active zones)
    }
  }, [enabled]);

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
    geoJSON,
    loading,
    error,
    count: geoJSON.features.length,
    refresh: load,
  };
}
