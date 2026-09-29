/**
 * IncidentLocationsLayer.jsx
 * Renders WFIGS current incident locations as interactive point markers.
 * Circle markers use a uniform size; color indicates containment status.
 * Layer stays mounted; visibility is controlled via layout property.
 *
 * Nearby incidents are clustered into a count bubble at low zoom so the
 * overview isn't a pile of overlapping pins; clicking a bubble zooms in
 * (handled in MapView), and from CLUSTER_MAX_ZOOM + 1 onward every incident
 * shows individually. A bubble has an orange ring if any fire in it is still
 * active, a grey ring if all are fully contained.
 */

import { memo, useMemo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const IS_FULLY_CONTAINED = ['>=', ['coalesce', ['get', 'contained'], 0], 100];

// Fires below this size are hidden — filtered before clustering so they
// aren't counted in the bubbles either.
const MIN_ACRES = 0.4;

const CLUSTER_MAX_ZOOM = 8;
const CLUSTER_RADIUS = 45;
const IS_CLUSTER = ['has', 'point_count'];
const NOT_CLUSTER = ['!', IS_CLUSTER];

// Per-cluster count of incidents that aren't fully contained.
const CLUSTER_PROPERTIES = {
  activeCount: ['+', ['case', IS_FULLY_CONTAINED, 0, 1]],
};

// Bubbles use a dark fill with a colored ring so they can't be mistaken for
// the containment-colored incident dots. Exported for the map legend.
export const CLUSTER_FILL_COLOR = '#111827';
export const CLUSTER_ACTIVE_RING_COLOR = '#f97316';
export const CLUSTER_CONTAINED_RING_COLOR = '#9ca3af';

// Grey at 100% contained; otherwise interpolate red -> orange -> yellow -> lime
const CONTAINMENT_COLOR = [
  'case',
  IS_FULLY_CONTAINED,
  '#6b7280',
  [
    'interpolate', ['linear'], ['get', 'contained'],
    0,  '#ef4444',
    25, '#f97316',
    50, '#eab308',
    75, '#84cc16',
  ],
];

const DOT_RADIUS = 7;
const DOT_GLOW_RADIUS = 14;

const IncidentLocationsLayer = memo(function IncidentLocationsLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  const data = useMemo(() => {
    if (!geoJSON?.features) return EMPTY_GEOJSON;
    return {
      ...geoJSON,
      features: geoJSON.features.filter((f) => Number(f.properties?.acres) >= MIN_ACRES),
    };
  }, [geoJSON]);

  return (
    <Source
      id="incident-locations"
      type="geojson"
      data={data}
      cluster
      clusterMaxZoom={CLUSTER_MAX_ZOOM}
      clusterRadius={CLUSTER_RADIUS}
      clusterProperties={CLUSTER_PROPERTIES}
    >
      {/* Cluster count bubbles */}
      <Layer
        id="incident-locations-cluster"
        type="circle"
        source="incident-locations"
        filter={IS_CLUSTER}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24],
          'circle-color': CLUSTER_FILL_COLOR,
          'circle-opacity': 0.85,
          'circle-stroke-color': [
            'case', ['>', ['get', 'activeCount'], 0], CLUSTER_ACTIVE_RING_COLOR, CLUSTER_CONTAINED_RING_COLOR,
          ],
          'circle-stroke-width': 2.5,
        }}
      />
      <Layer
        id="incident-locations-cluster-count"
        type="symbol"
        source="incident-locations"
        filter={IS_CLUSTER}
        layout={{
          visibility: vis,
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'text-allow-overlap': true,
        }}
        paint={{ 'text-color': '#ffffff' }}
      />
      {/* Outer glow ring */}
      <Layer
        id="incident-locations-glow"
        type="circle"
        source="incident-locations"
        filter={NOT_CLUSTER}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': DOT_GLOW_RADIUS,
          'circle-color': CONTAINMENT_COLOR,
          'circle-opacity': 0.12,
          'circle-stroke-width': 0,
        }}
      />
      {/* Main marker circle */}
      <Layer
        id="incident-locations-circle"
        type="circle"
        source="incident-locations"
        filter={NOT_CLUSTER}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': DOT_RADIUS,
          'circle-color': CONTAINMENT_COLOR,
          'circle-opacity': 0.8,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.6,
        }}
      />
      {/* Name labels at higher zoom */}
      <Layer
        id="incident-locations-label"
        type="symbol"
        source="incident-locations"
        filter={NOT_CLUSTER}
        minzoom={7}
        layout={{
          visibility: vis,
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 1.5],
          'text-max-width': 10,
        }}
        paint={{
          'text-color': ['case', IS_FULLY_CONTAINED, '#9ca3af', '#ffffff'],
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width': 1.5,
        }}
      />
    </Source>
  );
});
export default IncidentLocationsLayer;
