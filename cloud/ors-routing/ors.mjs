/**
 * ors.mjs
 * The only module that talks to OpenRouteService (openrouteservice-js).
 * Errors from the library carry .status (HTTP status) — handlers.mjs maps them.
 */

import Openrouteservice from 'openrouteservice-js';

// Worst case /route is two Directions calls plus Supabase checks; 8 s each keeps
// it inside the 30 s Lambda/CloudFront budget (see handlers.mjs RETRY_BUDGET_MS).
export const TIMEOUT_MS = 8000;

export function createOrs(loadApiKey) {
  return {
    async matrix(locations) {
      const api_key = await loadApiKey();
      const client = new Openrouteservice.Matrix({ api_key, timeout: TIMEOUT_MS });
      return client.calculate({
        locations,
        profile: 'driving-car',
        sources: [0],
        destinations: locations.slice(1).map((_, i) => i + 1),
        metrics: ['duration', 'distance'],
      });
    },
    async directions({ origin, destination, avoid }) {
      const api_key = await loadApiKey();
      const client = new Openrouteservice.Directions({ api_key, timeout: TIMEOUT_MS });
      return client.calculate({
        coordinates: [origin, destination],
        profile: 'driving-car',
        format: 'geojson',
        instructions: true,
        ...(avoid ? { avoid_polygons: avoid } : {}),
      });
    },
  };
}
