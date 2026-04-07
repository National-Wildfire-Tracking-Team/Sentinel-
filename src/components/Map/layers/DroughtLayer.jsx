/**
 * DroughtLayer.jsx
 * Renders US Drought Monitor intensity zones.
 * Uses the official USDM color palette.
 */

import { Source, Layer } from 'react-map-gl/maplibre';
import { DROUGHT_COLOR_EXPRESSION } from '../../../utils/colorUtils';

const droughtFillLayer = {
  id: 'drought-fill',
  type: 'fill',
  source: 'drought',
  paint: {
    'fill-color':   DROUGHT_COLOR_EXPRESSION,
    'fill-opacity': 0.45,
  },
};

const droughtLineLayer = {
  id: 'drought-line',
  type: 'line',
  source: 'drought',
  paint: {
    'line-color':   DROUGHT_COLOR_EXPRESSION,
    'line-width':   0.8,
    'line-opacity': 0.6,
  },
};

export default function DroughtLayer({ geoJSON, visible }) {
  if (!visible || !geoJSON) return null;

  return (
    <Source id="drought" type="geojson" data={geoJSON}>
      <Layer {...droughtFillLayer} beforeId="fire-perimeters-fill" />
      <Layer {...droughtLineLayer} />
    </Source>
  );
}
