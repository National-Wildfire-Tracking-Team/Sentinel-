/**
 * geocode.js
 * Forward-geocodes a free-text US address/ZIP/place to { lat, lng, placeName }
 * via the Supabase mapbox-geocoding edge function, falling back to Mapbox
 * directly when Supabase isn't configured or the function errors.
 */

import { supabase, isSupabaseConfigured } from '../../shared/api/supabaseClient';
import { acquireSlot } from './mapboxRateLimiter';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

async function geocodeViaDirect(address) {
  if (!MAPBOX_TOKEN) throw new Error('Geocoding unavailable – Mapbox token not configured');
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    country: 'us',
    limit: '1',
    types: 'address,place,postcode,neighborhood,locality',
  });
  const encoded = encodeURIComponent(address.trim());
  const resp = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?${params}`
  );
  if (!resp.ok) throw new Error(`Geocoding failed (${resp.status})`);
  const data = await resp.json();
  if (!data?.features?.length) throw new Error('Address not found');
  const [lng, lat] = data.features[0].center;
  return { lat, lng, placeName: data.features[0].place_name };
}

// FunctionsHttpError carries the fetch Response as .context. A 429 is the
// per-user limit: falling back to direct Mapbox would just dodge it.
const isRateLimited = (error) => error?.context?.status === 429 || error?.status === 429;

export async function geocodeAddress(address) {
  if (!isSupabaseConfigured) return geocodeViaDirect(address);
  await acquireSlot();
  const { data, error } = await supabase.functions.invoke('mapbox-geocoding', {
    body: { query: address, country: 'us', limit: 1, types: 'address,place,postcode,neighborhood,locality' },
  });
  if (error) return isRateLimited(error) ? Promise.reject(new Error('Geocoding rate limited')) : geocodeViaDirect(address);
  if (!data?.features?.length) throw new Error('Address not found');
  const first = data.features[0];
  if (!Array.isArray(first?.geometry?.coordinates)) throw new Error('Address not found');
  const [lng, lat] = first.geometry.coordinates;
  return { lat, lng, placeName: first.properties?.full_address ?? first.properties?.name ?? '' };
}

const SUGGEST_TYPES = 'address,place,postcode,neighborhood,locality,poi';

const abortError = () => {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
};
const throwIfAborted = (signal) => { if (signal?.aborted) throw abortError(); };

const validProximity = (p) => Array.isArray(p) && p.length === 2
  && Number.isFinite(p[0]) && Number.isFinite(p[1])
  && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;

/* Small LRU in front of the edge rate limit (60/min per user, shared with
 * geocodeAddress): backspacing or retyping a query is served from memory. */
const CACHE_MAX = 50;
const CACHE_TTL_MS = 5 * 60 * 1000;
const suggestionCache = new Map();

const cacheKey = (q, proximity) => {
  const cell = validProximity(proximity) ? `${proximity[0].toFixed(2)},${proximity[1].toFixed(2)}` : '';
  return `${q.toLowerCase()}|${cell}`;
};

function cacheGet(key) {
  const hit = suggestionCache.get(key);
  if (!hit) return null;
  suggestionCache.delete(key);
  if (Date.now() - hit.at > CACHE_TTL_MS) return null;
  suggestionCache.set(key, hit); // refresh recency
  return hit.value;
}

function cacheSet(key, value) {
  suggestionCache.delete(key);
  suggestionCache.set(key, { at: Date.now(), value });
  while (suggestionCache.size > CACHE_MAX) suggestionCache.delete(suggestionCache.keys().next().value);
}

/** Test-only: empty the suggestion cache. */
export function __clearSuggestionCache() {
  suggestionCache.clear();
}

const toSuggestion = (id, label, coords) => {
  if (!Array.isArray(coords) || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1]) || !label) return null;
  return { id: String(id ?? `${coords[0]},${coords[1]}`), label, lat: coords[1], lng: coords[0] };
};

async function suggestViaDirect(q, { signal, proximity, limit }) {
  if (!MAPBOX_TOKEN) return [];
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    country: 'us',
    limit: String(limit),
    types: SUGGEST_TYPES,
    autocomplete: 'true',
  });
  if (validProximity(proximity)) params.set('proximity', `${proximity[0]},${proximity[1]}`);
  const resp = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params}`,
    { signal },
  );
  if (!resp.ok) throw new Error(`Geocoding failed (${resp.status})`);
  const data = await resp.json();
  return (data?.features || []).map((f) => toSuggestion(f.id, f.place_name, f.center)).filter(Boolean);
}

/**
 * Type-ahead address suggestions (US). Returns [{ id, label, lat, lng }].
 * Mapbox only; never touches ORS or the routing service. Queries under three
 * characters return [] without a request. Re-throws AbortError.
 *
 * Results are cached (LRU, 50 entries, 5 min) by query + proximity rounded to
 * 2 decimals. An edge 429 returns [] without the direct-Mapbox fallback.
 */
export async function suggestAddresses(query, { signal, proximity, limit = 5 } = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  throwIfAborted(signal);
  const key = cacheKey(q, proximity);
  const cached = cacheGet(key);
  if (cached) return cached;
  const result = await fetchSuggestions(q, { signal, proximity, limit });
  if (result) cacheSet(key, result);
  return result || [];
}

/** Resolves suggestions, or null for a result that must not be cached (429). */
async function fetchSuggestions(q, { signal, proximity, limit }) {
  if (!isSupabaseConfigured) return suggestViaDirect(q, { signal, proximity, limit });
  await acquireSlot();
  throwIfAborted(signal);
  const body = { query: q, country: 'us', limit, types: SUGGEST_TYPES, autocomplete: true };
  if (validProximity(proximity)) body.proximity = [proximity[0], proximity[1]];
  const { data, error } = await supabase.functions.invoke('mapbox-geocoding', { body, signal });
  // invoke reports an abort as an error result rather than throwing.
  throwIfAborted(signal);
  if (error) return isRateLimited(error) ? null : suggestViaDirect(q, { signal, proximity, limit });
  return (data?.features || [])
    .map((f) => toSuggestion(
      f?.id ?? f?.properties?.mapbox_id,
      f?.properties?.full_address
        ?? [f?.properties?.name, f?.properties?.place_formatted].filter(Boolean).join(', '),
      f?.geometry?.coordinates,
    ))
    .filter(Boolean);
}

// ── Reverse geocoding (Navigation "From" box for My location) ──────────────
// The edge function is forward-only, so this goes to Mapbox directly with the
// public token the map already uses. No token, a failure or no match → null,
// and the caller shows coordinates instead.
const REVERSE_CACHE_MAX = 50;
const reverseCache = new Map();

export async function reverseGeocode([lng, lat] = [], { signal } = {}) {
  if (!MAPBOX_TOKEN || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const key = `${lng.toFixed(4)},${lat.toFixed(4)}`;
  if (reverseCache.has(key)) return reverseCache.get(key);
  await acquireSlot();
  throwIfAborted(signal);
  const params = new URLSearchParams({ access_token: MAPBOX_TOKEN });
  const resp = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params}`,
    { signal },
  );
  if (!resp.ok) return null;
  const data = await resp.json();
  const name = data?.features?.[0]?.place_name || null;
  if (name) {
    if (reverseCache.size >= REVERSE_CACHE_MAX) reverseCache.delete(reverseCache.keys().next().value);
    reverseCache.set(key, name);
  }
  return name;
}

export function __clearReverseCache() {
  reverseCache.clear();
}
