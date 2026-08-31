/**
 * wpcQpf.js
 * Fetches NOAA Weather Prediction Center Quantitative Precipitation Forecast
 * (QPF) 24-hour isopleth-band polygons (Day 1-3) from the public ArcGIS REST
 * endpoint: https://mapservices.weather.noaa.gov/vector/rest/services/precip/wpc_qpf/MapServer
 *
 * Each polygon carries a numeric `qpf` field (forecast precipitation, inches)
 * — a nested-contour isopleth band, not a discrete category — so it's
 * rendered with a continuous ['interpolate'] over QPF_RAMP_STOPS.
 *
 * The stops match the standard NWS/GEMPAK QPF color table (sampled from
 * weatherwise.app's WPC QPF outlook legend), not a single-hue ramp: pale
 * green -> green -> blue -> cyan -> purple -> magenta -> red -> orange-red
 * as forecast amount increases, so it reads the same way meteorologists
 * already expect from other QPF products.
 */

import { fetchWpcLayer } from './wpcShared';

const MAPSERVER_BASE =
  'https://mapservices.weather.noaa.gov/vector/rest/services/precip/wpc_qpf/MapServer';

// Map day -> MapServer layer ID (24-hour QPF sublayers)
export const QPF_LAYER_ID_MAP = {
  day1: 1,
  day2: 2,
  day3: 3,
};

export const QPF_DAYS = [
  { key: 'day1', label: 'Day 1' },
  { key: 'day2', label: 'Day 2' },
  { key: 'day3', label: 'Day 3' },
];

// Standard NWS/GEMPAK QPF color table (inches -> hex).
export const QPF_RAMP_STOPS = [
  [0.0, '#7fff00'],
  [0.1, '#00cd00'],
  [0.3, '#008b00'],
  [0.5, '#104e8b'],
  [0.8, '#1e90ff'],
  [1.0, '#00b2ee'],
  [1.3, '#00eeee'],
  [1.5, '#8968cd'],
  [1.8, '#912cee'],
  [2.0, '#8b008b'],
  [2.5, '#8b0000'],
  [3.0, '#cd0000'],
  [4.0, '#ee4000'],
];

function normalizeFeature(feature, dayLabel, idx) {
  const properties = feature?.properties || {};
  const qpf = Number(properties.qpf);

  return {
    ...feature,
    properties: {
      ...properties,
      id: properties.objectid != null
        ? `wpc-qpf-${dayLabel}-${properties.objectid}`
        : `wpc-qpf-${dayLabel}-${idx}`,
      day: dayLabel,
      qpf: Number.isFinite(qpf) ? qpf : null,
      units: properties.units || 'Inches',
      validTime: properties.valid_time || null,
      issueTime: properties.issue_time || null,
      startTime: properties.start_time || null,
      endTime:   properties.end_time   || null,
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

function buildLayerUrl(layerId) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    f: 'geojson',
    resultRecordCount: '500',
  });
  return `${MAPSERVER_BASE}/${layerId}/query?${params.toString()}`;
}

/**
 * Fetch the 24-hour QPF isopleth polygons for a specific day.
 * @param {'day1'|'day2'|'day3'} dayLabel
 */
export async function fetchQpfLayer(dayLabel) {
  const layerId = QPF_LAYER_ID_MAP[dayLabel];
  if (layerId == null) throw new Error(`Unsupported QPF day: ${dayLabel}`);

  const url = buildLayerUrl(layerId);
  const cacheKey = `wpc:qpf:${dayLabel}`;
  const data = await fetchWpcLayer(url, cacheKey);
  return ensureFeatureCollection(data, dayLabel);
}
