/**
 * Netlify Edge Function – proxy CAL FIRE incidents (browser CORS bypass).
 * Prefers /api/v1/incidents and falls back to legacy GeoJsonList.
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
  const preferred = url.searchParams.get('upstream')?.toLowerCase() === 'legacy' ? 'legacy' : 'v1';
  const v1Target =
    `https://incidents.fire.ca.gov/api/v1/incidents?inactive=${inactive}` +
    `&includeInactive=${inactive}`;
  const legacyTarget =
    `https://incidents.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList?inactive=${inactive}`;
  const targets = preferred === 'legacy' ? [legacyTarget, v1Target] : [v1Target, legacyTarget];

  try {
    let lastError = null;
    for (const target of targets) {
      try {
        const resp = await fetch(target, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0)',
            Referer: 'https://incidents.fire.ca.gov/',
          },
        });

        const body = await resp.text();
        if (!resp.ok) {
          lastError = `Upstream ${target} failed (${resp.status})`;
          continue;
        }

        return new Response(body, {
          status: resp.status,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': resp.headers.get('Content-Type') || 'application/json',
          },
        });
      } catch (err) {
        lastError = err?.message || String(err);
      }
    }

    return new Response(JSON.stringify({ error: lastError || 'CAL FIRE upstream unavailable' }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
};
