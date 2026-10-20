/**
 * handlers.mjs
 * /shelters/nearest and /route. Every dependency is injected so this file is
 * testable without network, Supabase or ORS. Order per request:
 *   validate → authorize (always) → cache → quota unit → ORS.
 */

import { HttpError, authorize, takeQuota } from './auth.mjs';
import { isLngLat, roundCoord } from './geo.mjs';
import { mergeShelters, nearestByDistance, rankByDriveTime } from './shelters.mjs';

export const MAX_AVOID_VERTICES = 12_000;
export const MAX_AVOID_POLYGONS = 2_000;
const DEFAULT_RADIUS_KM = 80;
const MIN_RADIUS_KM = 5;
const MAX_RADIUS_KM = 160;
/** Past this, /route skips the no-avoid retry: another 8 s ORS call would push it past ~30 s. */
export const RETRY_BUDGET_MS = 18_000;

const bad = (detail) => new HttpError(400, { error: 'invalid_request', detail });

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** ORS quota/auth errors mean we're out of account capacity; 400/404 mean "no route". */
function upstreamError(err) {
  if (err instanceof HttpError) return err;
  if (err?.status === 429 || err?.status === 403) {
    return new HttpError(429, { error: 'quota', scope: 'global', window: 'minute', retryAfterSec: 60 });
  }
  return new HttpError(502, { error: 'routing_upstream_failed' });
}
const isNoRoute = (err) => err?.status === 400 || err?.status === 404;

/** Shape + size check, done before auth so oversized bodies cost nothing. */
function isAvoid(a) {
  if (a === null || a === undefined) return true;
  if ((a.type !== 'Polygon' && a.type !== 'MultiPolygon') || !Array.isArray(a.coordinates)) return false;
  const polygons = a.type === 'Polygon' ? [a.coordinates] : a.coordinates;
  if (polygons.length > MAX_AVOID_POLYGONS) return false;
  let vertices = 0;
  for (const poly of polygons) {
    if (!Array.isArray(poly)) return false;
    for (const ring of poly) {
      if (!Array.isArray(ring) || !ring.every(isLngLat)) return false;
      vertices += ring.length;
      if (vertices > MAX_AVOID_VERTICES) return false;
    }
  }
  return true;
}

/** Route preferences a client may ask for; anything else is rejected. */
const PREFERENCES = new Set(['fastest', 'recommended']);

const asResponse = (err) => ({ status: err.status, body: err.body });

/** @typedef {(severity: string, message: string, fields?: Record<string, unknown>) => void} Log */

