import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const MAX_CREDITS = 166
const WINDOW_MS = 60 * 60 * 1000
const STALE_MS = 10 * 60 * 1000

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  console.log('[opensky-proxy] invoked', { method: req.method, url: req.url })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const username = Deno.env.get('OPENSKY_USERNAME')
    const password = Deno.env.get('OPENSKY_PASSWORD')

    console.log('[opensky-proxy] env', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
      hasUsername: !!username,
      hasPassword: !!password,
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

    const limitResult = await db
      .from('api_rate_limits')
      .select('requests')
      .eq('id', 'opensky')
      .single()

    console.log('[opensky-proxy] rate-limit read result', limitResult)

    const limitRow = limitResult.data
    const limitErr = limitResult.error

    if (limitErr) {
      throw new Error(`Rate-limit read failed: ${limitErr.message}`)
    }

    const recentTs: number[] = (Array.isArray(limitRow?.requests) ? limitRow.requests : [])
      .filter((t: unknown) => typeof t === 'number' && t > windowStart)

    console.log('[opensky-proxy] recentTs', recentTs.length)

    if (recentTs.length >= MAX_CREDITS) {
      const cachedResult = await db
        .from('aircraft_positions')
        .select('*')
        .gte('fetched_at', new Date(Date.now() - STALE_MS).toISOString())

      console.log('[opensky-proxy] cached result', cachedResult)

      if (cachedResult.error) {
        throw new Error(`Cached read failed: ${cachedResult.error.message}`)
      }

      return jsonResponse({
        rate_limited: true,
        credits_used: recentTs.length,
        credits_remaining: 0,
        cached: true,
        states: positionsToStates(cachedResult.data ?? []),
      })
    }

    recentTs.push(now)

    const updateResult = await db
      .from('api_rate_limits')
      .update({
        requests: recentTs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'opensky')

    console.log('[opensky-proxy] rate-limit update result', updateResult)

    if (updateResult.error) {
      throw new Error(`Rate-limit update failed: ${updateResult.error.message}`)
    }

    const body = await req.json().catch(() => ({}))
    const {
      lamin = 24,
      lomin = -130,
      lamax = 50,
      lomax = -65,
    } = body as Record<string, number>

    console.log('[opensky-proxy] bbox', { lamin, lomin, lamax, lomax })

    const params = new URLSearchParams({
      lamin: String(lamin),
      lomin: String(lomin),
      lamax: String(lamax),
      lomax: String(lomax),
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

    console.log('[opensky-proxy] opensky status', openSkyResp.status)

    if (!openSkyResp.ok) {
      const txt = await openSkyResp.text().catch(() => '')
      return jsonResponse(
        { error: `OpenSky returned ${openSkyResp.status}: ${txt.slice(0, 500)}` },
        openSkyResp.status,
      )
    }

    const openSkyData = await openSkyResp.json()
    const states: unknown[][] = Array.isArray(openSkyData?.states) ? openSkyData.states : []

    console.log('[opensky-proxy] states received', states.length)

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

    console.log('[opensky-proxy] positions prepared', positions.length)

    if (positions.length > 0) {
      const upsertResult = await db
        .from('aircraft_positions')
        .upsert(positions, { onConflict: 'icao24' })

      console.log('[opensky-proxy] upsert result', upsertResult)

      if (upsertResult.error) {
        throw new Error(`Aircraft upsert failed: ${upsertResult.error.message}`)
      }
    }

    const deleteResult = await db
      .from('aircraft_positions')
      .delete()
      .lt('fetched_at', new Date(now - STALE_MS).toISOString())

    console.log('[opensky-proxy] stale delete result', deleteResult)

    if (deleteResult.error) {
      throw new Error(`Stale cleanup failed: ${deleteResult.error.message}`)
    }

    return jsonResponse({
      states,
      time: openSkyData?.time ?? null,
      credits_used: recentTs.length,
      credits_remaining: MAX_CREDITS - recentTs.length,
      debug: {
        states_received: states.length,
        positions_upserted: positions.length,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[opensky-proxy] fatal', message)
    return jsonResponse({ error: message }, 500)
  }
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
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
