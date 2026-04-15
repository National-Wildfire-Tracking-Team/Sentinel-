/**
 * firms-proxy – Supabase Edge Function
 *
 * Proxies NASA FIRMS API requests server-side so the MAP key is never
 * exposed to the browser.
 *
 * Required secret (set via: supabase secrets set NASA_FIRMS_API_KEY=<value>):
 *   NASA_FIRMS_API_KEY
 *
 * POST body (JSON):
 *   action?  "status"                     – check MAP key validity
 *   source?  "VIIRS_SNPP_NRT" | "VIIRS_NOAA20_NRT" | "MODIS_NRT"
 *   area     "west,south,east,north"       – required unless action="status"
 *   days?    "1"–"10"                      – look-back window
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
    const NASA_FIRMS_API_KEY = Deno.env.get('NASA_FIRMS_API_KEY') ?? '';

    if (!NASA_FIRMS_API_KEY) {
      return jsonResponse({ error: 'NASA_FIRMS_API_KEY secret is not configured in Supabase.' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const { action, source = 'VIIRS_SNPP_NRT', area, days = '1' } = body;

    // ── MAP key status check ──────────────────────────────────────────────
    if (action === 'status') {
      const statusUrl =
        `https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=${encodeURIComponent(NASA_FIRMS_API_KEY)}`;
      const resp = await fetch(statusUrl, { headers: { Accept: 'application/json' } });
      const text = await resp.text();
      return new Response(text, {
        status: resp.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── Hotspot data fetch ────────────────────────────────────────────────
    if (!area) {
      return jsonResponse({ error: '"area" parameter is required (west,south,east,north)' }, 400);
    }

    const firmsUrl =
      `https://firms.modaps.eosdis.nasa.gov/api/area/json/${NASA_FIRMS_API_KEY}/${source}/${area}/${days}`;

    const resp = await fetch(firmsUrl, { headers: { Accept: 'application/json' } });
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
