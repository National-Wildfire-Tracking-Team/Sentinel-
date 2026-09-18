/**
 * _shared/edgeProxy.js
 * Shared plumbing for the layer-data proxy edge functions.
 *
 * Every map-data layer that isn't live/realtime routes through one of the
 * provider-grouped proxies in this directory (nws-mapservices-proxy,
 * arcgis-proxy, …).  Before this existed each layer fetched its upstream
 * ArcGIS/NOAA endpoint straight from the browser, so every visitor paid the
 * full upstream round-trip for every layer on every session — the in-memory
 * cache in src/app/utils/dataCache.js is per-tab and dies on reload.
 *
 * Routing these through the edge means the first request to a POP warms the
 * CDN and everyone after that is served locally.
 *
 * CACHE FRESHNESS
 * ---------------
 * Responses carry `Netlify-CDN-Cache-Control` with an `s-maxage` tuned to the
 * upstream's real publish cadence plus `stale-while-revalidate`.  Within
 * s-maxage the edge answers from cache; the first request after expiry gets
 * the stale copy *and* kicks off a background refetch, so every request after
 * that is fresh.  Under normal traffic that means data refreshes continuously
 * and no user ever waits on the upstream.
 *
 * Worst-case staleness is `s-maxage` plus a single stale response — see TIERS.
 *
 * The browser deliberately gets `max-age=0, must-revalidate`: it always asks,
 * and the edge answers from cache in tens of milliseconds.  That costs one
 * cheap round-trip in exchange for a guarantee that no tab can ever display
 * data older than what the edge holds, which matters for a life-safety app.
 *
 * NOTE: `durable` is intentionally absent — it is a serverless-only directive
 * and has no effect on edge function responses.  Each POP caches on its own.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Upstreams reject or throttle bare server-side requests without
 * browser-ish headers (tigerweb's WAF is the loudest example, which is why
 * census-counties-proxy.js already does this).
 */
const UPSTREAM_HEADERS = {
  Accept: 'application/json, application/geo+json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0)',
};

/**
 * Cache tiers, in seconds.  Picked from how often each upstream actually
 * publishes, not from how often the client happens to poll.
 *
 *   lifeSafety – evacuation zones, NWS active alerts.  Deliberately the
 *                tightest window we can hold while still getting a useful
 *                hit rate; these change the decisions people make.
 *   active     – observation feeds that move through the day.
 *   outlook    – forecast products issued a few times a day.
 *   static     – historical/reference geometry that changes yearly at most.
 */
export const TIERS = {
  lifeSafety: { sMaxAge: 45, swr: 90 },
  active: { sMaxAge: 180, swr: 600 },
  outlook: { sMaxAge: 600, swr: 1800 },
  static: { sMaxAge: 86400, swr: 604800 },
};

/**
 * Query params forwarded upstream.  An allowlist rather than a passthrough
 * for two reasons: it keeps tracking params (utm_*, fbclid, …) from
 * fragmenting the cache into per-visitor entries, and it means a caller
 * can't smuggle something like `token` into an upstream request.
 *
 * This same list is published as `Netlify-Vary: query=…` so exactly these
 * params form the cache key.  It is a module constant, which satisfies
 * Netlify's rule that a URL must return identical Vary instructions on
 * every response.
 */
export const ALLOWED_PARAMS = [
  // ArcGIS REST query
  'where', 'outFields', 'f', 'resultRecordCount', 'resultOffset',
  'returnGeometry', 'outSR', 'inSR', 'geometry', 'geometryType',
  'spatialRel', 'orderByFields', 'returnCountOnly', 'returnIdsOnly',
  'objectIds', 'maxAllowableOffset', 'geometryPrecision', 'resultType',
  'returnDistinctValues', 'outStatistics', 'groupByFieldsForStatistics',
  'having', 'distance', 'units', 'layerDefs', 'returnZ', 'returnM',
  'cacheHint', 'quantizationParameters', 'time',
  // OGC API Features (NESDIS NGFS)
  'limit', 'offset', 'bbox', 'datetime', 'filter', 'crs', 'bbox-crs',
  // api.weather.gov alerts. `point` and `cursor` are load-bearing: dropping
  // `point` would silently widen a single-location query to every active
  // alert in the country, and dropping `cursor` would make pagination loop
  // on page one forever.
  'area', 'status', 'message_type', 'event', 'region', 'region_type',
  'zone', 'urgency', 'severity', 'certainty', 'start', 'end', 'active',
  'point', 'cursor',
];

const ALLOWED_PARAM_SET = new Set(ALLOWED_PARAMS);

const NETLIFY_VARY = `query=${ALLOWED_PARAMS.join('|')}`;

/**
 * Snap an ArcGIS envelope out to a fixed grid.
 *
 * Viewport-driven layers send the map's exact bounds, so without this every
 * user produces a unique cache key and the cache never gets a hit.  Rounding
 * the envelope outward to a shared grid makes nearby viewers collide on one
 * entry.  The response is a superset of what was asked for, which these
 * layers already cope with because they filter client-side.
 *
 * Anything that isn't a recognisable WGS84 envelope is returned untouched —
 * a poor hit rate is an acceptable outcome, a corrupted query is not.
 *
 * @param {string} raw   `geometry` param value (ArcGIS envelope JSON)
 * @param {number} step  grid size in degrees
 * @returns {string}
 */
