/**
 * FireHotspotsLayer.jsx
 * Renders NASA FIRMS fire hotspot detections as clustered circle markers.
 * Uses FRP (Fire Radiative Power) to drive color and size.
 */

import { Source, Layer } from 'react-map-gl/maplibre';
import { FRP_COLOR_EXPRESSION, FRP_RADIUS_EXPRESSION } from '../../../utils/colorUtils';

// Cluster circle styling
const clusterLayer = {
  id: 'fire-clusters',
  type: 'circle',
  source: 'fire-hotspots',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': [
      'step', ['get', 'point_count'],
      '#ff8c00',
      10, '#ff4500',
      50, '#cc0000',
    ],
    'circle-radius': [
      'step', ['get', 'point_count'],
      16, 10, 22, 50, 30,
    ],
    'circle-opacity': 0.9,
    'circle-stroke-color': 'rgba(255,255,255,0.3)',
    'circle-stroke-width': 1.5,
  },
};

const clusterCountLayer = {
  id: 'fire-cluster-count',
  type: 'symbol',
  source: 'fire-hotspots',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-size': 12,
    'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
  },
  paint: { 'text-color': '#ffffff' },
};

// Individual hotspot point layer
const hotspotsLayer = {
  id: 'fire-hotspots-circle',
  type: 'circle',
  source: 'fire-hotspots',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-radius': FRP_RADIUS_EXPRESSION,
    'circle-color':  FRP_COLOR_EXPRESSION,
    'circle-opacity': 0.85,
    'circle-stroke-color': 'rgba(255,255,255,0.5)',
    'circle-stroke-width': 0.8,
  },
};

// Outer pulsing glow for high-intensity fires (FRP > 200 MW)
const hotspotsGlowLayer = {
  id: 'fire-hotspots-glow',
  type: 'circle',
  source: 'fire-hotspots',
  filter: ['all', ['!', ['has', 'point_count']], ['>=', ['get', 'frp'], 200]],
  paint: {
    'circle-radius': ['*', FRP_RADIUS_EXPRESSION, 2.2],
    'circle-color':  '#ff4500',
    'circle-opacity': 0.15,
    'circle-stroke-width': 0,
  },
};

/**
 * @param {object} props
 * @param {object|null} props.geoJSON  GeoJSON FeatureCollection from useFireHotspots
 * @param {boolean}     props.visible
 */
export default function FireHotspotsLayer({ geoJSON, visible }) {
  if (!visible || !geoJSON) return null;

  return (
    <Source
      id="fire-hotspots"
      type="geojson"
      data={geoJSON}
      cluster
      clusterMaxZoom={12}
      clusterRadius={45}
    >
      <Layer {...hotspotsGlowLayer} />
      <Layer {...clusterLayer} />
      <Layer {...clusterCountLayer} />
      <Layer {...hotspotsLayer} />
    </Source>
  );
}