/** @param {{ supabase: any, ors: any, shelterSources: any, nearestCache: any, routeCache: any, log?: Log, now?: () => number }} deps */
export function createHandlers({ supabase, ors, shelterSources, nearestCache, routeCache, log = () => {}, now = Date.now }) {
  /** Maps a non-HttpError to a response error, logging only its kind/status (never message, body or headers). */
  function mapUpstream(err, path) {
    if (!(err instanceof HttpError)) log('ERROR', 'upstream_failed', { path, kind: err?.name, status: err?.status, reason: err?.reason });
    return upstreamError(err);
  }

  async function nearest(headers, body) {
    try {
      if (!isLngLat(body?.origin)) throw bad('origin must be [lng, lat]');
      // Snap to the ~1 km cell so cached/ORS data never holds anyone's exact location.
      const origin = [roundCoord(body.origin[0], 2), roundCoord(body.origin[1], 2)];
      const requested = Number(body?.radiusKm ?? DEFAULT_RADIUS_KM);
      const radiusKm = Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Number.isFinite(requested) ? requested : DEFAULT_RADIUS_KM));

      const { jwt } = await authorize(supabase, headers);

      const key = `${roundCoord(origin[0], 2)},${roundCoord(origin[1], 2)}|${radiusKm}`;
      const cached = nearestCache.get(key);
      if (cached) return { status: 200, body: cached };

      const [sentinel, fema] = await Promise.allSettled([
        shelterSources.sentinel(origin, radiusKm),
        shelterSources.fema(origin, radiusKm),
      ]);
      if (sentinel.status === 'rejected') log('WARNING', 'sentinel_shelters_failed', { kind: sentinel.reason?.name });
      if (fema.status === 'rejected') log('WARNING', 'fema_shelters_failed', { kind: fema.reason?.name });
      const partial = sentinel.status === 'rejected' || fema.status === 'rejected';

      const merged = mergeShelters(
        sentinel.status === 'fulfilled' ? sentinel.value : [],
        fema.status === 'fulfilled' ? fema.value : [],
      );
      const candidates = nearestByDistance(origin, merged);
      if (!candidates.length) return { status: 200, body: { shelters: [], partial } };

      const rank = async (from) => {
        try {
          return await rankByDriveTime(from, candidates, (locations) => ors.matrix(locations));
        } catch (err) {
          throw mapUpstream(err, 'nearest');
        }
      };
      await takeQuota(supabase, jwt, 'matrix');
      let shelters = await rank(origin);
      if (shelters.length) {
        const result = { shelters, partial };
        if (!partial) nearestCache.set(key, result);
        return { status: 200, body: result };
      }

      // The ~1 km cell centre can land off-road (rural areas, water), so ORS
      // reaches nothing from it. Re-rank once from the caller's exact origin.
      // Privacy trade-off: only this one Matrix request sees the exact point;
      // the shelter-source fetch and the cache key stay snapped, and an
      // exact-origin result is never cached. It costs one more Matrix unit, so
      // quota comes first; a refused retry answers with the empty list.
      const exact = body.origin;
      if (exact[0] !== origin[0] || exact[1] !== origin[1]) {
        try {
          await takeQuota(supabase, jwt, 'matrix');
        } catch (quotaErr) {
          if (quotaErr instanceof HttpError && quotaErr.status === 429) return { status: 200, body: { shelters: [], partial } };
          throw quotaErr;
        }
        shelters = await rank(exact);
      }
      return { status: 200, body: { shelters, partial } };
    } catch (err) {
      if (err instanceof HttpError) return asResponse(err);
      log('ERROR', 'nearest_failed', { kind: err?.name });
      return asResponse(upstreamError(err));
    }
  }

  async function route(headers, body) {
    const started = now();
    try {
      const origin = body?.origin;
      const destination = body?.destination;
      const avoid = body?.avoid ?? null;
      const preference = body?.preference ?? null;
      if (!isLngLat(origin) || !isLngLat(destination)) throw bad('origin and destination must be [lng, lat]');
      if (preference !== null && !PREFERENCES.has(preference)) throw bad('preference must be "fastest" or "recommended"');
      // Only passed on when asked for, so plain routes keep their call shape and cache key.
      const pref = preference ? { preference } : {};
      if (!isAvoid(avoid)) throw bad(`avoid must be a Polygon/MultiPolygon (≤ ${MAX_AVOID_POLYGONS} polygons, ≤ ${MAX_AVOID_VERTICES} vertices) or null`);

      const { jwt } = await authorize(supabase, headers);

      const key = await sha256Hex(JSON.stringify({ origin, destination, avoid, ...pref }));
      const cached = routeCache.get(key);
      if (cached) return { status: 200, body: cached };

      await takeQuota(supabase, jwt, 'directions');
      let result;
      try {
        // avoidedHazards means "avoid polygons were applied to this route". It is
        // false both when none were sent (nothing near the trip) and when the
        // no-avoid fallback below was used; the client warns only for the latter
        // (useRouteToSafety: hazardWarning = Boolean(avoid) && !avoidedHazards).
        result = { route: await ors.directions({ origin, destination, avoid, ...pref }), avoidedHazards: Boolean(avoid) };
      } catch (err) {
        if (!isNoRoute(err)) throw mapUpstream(err, 'route');
        if (!avoid) return { status: 422, body: { error: 'no_route' } };
        // A second ORS call could push the whole request past ~30 s.
        if (now() - started > RETRY_BUDGET_MS) return { status: 422, body: { error: 'no_route' } };
        try {
          await takeQuota(supabase, jwt, 'directions');
        } catch (quotaErr) {
          if (quotaErr instanceof HttpError && quotaErr.status === 429) return { status: 422, body: { error: 'no_route' } };
          throw quotaErr;
        }
        try {
          result = { route: await ors.directions({ origin, destination, avoid: null, ...pref }), avoidedHazards: false };
        } catch (retryErr) {
          if (isNoRoute(retryErr)) return { status: 422, body: { error: 'no_route' } };
          throw mapUpstream(retryErr, 'route');
        }
      }
      routeCache.set(key, result);
      return { status: 200, body: result };
    } catch (err) {
      if (err instanceof HttpError) return asResponse(err);
      log('ERROR', 'route_failed', { kind: err?.name });
      return asResponse(upstreamError(err));
    }
  }

  return { nearest, route };
}
