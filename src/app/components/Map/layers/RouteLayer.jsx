/**
 * RouteLayer.jsx
 * Navigation (Route to Safety) geometry: the driving route (casing + line;
 * amber when avoid polygons were sent but couldn't be honoured), start/end
 * markers and shelter candidates.
 */

import { memo, useMemo } from 'react';
import { Layer, Marker, Source } from 'react-map-gl';

const EMPTY = { type: 'FeatureCollection', features: [] };

const RouteLayer = memo(function RouteLayer({ route, origin, destination, shelters = [], hazardWarning = false }) {
  const shelterPoints = useMemo(() => ({
    type: 'FeatureCollection',
    features: shelters.map((s) => ({ type: 'Feature', properties: { name: s.name }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } })),
  }), [shelters]);
  const lineColor = hazardWarning ? '#f59e0b' : '#22c55e';

  return (
    <>
      <Source id="route-safety-shelters" type="geojson" data={route ? EMPTY : shelterPoints}>
        <Layer id="route-safety-shelters-circle" type="circle"
          paint={{ 'circle-radius': 6, 'circle-color': '#22c55e', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 }} />
      </Source>
      <Source id="route-safety-route" type="geojson" data={route || EMPTY}>
        <Layer id="route-safety-casing" type="line" layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': '#0a0a0a', 'line-width': 9, 'line-opacity': 0.7 }} />
        <Layer id="route-safety-line" type="line" layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': lineColor, 'line-width': 5 }} />
      </Source>
      {origin && (
        <Marker longitude={origin[0]} latitude={origin[1]} anchor="center">
          <div className="w-4 h-4 rounded-full bg-sky-500 border-2 border-white shadow" aria-label="Route start" />
        </Marker>
      )}
      {destination && (
        <Marker longitude={destination.lng} latitude={destination.lat} anchor="bottom">
          <div className="px-2 py-0.5 rounded-md bg-green-600 text-white text-[11px] font-semibold shadow" aria-label="Route destination">
            {destination.name}
          </div>
        </Marker>
      )}
    </>
  );
});

export default RouteLayer;
