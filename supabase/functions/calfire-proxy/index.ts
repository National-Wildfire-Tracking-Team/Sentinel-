/**
 * calfire-proxy – Supabase Edge Function
 *
 * Proxies CAL FIRE incidents so the browser avoids CORS blocks.
 * Prefers /api/v1/incidents and falls back to legacy GeoJsonList.
 * No API key required (public feed).
 *
 * POST body (JSON): { inactive?: boolean }  — matches ?inactive= query on upstream
 * Or GET with ?inactive=true|false
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UPSTREAM_V1 =
  'https://incidents.fire.ca.gov/api/v1/incidents';
const UPSTREAM_LEGACY =
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
    const targets = [
      `${UPSTREAM_V1}?${new URLSearchParams({
        ...Object.fromEntries(params.entries()),
        includeInactive: inactive ? 'true' : 'false',
      }).toString()}`,
      `${UPSTREAM_LEGACY}?${params.toString()}`,
    ];

    let lastError = 'CAL FIRE upstream unavailable';
    for (const target of targets) {
      try {
        const resp = await fetch(target, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0)',
            Referer: 'https://incidents.fire.ca.gov/',
          },
        });
        const text = await resp.text();
        if (!resp.ok) {
          lastError = `Upstream ${target} failed (${resp.status})`;
          continue;
        }

        return new Response(text, {
          status: resp.status,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': resp.headers.get('Content-Type') || 'application/json',
          },
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return jsonResponse({ error: lastError }, 502);
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
