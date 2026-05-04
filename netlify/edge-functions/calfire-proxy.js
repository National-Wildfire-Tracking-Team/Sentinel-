/**
 * Netlify Edge Function – proxy CAL FIRE IncidentApi (browser CORS bypass).
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const inactive = url.searchParams.get('inactive') ?? 'false';
  const target = `https://incidents.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList?inactive=${inactive}`;

  try {
    const resp = await fetch(target, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0)',
        Referer: 'https://incidents.fire.ca.gov/',
      },
    });

    return new Response(resp.body, {
      status: resp.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': resp.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
};
