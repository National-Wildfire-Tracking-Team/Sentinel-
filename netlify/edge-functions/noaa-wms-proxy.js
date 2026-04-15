/**
 * Netlify Edge Function – proxy requests to NOAA NOMADS WMS.
 *
 * Browser tile requests to NOMADS often fail CORS checks. This function
 * performs the server-side request and returns image payloads with permissive
 * CORS headers so raster tiles can render in browser map clients.
 */
export default async (request) => {
  const url = new URL(request.url);
  const nomadsPath = url.pathname.replace(/^\/api\/noaa-wms/, '');
  let target = `https://nomads.ncep.noaa.gov${nomadsPath}${url.search}`;
  const headers = {
    Accept: 'image/png,application/xml,text/xml,*/*',
    'User-Agent': 'Sentinel-FireWeather-Layer/1.0',
  };

  // Explicitly resolve redirect chains server-side so the browser never sees
  // a 30x tile response (Mapbox treats those as load errors for raster tiles).
  let upstream = null;
  for (let i = 0; i < 5; i += 1) {
    upstream = await fetch(target, { redirect: 'manual', headers });
    if (upstream.status < 300 || upstream.status >= 400) break;

    const location = upstream.headers.get('Location');
    if (!location) break;
    target = new URL(location, target).toString();
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'image/png',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
