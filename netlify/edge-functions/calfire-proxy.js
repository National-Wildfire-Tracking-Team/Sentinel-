/**
 * Netlify Edge Function – proxy CAL FIRE IncidentApi (browser CORS bypass).
 */
export default async (request) => {
  const url = new URL(request.url);
  const inactive = url.searchParams.get('inactive') ?? 'false';
  const target = `https://incidents.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList?inactive=${inactive}`;

  const resp = await fetch(target, { headers: { Accept: 'application/json' } });

  return new Response(resp.body, {
    status: resp.status,
    headers: {
      'Content-Type': resp.headers.get('Content-Type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
