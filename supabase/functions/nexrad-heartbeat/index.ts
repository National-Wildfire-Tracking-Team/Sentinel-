/**
 * nexrad-heartbeat – Supabase Edge Function
 *
 * Records that a NEXRAD radar site is currently being viewed, so the
 * ingestion cron (scripts/nexrad-radar-sync.mjs) only decodes live Level II
 * data for sites someone actually has open, instead of all ~208 sites.
 *
 * Called by the frontend (src/api/nexradScans.js) once when a radar site
 * panel opens, then every ~60s as a heartbeat while it stays open. Sites
 * with no heartbeat for ~15 minutes are treated as inactive by the sync
 * script and stop being refreshed.
 *
 * POST body (JSON): { site_id: "KTLX" }
 *
 * Writes are done here (service role) rather than via a public RLS insert
 * policy on nexrad_active_sites, matching this repo's practice of routing
 * anonymous writes through a validating edge function rather than opening a
 * table directly to anonymous inserts (see fire_reports RLS history).
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// NEXRAD/WSR-88D site identifiers are always 4-letter ICAO-style codes
// (e.g. KTLX, KMLB, PHKI). This is a cheap sanity check, not a maintained
// allow-list — see plan notes: keeping a static list of ~208 codes in sync
// with api.weather.gov/radar/stations is more maintenance burden than the
// cost of a bogus code (one wasted, empty S3 listing in the sync script).
const SITE_ID_RE = /^[A-Z]{4}$/;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: 'Supabase service credentials are not configured.' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const siteId = String(body?.site_id ?? '').trim().toUpperCase();

    if (!SITE_ID_RE.test(siteId)) {
      return jsonResponse({ error: 'site_id must be a 4-letter radar site identifier.' }, 400);
    }

    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/nexrad_active_sites?on_conflict=site_id`,
      {
        method: 'POST',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        // first_seen_at is intentionally omitted so merge-duplicates leaves
        // it untouched on repeat heartbeats for the same site.
        body: JSON.stringify({ site_id: siteId, last_seen_at: new Date().toISOString() }),
      },
    );

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return jsonResponse({ error: `Heartbeat upsert failed: ${resp.status} ${errText.slice(0, 200)}` }, 502);
    }

    return jsonResponse({ ok: true, site_id: siteId });
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
