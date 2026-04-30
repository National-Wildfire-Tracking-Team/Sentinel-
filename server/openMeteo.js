const OPEN_METEO =
  'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=temperature_2m,relativehumidity_2m,windspeed_10m,windgusts_10m,precipitation';

const FETCH_TIMEOUT_MS = 12_000;

export async function fetchHourlyForecast(lat, lon) {
  const url = OPEN_METEO.replace('{lat}', encodeURIComponent(lat)).replace(
    '{lon}',
    encodeURIComponent(lon),
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Open-Meteo HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
    }
    const data = await res.json();
    if (!data.hourly?.time?.length) {
      throw new Error('Open-Meteo response missing hourly data');
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}
