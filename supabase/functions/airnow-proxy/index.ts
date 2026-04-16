/**
 * airnow-proxy – Supabase Edge Function
 *
 * Proxies AirNow private API requests server-side so the API key is never
 * exposed to the browser.
 *
 * Required secret (set via: supabase secrets set AIRNOW_API_KEY=<value>):
 *   AIRNOW_API_KEY
 *
 * POST body (JSON):
 *   lat?       number  – center latitude  (default: 39.5, US center)
 *   lon?       number  – center longitude (default: -98.35)
 *   distance?  number  – radius in miles  (default: 200)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const AIRNOW_API_KEY = Deno.env.get('AIRNOW_API_KEY') ?? '';

    if (!AIRNOW_API_KEY) {
      return jsonResponse({ error: 'AIRNOW_API_KEY secret is not configured in Supabase.' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const { lat = 39.5, lon = -98.35, distance = 200 } = body;

    const params = new URLSearchParams({
      format: 'application/json',
      latitude: String(lat),
      longitude: String(lon),
      distance: String(distance),
      API_KEY: AIRNOW_API_KEY,
    });

    const url = `https://www.airnowapi.org/aq/observation/latLon/current/?${params}`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await resp.text();

    return new Response(text, {
      status: resp.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
