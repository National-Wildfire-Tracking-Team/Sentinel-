/**
 * Netlify Edge Function – proxy NOAA's "Full Forecast Period Stages" ArcGIS
 * MapServer layer.
 *
 * Same upstream service as river-gauges-proxy.js (see that file for the CORS
 * rationale) but layer 15 instead of layer 0: one row per gauge with a
 * forecasted stage/flood-status (computed against the forecast value) rather
 * than the observed one. Joined to the observed gauge list by gaugelid in
 * src/app/api/noaaWaterGauge.js to decide which gauges have a forecast above
 * action stage.
 *
 * Source: https://mapservices.weather.noaa.gov/eventdriven/rest/services/water/riv_gauges/MapServer/15
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const QUERY_URL =
  'https://mapservices.weather.noaa.gov/eventdriven/rest/services/water/riv_gauges/MapServer/15/query' +
  '?where=1%3D1&outFields=gaugelid,status,forecast,action,flood,moderate,major' +
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
