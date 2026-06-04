/**
 * Netlify Edge Function – proxy NHC (National Hurricane Center) endpoints.
 *
 * nhc.noaa.gov does not send CORS headers for cross-origin browser requests,
 * so direct fetch() calls fail silently. This function runs server-side and
 * returns the response with explicit CORS headers.
 *
 * Routes (after stripping /api/nhc prefix):
 *   /current         → https://www.nhc.noaa.gov/CurrentStorms.json
 *   /gis?file=<name> → https://www.nhc.noaa.gov/gis/forecast/archive/<name>
 *                      (filename validated to only allow NHC advisory GeoJSON files)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const NHC_BASE = 'https://www.nhc.noaa.gov';

const NHC_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0; +https://nationalwildfiretrackingteam.org)',
};

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  // Strip leading "/api/nhc" to get the sub-route
  const sub = url.pathname.replace(/^\/api\/nhc/, '') || '/';

  let target;

  if (sub === '/current' || sub === '/current/') {
    target = `${NHC_BASE}/CurrentStorms.json`;
  } else if (sub === '/gis' || sub === '/gis/') {
    const file = url.searchParams.get('file') || '';
    // Only allow known NHC advisory GeoJSON filenames to prevent open proxy abuse.
    // Valid examples: al092023_030_5day_pgn.json, ep052023_015_5day_lin.json
    if (!/^[a-z]{2}\d{6}_\d{3}_5day_(pgn|lin|pts)\.json$/i.test(file)) {
      return new Response(JSON.stringify({ error: 'Invalid or disallowed file name' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    target = `${NHC_BASE}/gis/forecast/archive/${file}`;
  } else {
    return new Response(JSON.stringify({ error: 'Unknown NHC sub-route' }), {
      status: 404,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const resp = await fetch(target, { headers: NHC_HEADERS });
    return new Response(resp.body, {
      status: resp.status,
      headers: {
        ...CORS,
        'Content-Type': resp.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
};
