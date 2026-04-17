/**
 * FireIncidentsLayer.jsx
 * Renders IRWIN incident point markers for active fires that do NOT have
 * a matching NIFC perimeter polygon. Styled as amber circle markers.
 */

import { Source, Layer } from 'react-map-gl';

const MIN_ACRES_FILTER = ['>=', ['get', 'GISAcres'], 0.4];
const IS_FULLY_CONTAINED = ['>=', ['coalesce', ['get', 'PercentContained'], 0], 100];

const incidentCircleLayer = {
  id: 'fire-incidents-circle',
  type: 'circle',
  source: 'fire-incidents',
  filter: MIN_ACRES_FILTER,
  paint: {
    'circle-radius': 7,
    'circle-color': ['case', IS_FULLY_CONTAINED, '#9ca3af', '#ffaa00'],
    'circle-opacity': 0.9,
    'circle-stroke-color': 'rgba(255,255,255,0.7)',
    'circle-stroke-width': 1.5,
  },
};

const incidentGlowLayer = {
  id: 'fire-incidents-glow',
  type: 'circle',
  source: 'fire-incidents',
  filter: MIN_ACRES_FILTER,
  paint: {
    'circle-radius': 14,
    'circle-color': ['case', IS_FULLY_CONTAINED, '#6b7280', '#ff8c00'],
    'circle-opacity': 0.12,
    'circle-stroke-width': 0,
  },
};

/**
 * @param {object}       props.geoJSON   GeoJSON FeatureCollection from useMergedFireData
 * @param {boolean}      props.visible
 */
export default function FireIncidentsLayer({ geoJSON, visible }) {
  if (!visible || !geoJSON || geoJSON.features.length === 0) return null;

  return (
    <Source id="fire-incidents" type="geojson" data={geoJSON}>
      <Layer {...incidentGlowLayer} />
      <Layer {...incidentCircleLayer} />
    </Source>
  );
}
