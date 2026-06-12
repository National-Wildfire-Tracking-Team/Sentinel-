/**
 * Netlify Edge Function – proxy NOAA NWPS (National Water Prediction Service) API.
 *
 * api.water.noaa.gov does not send CORS headers for cross-origin browser
 * requests, so direct fetch() calls fail silently. This proxy runs server-side
 * and returns responses with explicit CORS headers.
 *
 * Routes (after stripping /api/nwps prefix):
 *   /gauges            → https://api.water.noaa.gov/nwps/v1/gauges
 *   /gauges/:lid       → https://api.water.noaa.gov/nwps/v1/gauges/:lid
 *   /gauges/:lid/stageflow → https://api.water.noaa.gov/nwps/v1/gauges/:lid/stageflow
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const NWPS_BASE = 'https://api.water.noaa.gov/nwps/v1';

const NWPS_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'SentinelWildfireTracker/1.0 (contact@nationalwildfiretrackingteam.org)',
};

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  // Strip /api/nwps prefix to get the upstream path
  const upstreamPath = url.pathname.replace(/^\/api\/nwps/, '') || '/';

  // Only allow /gauges sub-paths
  if (!upstreamPath.startsWith('/gauges')) {
    return new Response(JSON.stringify({ error: 'Unknown NWPS sub-route' }), {
      status: 404,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const target = `${NWPS_BASE}${upstreamPath}${url.search}`;

  try {
    const resp = await fetch(target, { headers: NWPS_HEADERS });
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: {
        ...CORS,
        'Content-Type': resp.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'public, max-age=180',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
};
