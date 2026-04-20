export async function handler(event) {
  try {
    const username = process.env.OPENSKY_USERNAME;
    const password = process.env.OPENSKY_PASSWORD;

    if (!username || !password) {
      return json(500, { error: 'Missing OpenSky credentials' });
    }

    const params =
      event.httpMethod === 'POST'
        ? JSON.parse(event.body || '{}')
        : event.queryStringParameters || {};

    const lamin = clamp(Number(params.lamin), -90, 90);
    const lomin = clamp(Number(params.lomin), -180, 180);
    const lamax = clamp(Number(params.lamax), -90, 90);
    const lomax = clamp(Number(params.lomax), -180, 180);

    if (![lamin, lomin, lamax, lomax].every(Number.isFinite)) {
      return json(400, { error: 'Invalid bbox params' });
    }

    if (lamin >= lamax || lomin >= lomax) {
      return json(400, { error: 'Invalid bbox ordering' });
    }

    const search = new URLSearchParams({
      lamin: String(lamin),
      lomin: String(lomin),
      lamax: String(lamax),
      lomax: String(lomax),
    });

    const resp = await fetchWithRetry(
      `https://opensky-network.org/api/states/all?${search.toString()}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization:
            'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        },
      },
      3
    );

    const text = await resp.text();

    if (!resp.ok) {
      return json(resp.status, {
        error: `OpenSky returned ${resp.status}`,
        body: text.slice(0, 500),
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json(500, { error: 'OpenSky returned invalid JSON' });
    }

    const states = Array.isArray(parsed?.states) ? parsed.states : [];

    const geoJSON = {
      type: 'FeatureCollection',
      features: states
        .filter((s) => Array.isArray(s) && s[5] != null && s[6] != null && !s[8])
        .map((s) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [Number(s[5]), Number(s[6])],
          },
          properties: {
            icao24: String(s[0] ?? ''),
            callsign: String(s[1] ?? '').trim() || String(s[0] ?? ''),
            origin_country: String(s[2] ?? ''),
            baro_altitude: toNullableNumber(s[7]),
            on_ground: Boolean(s[8]),
            velocity: toNullableNumber(s[9]),
            true_track: toNullableNumber(s[10]) ?? 0,
            vertical_rate: toNullableNumber(s[11]),
            squawk: String(s[14] ?? ''),
            category: toNullableInteger(s[17]),
          },
        })),
    };

    return json(200, {
      ok: true,
      count: geoJSON.features.length,
      geoJSON,
    });
  } catch (err) {
    return json(500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function fetchWithRetry(url, options, maxAttempts = 3) {
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const resp = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return resp;
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;
      if (attempt < maxAttempts) {
        await sleep(attempt * 3000);
      }
    }
  }

  throw lastErr;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(n, min, max) {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : NaN;
}

function toNullableNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNullableInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}