import http from 'node:http';
import { URL } from 'node:url';
import { fetchHourlyForecast } from './openMeteo.js';
import { fireRiskLevel, fireRiskScore } from './fireRisk.js';
import { cacheKey, getCache, setCache } from './cache.js';

const PORT = Number(process.env.PORT) || 3847;
const CACHE_TTL_MS = Number(process.env.FIRE_WEATHER_CACHE_TTL_MS) || 5 * 60 * 1000;

function parseCoord(name, value) {
  if (value == null || value === '') return { error: `Missing query parameter: ${name}` };
  const n = Number(value);
  if (!Number.isFinite(n)) return { error: `Invalid ${name}: must be a number` };
  return { value: n };
}

function hourlyRows(forecast) {
  const { time, temperature_2m, relativehumidity_2m, windspeed_10m, windgusts_10m, precipitation } =
    forecast.hourly;
  const n = time.length;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const t = temperature_2m?.[i];
    const rh = relativehumidity_2m?.[i];
    const ws = windspeed_10m?.[i];
    const wg = windgusts_10m?.[i];
    const pr = precipitation?.[i];
    const fire_risk_score = fireRiskScore({
      temperatureC: t,
      relativeHumidity: rh,
      windSpeedKmh: ws,
      precipitationMm: pr,
    });
    rows.push({
      time: time[i] ?? '',
      temperature: t ?? null,
      humidity: rh ?? null,
      wind_speed: ws ?? null,
      wind_gust: wg ?? null,
      precipitation: pr ?? null,
      fire_risk_score,
      fire_risk_level: fireRiskLevel(fire_risk_score),
    });
  }
  return rows;
}

function sliceNext24Hours(rows) {
  const now = Date.now();
  const cutoff = now + 24 * 60 * 60 * 1000;
  return rows.filter((r) => {
    const ts = Date.parse(r.time);
    if (Number.isNaN(ts)) return false;
    return ts >= now && ts <= cutoff;
  });
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

async function getForecastPayload(lat, lon) {
  const key = cacheKey(lat, lon);
  const cached = getCache(key);
  if (cached) return cached;

  const forecast = await fetchHourlyForecast(lat, lon);
  const hourly = hourlyRows(forecast);
  const payload = { location: { lat, lon }, hourly };
  setCache(key, payload, CACHE_TTL_MS);
  return payload;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  let url;
  try {
    url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch {
    json(res, 400, { error: 'Invalid URL' });
    return;
  }

  const { pathname } = url;

  if (pathname === '/health') {
    json(res, 200, { ok: true });
    return;
  }

  if (pathname !== '/api/fire-weather' && pathname !== '/api/fire-weather/max-24h') {
    json(res, 404, { error: 'Not found' });
    return;
  }

  const latResult = parseCoord('latitude', url.searchParams.get('latitude') ?? url.searchParams.get('lat'));
  const lonResult = parseCoord('longitude', url.searchParams.get('longitude') ?? url.searchParams.get('lon'));
  if (latResult.error) {
    json(res, 400, { error: latResult.error });
    return;
  }
  if (lonResult.error) {
    json(res, 400, { error: lonResult.error });
    return;
  }
  const lat = latResult.value;
  const lon = lonResult.value;
  if (lat < -90 || lat > 90) {
    json(res, 400, { error: 'latitude must be between -90 and 90' });
    return;
  }
  if (lon < -180 || lon > 180) {
    json(res, 400, { error: 'longitude must be between -180 and 180' });
    return;
  }

  try {
    const { location, hourly } = await getForecastPayload(lat, lon);

    if (pathname === '/api/fire-weather/max-24h') {
      const windowRows = sliceNext24Hours(hourly);
      if (windowRows.length === 0) {
        json(res, 200, {
          location,
          highest_fire_risk_next_24h: null,
          message: 'No hourly rows in the next 24 hours window',
        });
        return;
      }
      let best = windowRows[0];
      for (const row of windowRows) {
        if (row.fire_risk_score > best.fire_risk_score) best = row;
      }
      json(res, 200, {
        location,
        highest_fire_risk_next_24h: best,
      });
      return;
    }

    json(res, 200, { location, hourly });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const aborted = err instanceof Error && err.name === 'AbortError';
    json(res, aborted ? 504 : 502, { error: aborted ? 'Open-Meteo request timed out' : message });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Fire weather API listening on http://127.0.0.1:${PORT}`);
});