export function quantizeGeometry(raw, step) {
  if (!raw || !step) return raw;

  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return raw;
  }

  const { xmin, ymin, xmax, ymax } = envelope || {};
  if (![xmin, ymin, xmax, ymax].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return raw;
  }

  return JSON.stringify({
    ...envelope,
    xmin: Math.floor(xmin / step) * step,
    ymin: Math.floor(ymin / step) * step,
    xmax: Math.ceil(xmax / step) * step,
    ymax: Math.ceil(ymax / step) * step,
  });
}

/**
 * Build the upstream URL for a resolved route.
 *
 * The caller's path after the route key is appended verbatim to the route's
 * base, so a client only has to repoint its base constant at the proxy and
 * can keep composing `/{layerId}/query?…` exactly as it did against the
 * upstream directly.
 *
 * @param {object} route     route definition from a proxy's ROUTES map
 * @param {string} origin    default upstream origin for this proxy
 * @param {string} suffix    path after the route key (may be '')
 * @param {URLSearchParams} search  caller's query params
 * @returns {string}
 */
export function buildUpstreamUrl(route, origin, suffix, search) {
  const base = `${route.origin || origin}${route.path}`;
  const params = new URLSearchParams();

  for (const [key, value] of search.entries()) {
    if (!ALLOWED_PARAM_SET.has(key)) continue;
    params.append(
      key,
      key === 'geometry' ? quantizeGeometry(value, route.geometryStep) : value,
    );
  }

  for (const [key, value] of Object.entries(route.forcedParams || {})) {
    params.set(key, value);
  }

  // URLSearchParams escapes commas to %2C, but some NWS endpoints reject that
  // encoding outright — src/app/api/noaaWeather.js builds
  // `message_type=alert,update` by hand for exactly this reason. Commas are
  // never delimiters in these APIs (they separate values *within* a param,
  // as in ArcGIS `outFields=a,b,c`), so restoring them literally is safe.
  const query = params.toString().replace(/%2C/g, ',');
  return `${base}${suffix}${query ? `?${query}` : ''}`;
}

/**
 * Cache headers for a successful proxied response.
 * @param {keyof TIERS} tier
 * @param {string} routeKey  becomes a cache tag, so a single layer can be
 *                           purged on demand later without reworking this.
 */
export function cacheHeaders(tier, routeKey) {
  const { sMaxAge, swr } = TIERS[tier] || TIERS.active;
  return {
    'Netlify-CDN-Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Netlify-Cache-Tag': `layer:${routeKey}`,
    'Netlify-Vary': NETLIFY_VARY,
  };
}

/**
 * An error response is explicitly `no-store`: a transient upstream outage
 * must never be cached, or one bad moment gets served to everyone for the
 * length of the TTL.
 */
export function errorResponse(message, status = 502) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Netlify-CDN-Cache-Control': 'no-store',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Resolve an incoming request path into a route + upstream path suffix.
 *
 * The route key is the first path segment after the proxy's prefix; anything
 * after it is the suffix handed to the upstream.
 *
 * @returns {{ routeKey: string, route: object, suffix: string } | null}
 */
export function resolveRoute(pathname, prefix, routes) {
  const rest = pathname.replace(prefix, '').replace(/^\/+/, '');
  if (!rest) return null;

  const slash = rest.indexOf('/');
  const routeKey = slash === -1 ? rest : rest.slice(0, slash);
  const suffix = slash === -1 ? '' : rest.slice(slash);

  const route = routes[routeKey];
  if (!route) return null;

  return { routeKey, route, suffix };
}

/**
 * Build a Netlify edge function that proxies an allowlisted set of upstream
 * routes with tiered CDN caching.
 *
 * The upstream host is never caller-controlled — it comes from `routes` — so
 * this cannot be turned into an open proxy.
 *
 * @param {object}  config
 * @param {string}  config.prefix   mounted path prefix, e.g. '/api/nws'
 * @param {string}  config.origin   default upstream origin
 * @param {object}  config.routes   routeKey → { path, tier, origin?,
 *                                   geometryStep?, forcedParams?, contentType? }
 */
export function createProxy({ prefix, origin, routes }) {
  return async (request) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Only GET is cacheable by the CDN, so nothing else is worth proxying.
    if (request.method !== 'GET') {
      return errorResponse('Method not allowed', 405);
    }

    const url = new URL(request.url);
    const resolved = resolveRoute(url.pathname, prefix, routes);

    if (!resolved) {
      return errorResponse(`Unknown route: ${url.pathname}`, 404);
    }

    const { routeKey, route, suffix } = resolved;
    const target = buildUpstreamUrl(route, origin, suffix, url.searchParams);

    let upstream;
    try {
      upstream = await fetch(target, { headers: UPSTREAM_HEADERS });
    } catch (err) {
      return errorResponse(`Upstream request failed: ${err.message}`);
    }

    if (!upstream.ok) {
      return errorResponse(`Upstream error ${upstream.status} for ${routeKey}`);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type':
          route.contentType
          || upstream.headers.get('Content-Type')
          || 'application/geo+json',
        ...cacheHeaders(route.tier, routeKey),
      },
    });
  };
}
