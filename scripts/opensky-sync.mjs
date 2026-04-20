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

const STALE_MS = 10 * 60 * 1000;

async function main() {
  console.log('[opensky-sync] starting');
  console.log('[opensky-sync] supabase url:', SUPABASE_URL);

  const params = new URLSearchParams({
    lamin: '24',
    lomin: '-130',
    lamax: '50',
    lomax: '-65',
  });

  const openskyUrl = `https://opensky-network.org/api/states/all?${params.toString()}`;
  console.log('[opensky-sync] requesting:', openskyUrl);

  const openskyResp = await fetch(openskyUrl, {
    headers: {
      Accept: 'application/json',
      Authorization:
        'Basic ' +
        Buffer.from(`${OPENSKY_USERNAME}:${OPENSKY_PASSWORD}`).toString('base64'),
    },
  });

  console.log('[opensky-sync] opensky status:', openskyResp.status, openskyResp.statusText);

  if (!openskyResp.ok) {
    const txt = await openskyResp.text().catch(() => '');
    throw new Error(`OpenSky returned ${openskyResp.status}: ${txt.slice(0, 500)}`);
  }

  const openSkyData = await openskyResp.json();
  const states = Array.isArray(openSkyData?.states) ? openSkyData.states : [];
  const fetchedAt = new Date().toISOString();

  console.log('[opensky-sync] states received:', states.length);

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
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(positions),
      }
    );

    const upsertText = await upsertResp.text().catch(() => '');
    console.log('[opensky-sync] upsert status:', upsertResp.status, upsertResp.statusText);
    console.log('[opensky-sync] upsert response preview:', upsertText.slice(0, 500));

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

  const deleteText = await deleteResp.text().catch(() => '');
  console.log('[opensky-sync] delete status:', deleteResp.status, deleteResp.statusText);
  console.log('[opensky-sync] delete response preview:', deleteText.slice(0, 500));

  if (!deleteResp.ok) {
    throw new Error(`Supabase delete failed ${deleteResp.status}: ${deleteText.slice(0, 500)}`);
  }

  const countResp = await fetch(
    `${SUPABASE_URL}/rest/v1/aircraft_positions?select=icao24`,
    {
      method: 'GET',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'count=exact',
      },
    }
  );

  console.log('[opensky-sync] count status:', countResp.status, countResp.statusText);
  console.log('[opensky-sync] content-range:', countResp.headers.get('content-range'));

  const countText = await countResp.text().catch(() => '');
  console.log('[opensky-sync] count response preview:', countText.slice(0, 500));

  console.log('[opensky-sync] done');
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