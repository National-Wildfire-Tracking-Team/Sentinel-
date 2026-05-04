/**
 * calfire-proxy – Supabase Edge Function
 *
 * Proxies CAL FIRE IncidentApi GeoJsonList so the browser avoids CORS blocks.
 * No API key required (public feed).
 *
 * POST body (JSON): { inactive?: boolean }  — matches ?inactive= query on upstream
 * Or GET with ?inactive=true|false
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UPSTREAM =
  'https://incidents.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    let inactive = false;
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      inactive = Boolean((body as { inactive?: boolean }).inactive);
    } else {
      const url = new URL(req.url);
      inactive = url.searchParams.get('inactive') === 'true';
    }

    const params = new URLSearchParams({
      inactive: inactive ? 'true' : 'false',
    });
    const target = `${UPSTREAM}?${params}`;
    const resp = await fetch(target, {
      headers: { Accept: 'application/json' },
    });
    const text = await resp.text();

    return new Response(text, {
      status: resp.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': resp.headers.get('Content-Type') || 'application/json',
      },
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
