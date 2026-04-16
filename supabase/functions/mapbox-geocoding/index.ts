/**
 * mapbox-geocoding – Supabase Edge Function
 *
 * Proxies Mapbox Geocoding API requests server-side so the access token is
 * never exposed to the browser.
 *
 * Rate-limited to 6 000 requests per minute (sliding window).
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

/* ── Sliding-window rate limiter (6 000 req / 60 s) ── */
const RATE_LIMIT_MAX = 6000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const requestTimestamps: number[] = [];

function pruneTimestamps(): void {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  while (requestTimestamps.length > 0 && requestTimestamps[0] <= cutoff) {
    requestTimestamps.shift();
  }
}

function isRateLimited(): { limited: boolean; retryAfterMs: number } {
  pruneTimestamps();
  if (requestTimestamps.length < RATE_LIMIT_MAX) {
    return { limited: false, retryAfterMs: 0 };
  }
  const retryAfterMs = requestTimestamps[0] + RATE_LIMIT_WINDOW_MS - Date.now();
  return { limited: true, retryAfterMs: Math.max(0, retryAfterMs) };
}

function recordRequest(): void {
  requestTimestamps.push(Date.now());
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // Enforce rate limit before making the upstream request
    const { limited, retryAfterMs } = isRateLimited();
    if (limited) {
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);
      return jsonResponse(
        { error: 'Mapbox rate limit reached (6 000 requests/min). Please retry shortly.' },
        429,
        { 'Retry-After': String(retryAfterSec) },
      );
    }

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

    // Record the request just before making the upstream call
    recordRequest();

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

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extraHeaders },
  });
}
