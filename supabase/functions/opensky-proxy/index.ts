/**
 * opensky-proxy – Supabase Edge Function
 *
 * Proxies OpenSky Network API requests server-side so credentials are never
 * exposed to the browser. Falls back to unauthenticated access when secrets
 * are not configured (lower rate limits apply).
 *
 * Optional secrets (set via: supabase secrets set OPENSKY_USERNAME=<value>):
 *   OPENSKY_USERNAME
 *   OPENSKY_PASSWORD
 *
 * POST body (JSON):
 *   lamin  – minimum latitude  (south bound)
 *   lomin  – minimum longitude (west bound)
 *   lamax  – maximum latitude  (north bound)
 *   lomax  – maximum longitude (east bound)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const username = Deno.env.get('OPENSKY_USERNAME') ?? '';
    const password = Deno.env.get('OPENSKY_PASSWORD') ?? '';

    const body = await req.json().catch(() => ({}));
    const { lamin, lomin, lamax, lomax } = body;

    const params = new URLSearchParams();
    if (lamin != null) params.set('lamin', String(lamin));
    if (lomin != null) params.set('lomin', String(lomin));
    if (lamax != null) params.set('lamax', String(lamax));
    if (lomax != null) params.set('lomax', String(lomax));

    const qs = params.toString();
    const url = `https://opensky-network.org/api/states/all${qs ? `?${qs}` : ''}`;

    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (username && password) {
      headers['Authorization'] = `Basic ${btoa(`${username}:${password}`)}`;
    }

    const resp = await fetch(url, { headers });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return jsonResponse(
        { error: `OpenSky returned ${resp.status}: ${text.slice(0, 200)}` },
        resp.status,
      );
    }

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      status: 200,
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
