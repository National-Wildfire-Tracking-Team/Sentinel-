/**
 * opensky-proxy – Supabase Edge Function
 *
 * 1. Reads OPENSKY_USERNAME / OPENSKY_PASSWORD from Supabase Vault secrets.
 * 2. Enforces a server-side sliding-window rate limit of 166 requests / hour
 *    persisted in the api_rate_limits table (works across all instances).
 * 3. Fetches aircraft state vectors from OpenSky Network.
 * 4. Upserts results into the aircraft_positions table so the frontend reads
 *    directly from Supabase (realtime-capable) instead of hitting OpenSky.
 * 5. Cleans up positions not refreshed in the last 10 minutes (left the bbox).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_CREDITS = 166;
const WINDOW_MS   = 60 * 60 * 1000; // 1 hour
const STALE_MS    = 10 * 60 * 1000; // 10 minutes – remove aircraft outside bbox

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // ── Supabase admin client (service role for DB writes) ──────────────────
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // ── Server-side rate limit (sliding window, DB-persisted) ───────────────
    const now         = Date.now();
    const windowStart = now - WINDOW_MS;

    const { data: limitRow, error: limitErr } = await db
      .from('api_rate_limits')
      .select('requests')
      .eq('id', 'opensky')
      .single();

    if (limitErr) throw new Error(`Rate-limit read failed: ${limitErr.message}`);

    // Prune timestamps outside the current window
    const recentTs: number[] = ((limitRow?.requests as number[]) ?? [])
      .filter((t: number) => t > windowStart);

    if (recentTs.length >= MAX_CREDITS) {
      // Return cached data from the table rather than a blank error
      const { data: cached } = await db
        .from('aircraft_positions')
        .select('*')
        .gte('fetched_at', new Date(Date.now() - STALE_MS).toISOString());

      return jsonResponse({
        rate_limited: true,
        credits_used: recentTs.length,
        credits_remaining: 0,
        cached: true,
        states: positionsToStates(cached ?? []),
      }, 200); // 200 so client still renders the cached data
    }

    // Reserve a slot before the network call
    recentTs.push(now);
    await db.from('api_rate_limits').update({
      requests:   recentTs,
      updated_at: new Date().toISOString(),
    }).eq('id', 'opensky');

    // ── OpenSky credentials from Vault secrets ───────────────────────────────
    const username = Deno.env.get('OPENSKY_USERNAME') ?? '';
    const password = Deno.env.get('OPENSKY_PASSWORD') ?? '';

    // ── Parse bounding box from request body ────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const {
      lamin = 24, lomin = -130,
      lamax = 50, lomax = -65,
    } = body as Record<string, number>;

    const params = new URLSearchParams({
      lamin: String(lamin),
      lomin: String(lomin),
      lamax: String(lamax),
      lomax: String(lomax),
    });

    const fetchHeaders: Record<string, string> = { Accept: 'application/json' };
    if (username && password) {
      fetchHeaders['Authorization'] = `Basic ${btoa(`${username}:${password}`)}`;
    }

    const openSkyResp = await fetch(
      `https://opensky-network.org/api/states/all?${params}`,
      { headers: fetchHeaders },
    );

    if (!openSkyResp.ok) {
      const txt = await openSkyResp.text().catch(() => '');
      return jsonResponse(
        { error: `OpenSky returned ${openSkyResp.status}: ${txt.slice(0, 200)}` },
        openSkyResp.status,
      );
    }

    const openSkyData = await openSkyResp.json();
    const states: unknown[][] = openSkyData?.states ?? [];

    // ── Upsert aircraft positions ────────────────────────────────────────────
    const fetchedAt = new Date().toISOString();
    const positions = states
      .filter((s) => s[5] != null && s[6] != null)
      .map((s) => ({
        icao24:         s[0] as string,
        callsign:       ((s[1] as string) ?? '').trim() || (s[0] as string),
        origin_country: s[2] as string,
        longitude:      s[5] as number,
        latitude:       s[6] as number,
        baro_altitude:  s[7] as number | null,
        on_ground:      s[8] as boolean,
        velocity:       s[9] as number | null,
        true_track:     (s[10] as number) ?? 0,
        vertical_rate:  s[11] as number | null,
        squawk:         (s[14] as string) ?? '',
        category:       s[17] as number | null,
        fetched_at:     fetchedAt,
      }));

    if (positions.length > 0) {
      const { error: upsertErr } = await db
        .from('aircraft_positions')
        .upsert(positions, { onConflict: 'icao24' });
      if (upsertErr) console.error('[opensky-proxy] upsert error:', upsertErr.message);
    }

    // Remove stale aircraft (no longer in bbox or not responding)
    await db
      .from('aircraft_positions')
      .delete()
      .lt('fetched_at', new Date(now - STALE_MS).toISOString());

    // ── Return response (same shape existing client expects) ─────────────────
    return jsonResponse({
      states:            openSkyData.states,
      time:              openSkyData.time,
      credits_used:      recentTs.length,
      credits_remaining: MAX_CREDITS - recentTs.length,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Re-pack DB rows back into OpenSky state-vector array shape so the existing
 *  statesToGeoJSON helper on the client can process cached data. */
function positionsToStates(rows: Record<string, unknown>[]): unknown[][] {
  return rows.map((r) => [
    r.icao24,         // [0]  icao24
    r.callsign,       // [1]  callsign
    r.origin_country, // [2]  origin_country
    null,             // [3]  time_position
    null,             // [4]  last_contact
    r.longitude,      // [5]  longitude
    r.latitude,       // [6]  latitude
    r.baro_altitude,  // [7]  baro_altitude
    r.on_ground,      // [8]  on_ground
    r.velocity,       // [9]  velocity
    r.true_track,     // [10] true_track
    r.vertical_rate,  // [11] vertical_rate
    null,             // [12] sensors
    null,             // [13] geo_altitude
    r.squawk,         // [14] squawk
    null,             // [15] spi
    null,             // [16] position_source
    r.category,       // [17] category
  ]);
}
