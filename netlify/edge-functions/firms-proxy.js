/**
 * Netlify Edge Function – proxy requests to NASA FIRMS API.
 *
 * The FIRMS API rejects browser requests from Netlify deploy-preview
 * origins (CORS + 400).  This edge function makes a clean server-side
 * request with only the headers the API expects.
 */
export default async (request) => {
  const url = new URL(request.url);
  const firmsPath = url.pathname.replace(/^\/api\/firms/, '');
  const target = `https://firms.modaps.eosdis.nasa.gov${firmsPath}${url.search}`;

  const resp = await fetch(target, {
    headers: { Accept: 'application/json' },
  });

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: {
      'Content-Type': resp.headers.get('Content-Type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
