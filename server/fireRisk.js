/**
 * Fire weather risk index (0–100) from normalized inputs.
 * Formula: (temp * 0.3) + ((100 - humidity) * 0.3) + (wind * 0.2) + (dryness * 0.2)
 * Each term is on a 0–100 scale before weighting.
 */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Map °C roughly from cold/wet to hot/dry fire-relevant range → 0–100 */
export function normalizeTemperature(celsius) {
  if (celsius == null || Number.isNaN(celsius)) return 0;
  const t = Number(celsius);
  return clamp(((t + 5) / 50) * 100, 0, 100);
}

/** Relative humidity 0–100; contribution uses (100 - RH) */
export function lowHumidityContribution(relativeHumidity) {
  if (relativeHumidity == null || Number.isNaN(relativeHumidity)) return 50;
  const rh = clamp(Number(relativeHumidity), 0, 100);
  return 100 - rh;
}

/** Wind speed (km/h from Open-Meteo) → 0–100 */
export function normalizeWindSpeedKmh(windKmh) {
  if (windKmh == null || Number.isNaN(windKmh)) return 0;
  return clamp((Number(windKmh) / 80) * 100, 0, 100);
}

/**
 * Dryness from precipitation (mm): no rain → high dryness; rain reduces it.
 */
export function drynessFromPrecipitation(mm) {
  if (mm == null || Number.isNaN(mm)) return 80;
  const p = Math.max(0, Number(mm));
  if (p === 0) return 100;
  return clamp(100 - Math.min(p * 30, 100), 0, 100);
}

export function fireRiskScore({ temperatureC, relativeHumidity, windSpeedKmh, precipitationMm }) {
  const temp = normalizeTemperature(temperatureC);
  const humPart = lowHumidityContribution(relativeHumidity);
  const wind = normalizeWindSpeedKmh(windSpeedKmh);
  const dryness = drynessFromPrecipitation(precipitationMm);
  const raw = temp * 0.3 + humPart * 0.3 + wind * 0.2 + dryness * 0.2;
  return clamp(Math.round(raw * 10) / 10, 0, 100);
}

export function fireRiskLevel(score) {
  if (score < 25) return 'Low';
  if (score < 50) return 'Moderate';
  if (score < 75) return 'High';
  return 'Extreme';
}
