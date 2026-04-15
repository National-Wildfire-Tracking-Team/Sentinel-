/**
 * mapbox-geocoding – Supabase Edge Function
 *
 * Proxies Mapbox Geocoding API requests server-side so the access token is
 * never exposed to the browser.
 *
 * Required secret (set via: supabase secrets set MAPBOX_TOKEN=<value>):
 *   MAPBOX_TOKEN
 *
 * POST body (JSON):
 *   query        string   – address / place string to geocode (required)
 *   country?     string   – ISO country code filter (default: "us")
 *   limit?       number   – max results (default: 5)
 *   types?       string   – comma-separated feature types (e.g. "address,place")
 *   autocomplete? boolean – enable autocomplete (default: true)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const MAPBOX_TOKEN = Deno.env.get('MAPBOX_TOKEN') ?? '';

    if (!MAPBOX_TOKEN) {
      return jsonResponse({ error: 'MAPBOX_TOKEN secret is not configured in Supabase.' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const {
      query,
      country = 'us',
      limit = 5,
      types,
      autocomplete = true,
    } = body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return jsonResponse({ error: '"query" parameter is required' }, 400);
    }

    const params = new URLSearchParams({
      access_token: MAPBOX_TOKEN,
      country: String(country),
      limit: String(limit),
      autocomplete: String(autocomplete),
    });

    if (types) params.set('types', String(types));

    const encoded = encodeURIComponent(query.trim());
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?${params}`;

    const resp = await fetch(url);
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
