/**
 * radar-proxy.js — Netlify Edge Function
 * Proxies /api/radar-svc/* requests to the external Python radar service.
 *
 * Set the environment variable RADAR_SERVICE_URL in Netlify to the base URL
 * of your deployed Python radar service, e.g.:
 *   https://radar.your-domain.com
 *
 * If RADAR_SERVICE_URL is not set, the edge function returns 503 and the
 * frontend automatically falls back to the Iowa Environmental Mesonet WMS.
 */

export default async function radarProxy(request, context) {
  const radarBase = Deno.env.get('RADAR_SERVICE_URL');

  if (!radarBase) {
    return new Response(
      JSON.stringify({ error: 'RADAR_SERVICE_URL not configured' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }
    );
  }

  // Strip the edge-function prefix, forward the rest to the Python service
  const url = new URL(request.url);
  const upstreamPath = url.pathname.replace(/^\/api\/radar-svc/, '/api/radar');
  const upstreamUrl = `${radarBase.replace(/\/$/, '')}${upstreamPath}${url.search}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: {
        'Accept': request.headers.get('Accept') || '*/*',
        'User-Agent': 'Sentinel-Netlify-Edge/1.0',
      },
    });

    // Pass through the response, adding CORS headers for the browser
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET');
    // Tile images: cache 2 min; metadata: no-store
    if (url.pathname.includes('/tiles/')) {
      responseHeaders.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=60');
    } else {
      responseHeaders.set('Cache-Control', 'no-store');
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Radar service unreachable', detail: err.message }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }
    );
  }
}

export const config = { path: '/api/radar-svc/*' };
