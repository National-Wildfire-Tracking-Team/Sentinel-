/**
 * useCombinedEvacZones.js
 *
 * Merges active evacuation zone polygons from:
 *
 *   1. CA_EVACUATIONS_CalOESHosted_view  (caEvacZones.js)
 *      – CalOES active-zone view; normalised to { warningType, zoneName, county, … }
 *
 *   2. FEMA IPAWS CAP alerts with polygon/circle geometry (optional)
 *
 * Normalisation strategy
 * ──────────────────────
 * Both sources are flattened to a shared schema:
 *   warningType  – "Evacuation Order" | "Evacuation Warning" | "Evacuation Watch/Advisory"
 *   zoneName     – display label
 *   county       – county name
 *   effectiveDate
 *   expirationDate
 *   externalURL
 *   source       – "hosted" | "ipaws"
 *
 * IPAWS (optional)
 * ───────────────
 * When VITE_IPAWS_ALERTS_URL is set (default in dev: same-origin `/alerts` via Vite proxy),
 * CAP alerts with polygon/circle geometry are merged in as additional features (source: ipaws).
 *
 * CA_EVACUATIONS_PROD is intentionally excluded because it retains historical
 * warning/order records after they leave the active hosted view.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCAEvacZones }    from '../api/caEvacZones';
import { ipawsAlertsToEvacFeatures } from '../utils/ipawsEvacGeoJSON';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);
/** In dev, default to Vite proxy → Node poller; in prod default to edge function proxy. */
const IPAWS_ALERTS_URL = (
  import.meta.env.VITE_IPAWS_ALERTS_URL ?? (import.meta.env.DEV ? '/alerts' : '/api/fema')
).trim();
const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// ─── Schema normalisation ─────────────────────────────────────────────────────

/**
 * Normalise a hosted feature (already normalised by caEvacZones.js) to the
 * unified schema.
 */
function normaliseHostedFeature(f) {
  const p = f.properties || {};
  return {
    ...f,
    id: f.id || `hosted-${p.id || f.properties?.OBJECTID || Math.random().toString(36).slice(2)}`,
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

// Client-side IPAWS alert cache — mirrors poller server's merge/persist behavior
// so alerts don't disappear prematurely in production (where edge functions are stateless).
const _ipawsCache = new Map();

async function fetchIpawsEvacFeatures() {
  if (!IPAWS_ALERTS_URL) {
    if (import.meta.env.DEV) {
      console.warn('[EvacZones] IPAWS alerts URL not configured; start the poller: node server/ipaws-server.js');
    }
    return _ipawsCache.size > 0 ? ipawsAlertsToEvacFeatures([..._ipawsCache.values()]) : [];
  }
  try {
    const res = await fetch(IPAWS_ALERTS_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`[EvacZones] IPAWS fetch failed: HTTP ${res.status} from ${IPAWS_ALERTS_URL}`);
      return _ipawsCache.size > 0 ? ipawsAlertsToEvacFeatures([..._ipawsCache.values()]) : [];
    }
    const data = await res.json();
    const newAlerts = data?.alerts ?? [];
    console.log(`[EvacZones] IPAWS: ${newAlerts.length} alerts received (cache: ${_ipawsCache.size})`);

    const now = new Date().toISOString();

    // Add new alerts to cache
    for (const alert of newAlerts) {
      if (alert.identifier) _ipawsCache.set(alert.identifier, alert);
    }

    // Remove genuinely expired alerts from cache
    for (const [id, cached] of _ipawsCache) {
      const expiresStr = cached.infos?.[0]?.expires || cached.expires || null;
      if (expiresStr && expiresStr < now) _ipawsCache.delete(id);
    }

    const merged = [..._ipawsCache.values()];
    console.log(`[EvacZones] IPAWS: ${merged.length} total after merge (${_ipawsCache.size} cached)`);
    return ipawsAlertsToEvacFeatures(merged);
  } catch (err) {
    console.warn(`[EvacZones] IPAWS fetch error: ${err.message} (URL: ${IPAWS_ALERTS_URL})`);
    return _ipawsCache.size > 0 ? ipawsAlertsToEvacFeatures([..._ipawsCache.values()]) : [];
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Fetches and combines the CalOES active hosted view with IPAWS evacuation alerts.
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

    const [hosted, ipawsFeatures] = await Promise.all([
      fetchCAEvacZones(),
      fetchIpawsEvacFeatures(),
    ]);

    if (!mountedRef.current) return;

    const normHosted = (hosted?.features || []).map(normaliseHostedFeature);

    const merged = {
      type: 'FeatureCollection',
      features: [...normHosted, ...ipawsFeatures],
    };

    console.log(
      `[EvacZones] Loaded: ${normHosted.length} hosted + ${ipawsFeatures.length} ipaws = ${merged.features.length} total`
    );
    if (merged.features.length > 0) {
      const sample = merged.features[0];
      console.log(
        `[EvacZones] Sample feature: id=${sample.id} type=${sample.geometry?.type} warningType=${sample.properties?.warningType} zoneName=${sample.properties?.zoneName?.slice(0, 40)}`
      );
    }

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
