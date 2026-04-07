/**
 * FirePerimetersLayer.jsx
 * Renders NIFC fire perimeter polygons with fill and outline.
 * Highlights the currently selected perimeter.
 */

import { Source, Layer } from 'react-map-gl/maplibre';
import { useApp } from '../../../context/AppContext';

// Fill layer for all perimeters
const perimeterFillLayer = {
  id: 'fire-perimeters-fill',
  type: 'fill',
  source: 'fire-perimeters',
  paint: {
    'fill-color': '#ff6600',
    'fill-opacity': [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      0.35,
      0.14,
    ],
  },
};

// Outline/stroke for all perimeters
const perimeterLineLayer = {
  id: 'fire-perimeters-line',
  type: 'line',
  source: 'fire-perimeters',
  paint: {
    'line-color': [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      '#ffaa00',
      '#ff6600',
    ],
    'line-width': [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      3,
      1.8,
    ],
    'line-opacity': 0.9,
  },
};

// Perimeter label (shown at zoom > 8)
const perimeterLabelLayer = {
  id: 'fire-perimeters-label',
  type: 'symbol',
  source: 'fire-perimeters',
  minzoom: 7,
  layout: {
    'text-field': ['get', 'IncidentName'],
    'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
    'text-size': 12,
    'text-anchor': 'center',
    'text-max-width': 10,
  },
  paint: {
    'text-color': '#ffffff',
    'text-halo-color': 'rgba(0,0,0,0.8)',
    'text-halo-width': 2,
  },
};

/**
 * @param {object} props
 * @param {object|null} props.geoJSON
 * @param {boolean}     props.visible
 */
export default function FirePerimetersLayer({ geoJSON, visible }) {
  const { selectedFire } = useApp();

  if (!visible || !geoJSON) return null;

  return (
    <Source id="fire-perimeters" type="geojson" data={geoJSON} generateId>
      <Layer {...perimeterFillLayer} />
      <Layer {...perimeterLineLayer} />
      <Layer {...perimeterLabelLayer} />
    </Source>
  );
}
