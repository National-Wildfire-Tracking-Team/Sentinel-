/**
 * SpotlightMaskLayer.jsx
 * Dims the map outside a clicked polygon — the "Popup Spotlight" preference.
 * Renders a single fill layer covering the world with the feature's rings
 * punched out as holes, so only the clicked shape stays undimmed.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';
import { buildInvertedMask } from '../../../utils/mapGeometry';

const SpotlightMaskLayer = memo(function SpotlightMaskLayer({ geometry, opacity = 0.5, id = 'popup-spotlight-mask' }) {
  const mask = buildInvertedMask(geometry);
  if (!mask) return null;

  return (
    <Source id={id} type="geojson" data={{ type: 'FeatureCollection', features: [mask] }}>
      <Layer
        id={`${id}-fill`}
        type="fill"
        source={id}
        paint={{ 'fill-color': '#000000', 'fill-opacity': opacity }}
      />
    </Source>
  );
});

export default SpotlightMaskLayer;
