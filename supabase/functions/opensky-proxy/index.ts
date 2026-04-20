/**
 * opensky-proxy – Supabase Edge Function
 *
 * Debug-friendly version:
 * - logs invocation + key checkpoints
 * - supports GET and POST bbox input
 * - checks DB mutation errors
 * - returns useful debug metadata
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const MAX_CREDITS = 166
const WINDOW_MS = 60 * 60 * 1000
const STALE_MS = 10 * 60 * 1000

type BBox = {
  lamin: number
  lomin: number
  lamax: number
  lomax: number
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  console.log('[opensky-proxy] invoked', {
    method: req.method,
    url: req.url,
  })

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const username = Deno.env.get('OPENSKY_USERNAME')
    const password = Deno.env.get('OPENSKY_PASSWORD')

    console.log('[opensky-proxy] env check', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
      hasOpenSkyUsername: !!username,
      hasOpenSkyPassword: !!password,
    })

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase environment variables')
    }

    if (!username || !password) {
      throw new Error('Missing OpenSky credentials')
    }

    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const now = Date.now()
    const windowStart = now - WINDOW_MS

    const { data: limitRow, error: limitErr } = await db
      .from('api_rate_limits')
      .select('requests')
      .eq('id', 'opensky')
      .single()

    if (limitErr) {
      throw new Error(`Rate-limit read failed: ${limitErr.message}`)
    }

    const recentTs: number[] = (Array.isArray(limitRow?.requests) ? limitRow.requests : [])
      .filter((t: unknown) => typeof t === 'number' && t > windowStart)

    console.log('[opensky-proxy] rate limit status', {
      usedInWindow: recentTs.length,
      maxCredits: MAX_CREDITS,
    })

    if (recentTs.length >= MAX_CREDITS) {
      const { data: cached, error: cachedErr } = await db
        .from('aircraft_positions')
        .select('*')
        .gte('fetched_at', new Date(Date.now() - STALE_MS).toISOString())

      if (cachedErr) {
        throw new Error(`Cached data read failed: ${cachedErr.message}`)
      }

      console.log('[opensky-proxy] rate limited; returning cached rows', {
        cachedRows: cached?.length ?? 0,
      })

      return jsonResponse({
        rate_limited: true,
        credits_used: recentTs.length,
        credits_remaining: 0,
        cached: true,
        states: positionsToStates(cached ?? []),
        debug: {
          cached_rows: cached?.length ?? 0,
        },
      })
    }

    recentTs.push(now)

    const { error: limitUpdateErr } = await db
      .from('api_rate_limits')
      .update({
        requests: recentTs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'opensky')

    if (limitUpdateErr) {
      throw new Error(`Rate-limit update failed: ${limitUpdateErr.message}`)
    }

    const bbox = await parseBoundingBox(req)
    console.log('[opensky-proxy] bbox', bbox)

    const params = new URLSearchParams({
      lamin: String(bbox.lamin),
      lomin: String(bbox.lomin),
      lamax: String(bbox.lamax),
      lomax: String(bbox.lomax),
    })

    const openSkyResp = await fetch(
      `https://opensky-network.org/api/states/all?${params.toString()}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
        },
      },
    )

    console.log('[opensky-proxy] opensky response', {
      status: openSkyResp.status,
      ok: openSkyResp.ok,
    })

    if (!openSkyResp.ok) {
      const txt = await openSkyResp.text().catch(() => '')
      return jsonResponse(
        {
          error: `OpenSky returned ${openSkyResp.status}: ${txt.slice(0, 500)}`,
          debug: {
            status: openSkyResp.status,
            bbox,
          },
        },
        openSkyResp.status,
      )
    }

    const openSkyData = await openSkyResp.json()
    const states: unknown[][] = Array.isArray(openSkyData?.states) ? openSkyData.states : []

    console.log('[opensky-proxy] opensky payload', {
      statesReceived: states.length,
      time: openSkyData?.time ?? null,
    })

    const fetchedAt = new Date().toISOString()

    const positions = states
      .filter((s) => Array.isArray(s) && s[5] != null && s[6] != null)
      .map((s) => ({
        icao24: String(s[0] ?? ''),
        callsign: String(s[1] ?? '').trim() || String(s[0] ?? ''),
        origin_country: String(s[2] ?? ''),
        longitude: toNullableNumber(s[5]),
        latitude: toNullableNumber(s[6]),
        baro_altitude: toNullableNumber(s[7]),
        on_ground: Boolean(s[8]),
        velocity: toNullableNumber(s[9]),
        true_track: toNullableNumber(s[10]) ?? 0,
        vertical_rate: toNullableNumber(s[11]),
        squawk: String(s[14] ?? ''),
        category: toNullableInteger(s[17]),
        fetched_at: fetchedAt,
      }))
      .filter((row) => row.icao24 && row.longitude != null && row.latitude != null)

    console.log('[opensky-proxy] transformed positions', {
      positionsUpserted: positions.length,
    })

    if (positions.length > 0) {
      const { error: upsertErr } = await db
        .from('aircraft_positions')
        .upsert(positions, { onConflict: 'icao24' })

      if (upsertErr) {
        throw new Error(`Aircraft upsert failed: ${upsertErr.message}`)
      }
    }

    const { error: deleteErr } = await db
      .from('aircraft_positions')
      .delete()
      .lt('fetched_at', new Date(now - STALE_MS).toISOString())

    if (deleteErr) {
      throw new Error(`Stale cleanup failed: ${deleteErr.message}`)
    }

    const { count: currentCount, error: countErr } = await db
      .from('aircraft_positions')
      .select('*', { count: 'exact', head: true })

    if (countErr) {
      console.warn('[opensky-proxy] count warning', countErr.message)
    }

    return jsonResponse({
      states,
      time: openSkyData?.time ?? null,
      credits_used: recentTs.length,
      credits_remaining: MAX_CREDITS - recentTs.length,
      debug: {
        bbox,
        states_received: states.length,
        positions_upserted: positions.length,
        aircraft_positions_count: currentCount ?? null,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[opensky-proxy] fatal error', message)

    return jsonResponse(
      {
        error: message,
      },
      500,
    )
  }
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

async function parseBoundingBox(req: Request): Promise<BBox> {
  const defaults: BBox = {
    lamin: 24,
    lomin: -130,
    lamax: 50,
    lomax: -65,
  }

  try {
    const url = new URL(req.url)

    const queryBox = {
      lamin: Number(url.searchParams.get('lamin')),
      lomin: Number(url.searchParams.get('lomin')),
      lamax: Number(url.searchParams.get('lamax')),
      lomax: Number(url.searchParams.get('lomax')),
    }

    const hasAllQueryParams = Object.values(queryBox).every((v) => !Number.isNaN(v))
    if (hasAllQueryParams) {
      return queryBox as BBox
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      return {
        lamin: safeNumber((body as Record<string, unknown>).lamin, defaults.lamin),
        lomin: safeNumber((body as Record<string, unknown>).lomin, defaults.lomin),
        lamax: safeNumber((body as Record<string, unknown>).lamax, defaults.lamax),
        lomax: safeNumber((body as Record<string, unknown>).lomax, defaults.lomax),
      }
    }

    return defaults
  } catch {
    return defaults
  }
}

function safeNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toNullableNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toNullableInteger(value: unknown): number | null {
  const n = Number(value)
  return Number.isInteger(n) ? n : null
}

function positionsToStates(rows: Record<string, unknown>[]): unknown[][] {
  return rows.map((r) => [
    r.icao24,
    r.callsign,
    r.origin_country,
    null,
    null,
    r.longitude,
    r.latitude,
    r.baro_altitude,
    r.on_ground,
    r.velocity,
    r.true_track,
    r.vertical_rate,
    null,
    null,
    r.squawk,
    null,
    null,
    r.category,
  ])
}
