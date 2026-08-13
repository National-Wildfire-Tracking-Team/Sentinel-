/**
 * Netlify Edge Function – proxy NOAA's "Observed River Stages" ArcGIS MapServer.
 *
 * mapservices.weather.noaa.gov does not send CORS headers for cross-origin
 * browser requests, so direct fetch() calls fail. This is a distinct NOAA
 * system from NWPS (api.water.noaa.gov) — see src/api/noaaWaterGauge.js for
 * why it's used as the primary gauge-list source instead of NWPS's own
 * /gauges list endpoint, which has been observed to hang indefinitely
 * server-side regardless of bounding box size.
 *
 * Source: https://mapservices.weather.noaa.gov/eventdriven/rest/services/water/riv_gauges/MapServer
 * Layer 0 = "Observed River Stages" (current conditions, ~12.8k gauges).
 * The service caps each query at 10,000 records, so the client paginates via
 * resultOffset/resultRecordCount, forwarded verbatim here.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const QUERY_URL =
  'https://mapservices.weather.noaa.gov/eventdriven/rest/services/water/riv_gauges/MapServer/0/query' +
  '?where=1%3D1&outFields=gaugelid,status,location,waterbody,state,wfo,url,action,flood,moderate,major,observed,hdatum' +
  '&outSR=4326&f=geojson';

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(request.url);
    const count = url.searchParams.get('resultRecordCount') || '10000';
    const offset = url.searchParams.get('resultOffset') || '0';
    const queryUrl = `${QUERY_URL}&resultRecordCount=${count}&resultOffset=${offset}`;

    const resp = await fetch(queryUrl, { headers: { Accept: 'application/json' } });

    return new Response(resp.body, {
      status: resp.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': resp.headers.get('Content-Type') || 'application/geo+json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
};
