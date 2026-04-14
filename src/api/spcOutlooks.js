/**
 * spcOutlooks.js
 * Fetches SPC categorical convective outlook polygons (Day 1-3).
 */

import { fetchWithCache } from '../utils/dataCache';

const DAY_URLS = {
  day1: 'https://www.spc.noaa.gov/products/outlook/day1otlk_cat.json',
  day2: 'https://www.spc.noaa.gov/products/outlook/day2otlk_cat.json',
  day3: 'https://www.spc.noaa.gov/products/outlook/day3otlk_cat.json',
};

const RISK_LEVELS = ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'];

function detectRiskCategory(properties = {}) {
  const raw = [
    properties.riskCategory,
    properties.category,
    properties.CATEGORY,
    properties.LABEL,
    properties.label,
    properties.DN,
    properties.name,
  ]
    .filter(Boolean)
    .map((v) => String(v).toUpperCase())
    .join(' ');

  const matched = RISK_LEVELS.find((risk) => raw.includes(risk));
  if (matched) return matched;

  if (raw.includes('THUNDERSTORM')) return 'TSTM';
  if (raw.includes('MARGINAL')) return 'MRGL';
  if (raw.includes('SLIGHT')) return 'SLGT';
  if (raw.includes('ENHANCED')) return 'ENH';
  if (raw.includes('MODERATE')) return 'MDT';
  if (raw.includes('HIGH')) return 'HIGH';

  return 'TSTM';
}

function normalizeFeature(feature, dayLabel, idx) {
  const properties = feature?.properties || {};
  const riskCategory = detectRiskCategory(properties);

  return {
    ...feature,
    properties: {
      ...properties,
      id: properties.id || `${dayLabel}-${riskCategory}-${idx}`,
      day: dayLabel,
      riskCategory,
      outlookLabel: properties.LABEL || properties.label || properties.CATEGORY || riskCategory,
    },
  };
}

function ensureFeatureCollection(data, dayLabel) {
  if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
    return {
      ...data,
      features: data.features.map((f, idx) => normalizeFeature(f, dayLabel, idx)),
    };
  }

  return { type: 'FeatureCollection', features: [] };
}

export async function fetchSpcOutlookDay(dayLabel) {
  const url = DAY_URLS[dayLabel];
  if (!url) throw new Error(`Unsupported SPC outlook day: ${dayLabel}`);

  const data = await fetchWithCache(url, `spc:outlook:${dayLabel}`, {}, 5 * 60 * 1000);
  return ensureFeatureCollection(data, dayLabel);
}

export async function fetchSpcOutlooks() {
  const [day1, day2, day3] = await Promise.all([
    fetchSpcOutlookDay('day1'),
    fetchSpcOutlookDay('day2'),
    fetchSpcOutlookDay('day3'),
  ]);

  return {
    type: 'FeatureCollection',
    features: [...day1.features, ...day2.features, ...day3.features],
  };
}
