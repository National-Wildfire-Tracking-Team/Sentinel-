const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENSKY_USERNAME = process.env.OPENSKY_USERNAME;
const OPENSKY_PASSWORD = process.env.OPENSKY_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars');
}
if (!OPENSKY_USERNAME || !OPENSKY_PASSWORD) {
  throw new Error('Missing OpenSky credentials');
}

const STALE_MS = 3 * 60 * 60 * 1000;

// Split the US into a few large regions so each OpenSky request is smaller.
const REGIONS = [
  { name: 'west',    lamin: 31, lomin: -125, lamax: 49, lomax: -108 },
  { name: 'central', lamin: 28, lomin: -108, lamax: 49, lomax: -92 },
  { name: 'south',   lamin: 24, lomin: -106, lamax: 37, lomax: -80 },
  { name: 'east',    lamin: 36, lomin: -92,  lamax: 48, lomax: -66 },
];

async function main() {
  console.log('[opensky-sync] starting');
  console.log('[opensky-sync] supabase url:', SUPABASE_URL);

  const allStates = [];
  const seen = new Set();

  for (const region of REGIONS) {
    const states = await fetchRegion(region);
    console.log(`[opensky-sync] region ${region.name}: ${states.length} states`);

    for (const s of states) {
      const icao24 = String(s?.[0] ?? '').trim();
      if (!icao24 || seen.has(icao24)) continue;
      seen.add(icao24);
      allStates.push(s);
    }
  }

  console.log('[opensky-sync] total deduped states:', allStates.length);

  const fetchedAt = new Date().toISOString();

  const positions = allStates
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
    .filter((row) => row.icao24 && row.longitude != null && row.latitude != null);

  console.log('[opensky-sync] positions prepared:', positions.length);

  if (positions.length > 0) {
    const upsertResp = await fetch(
      `${SUPABASE_URL}/rest/v1/aircraft_positions?on_conflict=icao24`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(positions),
      }
    );

    const upsertText = await upsertResp.text().catch(() => '');
    console.log('[opensky-sync] upsert status:', upsertResp.status, upsertResp.statusText);

    if (!upsertResp.ok) {
      throw new Error(`Supabase upsert failed ${upsertResp.status}: ${upsertText.slice(0, 500)}`);
    }
  } else {
    console.log('[opensky-sync] no positions to upsert');
  }

  const staleIso = new Date(Date.now() - STALE_MS).toISOString();
  const deleteResp = await fetch(
    `${SUPABASE_URL}/rest/v1/aircraft_positions?fetched_at=lt.${encodeURIComponent(staleIso)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  if (!deleteResp.ok) {
    const deleteText = await deleteResp.text().catch(() => '');
    throw new Error(`Supabase delete failed ${deleteResp.status}: ${deleteText.slice(0, 500)}`);
  }

  console.log('[opensky-sync] done');
}

async function fetchRegion(region) {
  const params = new URLSearchParams({
    lamin: String(region.lamin),
    lomin: String(region.lomin),
    lamax: String(region.lamax),
    lomax: String(region.lomax),
  });

  const openskyUrl = `https://opensky-network.org/api/states/all?${params.toString()}`;
  console.log(`[opensky-sync] requesting region ${region.name}: ${openskyUrl}`);

  const resp = await fetchWithRetry(openskyUrl, {
    headers: {
      Accept: 'application/json',
      Authorization:
        'Basic ' +
        Buffer.from(`${OPENSKY_USERNAME}:${OPENSKY_PASSWORD}`).toString('base64'),
    },
  });

  console.log('[opensky-sync] opensky status:', resp.status, resp.statusText, `for ${region.name}`);

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`OpenSky returned ${resp.status} for ${region.name}: ${txt.slice(0, 500)}`);
  }

  const json = await resp.json();
  return Array.isArray(json?.states) ? json.states : [];
}

async function fetchWithRetry(url, options, maxAttempts = 4) {
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const timeoutMs = 30000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`[opensky-sync] fetch attempt ${attempt}/${maxAttempts}`);
      const resp = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return resp;
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;
      console.warn(`[opensky-sync] fetch attempt ${attempt} failed:`, err?.message || err);

      if (attempt < maxAttempts) {
        const backoffMs = attempt * 15000;
        console.log(`[opensky-sync] waiting ${backoffMs}ms before retry`);
        await sleep(backoffMs);
      }
    }
  }

  throw lastErr;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNullableNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNullableInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

main().catch((err) => {
  console.error('[opensky-sync] fatal:', err);
  process.exit(1);
});