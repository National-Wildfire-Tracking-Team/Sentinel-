/**
 * ors.mjs
 * The only module that talks to OpenRouteService (its v2 REST API, over fetch).
 * A non-2xx answer throws an error carrying .status — handlers.mjs maps them.
 */

export const ORS_BASE_URL = 'https://api.openrouteservice.org/v2';

// Worst case /route is two Directions calls plus Supabase checks; 8 s each keeps
// it under ~30 s (see handlers.mjs RETRY_BUDGET_MS).
export const TIMEOUT_MS = 8000;

export function createOrs(loadApiKey, { fetchImpl = fetch } = {}) {
  async function post(path, body) {
    const apiKey = await loadApiKey();
    const res = await fetchImpl(`${ORS_BASE_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel();
      const err = new Error(`ORS ${res.status}`);
      err.name = 'OrsHttpError';
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  return {
    matrix(locations) {
      return post('/matrix/driving-car', {
        locations,
        sources: [0],
        destinations: locations.slice(1).map((_, i) => i + 1),
        metrics: ['duration', 'distance'],
      });
    },
    // preference 'fastest' leans on major roads (used to leave an evacuation zone);
    // omitted, ORS uses its default ('recommended').
    directions({ origin, destination, avoid, preference }) {
      return post('/directions/driving-car/geojson', {
        coordinates: [origin, destination],
        instructions: true,
        ...(preference ? { preference } : {}),
        ...(avoid ? { options: { avoid_polygons: avoid } } : {}),
      });
    },
  };
}
