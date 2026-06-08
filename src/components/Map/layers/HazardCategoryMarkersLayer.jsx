/**
 * HazardCategoryMarkersLayer.jsx
 * Renders incident-management pin icons on the all-hazards map.
 * - Wildfire pin  → fire incident locations
 * - Flood/Weather pin → flood & severe weather alert centroids
 * Symbols are only rendered after the custom Mapbox images are loaded.
 */

import { memo } from 'react';
import { Layer } from 'react-map-gl';

// Flood-type NWS event keywords used to filter weather-alerts source
const FLOOD_EVENT_FILTER = [
  'any',
  ['in', 'Flood',       ['coalesce', ['get', 'type'], '']],
  ['in', 'Flash',       ['coalesce', ['get', 'type'], '']],
  ['in', 'Coastal',     ['coalesce', ['get', 'type'], '']],
  ['in', 'Surge',       ['coalesce', ['get', 'type'], '']],
  ['in', 'Hydrologic',  ['coalesce', ['get', 'type'], '']],
];

const HazardCategoryMarkersLayer = memo(function HazardCategoryMarkersLayer({
  iconsLoaded,
  fireVisible,
  weatherVisible,
}) {
  if (!iconsLoaded) return null;

  return (
    <>
      {/* ── Wildfire pin – incident locations (point source) ── */}
      {fireVisible && (
        <Layer
          id="hazard-pin-wildfire"
          type="symbol"
          source="incident-locations"
          minzoom={4}
          layout={{
            'icon-image': 'pin-wildfire',
            'icon-size': [
              'interpolate', ['linear'], ['zoom'],
              4, 0.40,
              8, 0.60,
              12, 0.75,
            ],
            'icon-anchor': 'bottom',
            'icon-allow-overlap': false,
            'icon-ignore-placement': false,
            'text-field': ['step', ['zoom'], '', 8, ['get', 'name']],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 11,
            'text-anchor': 'top',
            'text-offset': [0, 0.6],
            'text-optional': true,
            'text-max-width': 10,
          }}
          paint={{
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0,0,0,0.85)',
            'text-halo-width': 1.5,
          }}
        />
      )}

      {/* ── Flood/Weather pin – flood-type NWS alert centroids ── */}
      {weatherVisible && (
        <Layer
          id="hazard-pin-flood-weather"
          type="symbol"
          source="weather-alerts"
          filter={FLOOD_EVENT_FILTER}
          minzoom={4}
          layout={{
            'icon-image': 'pin-flood-weather',
            'icon-size': [
              'interpolate', ['linear'], ['zoom'],
              4, 0.38,
              8, 0.55,
              12, 0.70,
            ],
            'icon-anchor': 'bottom',
            'icon-allow-overlap': false,
            'symbol-placement': 'point',
          }}
        />
      )}
    </>
  );
});

export default HazardCategoryMarkersLayer;
