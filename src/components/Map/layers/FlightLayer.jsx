/**
 * FlightLayer.jsx
 * Renders live aircraft positions as orange airplane symbols using OpenSky data.
 * Each icon rotates to match the aircraft's true heading (true_track).
 * Uses a custom SVG icon loaded into the Mapbox image registry on first render.
 */

import { useEffect, memo } from 'react';
import { Source, Layer, useMap } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };
const ICON_ID = 'sentinel-airplane';

// Orange airplane SVG (fire-600 = #ff5a00). Pointing "up" (north) so that
// Mapbox icon-rotate applied from true_track aligns correctly.
const AIRPLANE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <g transform="translate(32,32)">
    <!-- fuselage -->
    <ellipse rx="5" ry="22" fill="#ff5a00"/>
    <!-- wings -->
    <polygon points="-20,8 20,8 5,-4 -5,-4" fill="#ff5a00"/>
    <!-- tail fins -->
    <polygon points="-10,18 10,18 4,10 -4,10" fill="#ff5a00"/>
  </g>
</svg>`;

function loadAirplaneIcon(map) {
  if (map.hasImage(ICON_ID)) return;
  const img = new Image(64, 64);
  img.onload = () => {
    if (!map.hasImage(ICON_ID)) map.addImage(ICON_ID, img);
  };
  img.src = `data:image/svg+xml;base64,${btoa(AIRPLANE_SVG)}`;
}

const FlightLayer = memo(function FlightLayer({ geoJSON, visible }) {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map) return;
    // Map may still be loading its style when this runs
    if (map.isStyleLoaded()) {
      loadAirplaneIcon(map);
    } else {
      map.once('styledata', () => loadAirplaneIcon(map));
    }
  }, [map]);

  const vis = visible ? 'visible' : 'none';

console.log('FlightLayer visible:', visible);
console.log('FlightLayer feature count:', geoJSON?.features?.length);

  return (
    <Source
      id="flights"
      type="geojson"
      data={geoJSON || EMPTY_GEOJSON}
    >
      <Layer
  id="flights-symbol"
  type="circle"
  source="flights"
  layout={{
    visibility: vis,
  }}
  paint={{
    'circle-radius': 3,
    'circle-color': '#ff5a00',
    'circle-opacity': 0.9,
  }}
/>
    </Source>
  );
});
export default FlightLayer;
