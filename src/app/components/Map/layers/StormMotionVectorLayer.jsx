/**
 * StormMotionVectorLayer.jsx
 * Renders the Radar Settings "Storm Motion Vectors" overlay: a white center
 * point per tracked storm, a white line to its projected one-hour position,
 * and perpendicular tick marks at the 30- and 60-minute marks along that
 * line — see utils/stormMotion.js for how these are derived from NWS
 * warning text (`geoJSON` is pre-built by useStormMotionVectors.js).
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const StormMotionVectorLayer = memo(function StormMotionVectorLayer({ visible, geoJSON, beforeId }) {
  return (
    <Source id="storm-motion-vectors" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="storm-motion-vector-lines"
        type="line"
        beforeId={beforeId}
        filter={['==', ['get', 'kind'], 'vector']}
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{ 'line-color': '#ffffff', 'line-width': 2 }}
      />
      <Layer
        id="storm-motion-vector-ticks"
        type="line"
        beforeId={beforeId}
        filter={['==', ['get', 'kind'], 'tick']}
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{ 'line-color': '#ffffff', 'line-width': 1.5 }}
      />
      <Layer
        id="storm-motion-vector-centers"
        type="circle"
        beforeId={beforeId}
        filter={['==', ['get', 'kind'], 'center']}
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{
          'circle-radius': 4,
          'circle-color': '#ffffff',
          'circle-stroke-width': 1,
          // rgba(), not an 8-digit hex — Mapbox GL's style validator rejects
          // #RRGGBBAA (confirmed live: "color expected, #00000080 found" on
          // every render), even though it's valid CSS Color 4.
          'circle-stroke-color': 'rgba(0, 0, 0, 0.5)',
        }}
      />
    </Source>
  );
});

export default StormMotionVectorLayer;
