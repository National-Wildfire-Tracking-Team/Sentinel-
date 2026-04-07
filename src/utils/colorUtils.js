/**
 * colorUtils.js
 * Color scales and classification functions for all Sentinel data layers.
 */

// ─── Fire Radiative Power (FRP) – NASA FIRMS ─────────────────────────────────
/** Returns hex color for a given FRP value (MW) */
export function frpToColor(frp) {
  if (frp >= 500) return '#ff0000';   // Extreme
  if (frp >= 200) return '#ff4500';   // Very High
  if (frp >= 100) return '#ff8c00';   // High
  if (frp >= 50)  return '#ffaa00';   // Moderate
  if (frp >= 10)  return '#ffea00';   // Low
  return '#ffe066';                   // Very Low
}

/** Returns human-readable FRP intensity label */
export function frpToLabel(frp) {
  if (frp >= 500) return 'Extreme';
  if (frp >= 200) return 'Very High';
  if (frp >= 100) return 'High';
  if (frp >= 50)  return 'Moderate';
  if (frp >= 10)  return 'Low';
  return 'Very Low';
}

/** Mapbox GL expression for FRP-based circle color */
export const FRP_COLOR_EXPRESSION = [
  'interpolate', ['linear'], ['get', 'frp'],
  0,   '#ffe066',
  10,  '#ffea00',
  50,  '#ffaa00',
  100, '#ff8c00',
  200, '#ff4500',
  500, '#ff0000',
];

/** Mapbox GL expression for FRP-based circle radius */
export const FRP_RADIUS_EXPRESSION = [
  'interpolate', ['linear'], ['get', 'frp'],
  0,   4,
  50,  7,
  100, 10,
  200, 14,
  500, 20,
  1000, 28,
];

// ─── AQI – US EPA Standard Colors ────────────────────────────────────────────
/** AQI category definitions */
export const AQI_CATEGORIES = [
  { min: 0,   max: 50,  label: 'Good',              color: '#00e400', textColor: '#000000', bg: '#00e400' },
  { min: 51,  max: 100, label: 'Moderate',           color: '#ffff00', textColor: '#000000', bg: '#ffff00' },
  { min: 101, max: 150, label: 'Unhealthy for Sensitive Groups', color: '#ff7e00', textColor: '#000000', bg: '#ff7e00' },
  { min: 151, max: 200, label: 'Unhealthy',          color: '#ff0000', textColor: '#ffffff', bg: '#ff0000' },
  { min: 201, max: 300, label: 'Very Unhealthy',     color: '#8f3f97', textColor: '#ffffff', bg: '#8f3f97' },
  { min: 301, max: 500, label: 'Hazardous',          color: '#7e0023', textColor: '#ffffff', bg: '#7e0023' },
];

/** Returns the AQI category object for a given AQI value */
export function getAQICategory(aqi) {
  return AQI_CATEGORIES.find(c => aqi >= c.min && aqi <= c.max) || AQI_CATEGORIES[AQI_CATEGORIES.length - 1];
}

/** Returns hex color for a given AQI value */
export function aqiToColor(aqi) {
  return getAQICategory(aqi).color;
}

/** Mapbox GL step expression for AQI circle color */
export const AQI_COLOR_EXPRESSION = [
  'step', ['get', 'aqi'],
  '#00e400',  // 0-50: Good
  51,  '#ffff00',
  101, '#ff7e00',
  151, '#ff0000',
  201, '#8f3f97',
  301, '#7e0023',
];

/** Mapbox GL step expression for AQI circle radius */
export const AQI_RADIUS_EXPRESSION = [
  'step', ['get', 'aqi'],
  8,
  101, 10,
  201, 13,
  301, 16,
];

// ─── US Drought Monitor – USDM Color Scale ───────────────────────────────────
/** Drought Monitor category colors (official USDM palette) */
export const DROUGHT_CATEGORIES = [
  { dm: 0, label: 'Abnormally Dry (D0)',      color: '#ffff00', opacity: 0.45 },
  { dm: 1, label: 'Moderate Drought (D1)',    color: '#fcd37f', opacity: 0.50 },
  { dm: 2, label: 'Severe Drought (D2)',      color: '#ffaa00', opacity: 0.55 },
  { dm: 3, label: 'Extreme Drought (D3)',     color: '#e60000', opacity: 0.60 },
  { dm: 4, label: 'Exceptional Drought (D4)', color: '#730000', opacity: 0.65 },
];

export function droughtToColor(dm) {
  const cat = DROUGHT_CATEGORIES.find(c => c.dm === dm);
  return cat ? cat.color : '#888888';
}

/** Mapbox GL step expression for drought fill color */
export const DROUGHT_COLOR_EXPRESSION = [
  'step', ['get', 'DM'],
  '#ffff00',
  1, '#fcd37f',
  2, '#ffaa00',
  3, '#e60000',
  4, '#730000',
];

// ─── Fire Perimeter Colors ────────────────────────────────────────────────────
export const PERIMETER_COLORS = {
  fill: '#ff6600',
  fillOpacity: 0.18,
  outline: '#ff6600',
  outlineWidth: 2,
  selectedFill: '#ff9900',
  selectedOpacity: 0.30,
};

// ─── Containment ─────────────────────────────────────────────────────────────
/** Returns color for containment percentage (red → yellow → green) */
export function containmentToColor(pct) {
  if (pct >= 75) return '#22c55e';
  if (pct >= 50) return '#84cc16';
  if (pct >= 25) return '#f59e0b';
  return '#ef4444';
}

// ─── Weather Alert severity ───────────────────────────────────────────────────
export function alertTypeToColor(type) {
  if (type === 'Red Flag Warning')  return '#ef4444';
  if (type === 'Fire Weather Watch') return '#f59e0b';
  return '#3b82f6';
}
