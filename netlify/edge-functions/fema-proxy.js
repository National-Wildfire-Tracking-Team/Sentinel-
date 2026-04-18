/**
 * Netlify Edge Function – proxy requests to FEMA IPAWS API.
 *
 * The FEMA IPAWS endpoint does not send CORS headers, so browser
 * requests fail with an access-control error. This edge function
 * makes a clean server-side request and forwards the response with
 * an explicit CORS header so the browser accepts it.
 */
export default async (request) => {
  const target = "https://apps.fema.gov/IPAWSOPEN_EAS_SERVICE/rest/feed";

  const resp = await fetch(target, {
    headers: { Accept: "application/atom+xml, application/xml, text/xml" },
  });

  return new Response(resp.body, {
    status: resp.status,
    headers: {
      "Content-Type": resp.headers.get("Content-Type") || "application/xml",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
