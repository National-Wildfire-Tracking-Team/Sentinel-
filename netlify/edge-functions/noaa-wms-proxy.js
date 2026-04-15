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
  const target = `https://nomads.ncep.noaa.gov${nomadsPath}${url.search}`;

  const upstream = await fetch(target, {
    headers: {
      Accept: 'image/png,application/xml,text/xml,*/*',
      'User-Agent': 'Sentinel-FireWeather-Layer/1.0',
    },
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'image/png',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
