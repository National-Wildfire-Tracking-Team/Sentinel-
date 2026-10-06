/**
 * IncidentLocationsLayer.jsx
 * Renders every fire point on the live map — WFIGS incident locations,
 * perimeter centroid dots and the remaining IRWIN/CAL FIRE incident dots —
 * from one clustered source, so all of them group together.
 * Layer stays mounted; visibility is controlled via layout property.
 *
 * Nearby fires are clustered into a count bubble at low zoom so the overview
 * isn't a pile of overlapping pins; clicking a bubble zooms in (handled in
 * MapView), and from CLUSTER_MAX_ZOOM + 1 onward every fire shows
 * individually. Zooming back out regroups them. A bubble has an orange ring if
 * any fire in it is still active, a grey ring if all are fully contained.
 *
 * Each kind of point keeps its own look and its own layer id
 * (incident-locations-circle, fire-perimeter-centroids-circle,
 * fire-incidents-circle), so MapView's click and hover handling is unchanged.
 * Perimeter dots and incident dots used to live in separate, unclustered
 * sources: once perimeter data loaded, every fire with a perimeter dropped
 * out of the bubbles and the map looked ungrouped.
 */

import { memo, useMemo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Containment, normalized across the three kinds' property names.
const IS_FULLY_CONTAINED = ['>=', ['coalesce', ['get', '_contained'], 0], 100];

// Fires below this size are hidden — filtered before clustering so they
// aren't counted in the bubbles either. (Perimeter dots were never filtered.)
const MIN_ACRES = 0.4;

const CLUSTER_MAX_ZOOM = 8;
const CLUSTER_RADIUS = 45;
const IS_CLUSTER = ['has', 'point_count'];
const NOT_CLUSTER = ['!', IS_CLUSTER];
const isKind = (kind) => ['all', NOT_CLUSTER, ['==', ['get', '_kind'], kind]];

// Per-cluster count of fires that aren't fully contained.
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
    'interpolate', ['linear'], ['get', '_contained'],
    0,  '#ef4444',
    25, '#f97316',
    50, '#eab308',
    75, '#84cc16',
  ],
];

const DOT_RADIUS = 7;
const DOT_GLOW_RADIUS = 14;

function tagged(features, kind, containedKey) {
  return features.map((f) => ({
    ...f,
    properties: {
      ...f.properties,
      _kind: kind,
      _contained: Number(f.properties?.[containedKey]) || 0,
    },
  }));
}

/**
 * @param {object}  props.geoJSON                    WFIGS incident locations (id/name/acres/contained)
 * @param {object}  props.perimeterCentroidsGeoJSON  Perimeter centroid points (see perimeterCentroids)
 * @param {object}  props.fireDotsGeoJSON            Incident dots with no perimeter (WFIGS field names)
 * @param {boolean} props.visible
 */
const IncidentLocationsLayer = memo(function IncidentLocationsLayer({
  geoJSON,
  perimeterCentroidsGeoJSON = null,
  fireDotsGeoJSON = null,
  visible,
}) {
  const vis = visible ? 'visible' : 'none';

  const data = useMemo(() => {
    const incidents = (geoJSON?.features || []).filter((f) => Number(f.properties?.acres) >= MIN_ACRES);
    // Only the perimeters that draw a dot: active, current mappings.
    const centroids = (perimeterCentroidsGeoJSON?.features || []).filter((f) => {
      const p = f.properties || {};
      return (Number(p.PercentContained) || 0) < 100 && !p.isStaleFire && !p.isHistoricalMapping;
    });
    const dots = (fireDotsGeoJSON?.features || []).filter((f) => Number(f.properties?.GISAcres) >= MIN_ACRES);
    if (!incidents.length && !centroids.length && !dots.length) return EMPTY_GEOJSON;
    return {
      type: 'FeatureCollection',
      features: [
        ...tagged(incidents, 'incident', 'contained'),
        ...tagged(centroids, 'perimeter', 'PercentContained'),
        ...tagged(dots, 'dot', 'PercentContained'),
      ],
    };
  }, [geoJSON, perimeterCentroidsGeoJSON, fireDotsGeoJSON]);

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

      {/* WFIGS incident locations: containment-colored */}
      <Layer
        id="incident-locations-glow"
        type="circle"
        source="incident-locations"
        filter={isKind('incident')}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': DOT_GLOW_RADIUS,
          'circle-color': CONTAINMENT_COLOR,
          'circle-opacity': 0.12,
          'circle-stroke-width': 0,
        }}
      />
      <Layer
        id="incident-locations-circle"
        type="circle"
        source="incident-locations"
        filter={isKind('incident')}
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

      {/* Perimeter centroid dots: amber */}
      <Layer
        id="fire-perimeter-centroids-glow"
        type="circle"
        source="incident-locations"
        filter={isKind('perimeter')}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': DOT_GLOW_RADIUS,
          'circle-color': '#ff8c00',
          'circle-opacity': 0.12,
          'circle-stroke-width': 0,
        }}
      />
      <Layer
        id="fire-perimeter-centroids-circle"
        type="circle"
        source="incident-locations"
        filter={isKind('perimeter')}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': DOT_RADIUS,
          'circle-color': '#ffaa00',
          'circle-opacity': 0.9,
          'circle-stroke-color': 'rgba(255,255,255,0.7)',
          'circle-stroke-width': 1.5,
        }}
      />

      {/* Incident dots with no perimeter: amber, grey once fully contained */}
      <Layer
        id="fire-incidents-glow"
        type="circle"
        source="incident-locations"
        filter={isKind('dot')}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': DOT_GLOW_RADIUS,
          'circle-color': ['case', IS_FULLY_CONTAINED, '#6b7280', '#ff8c00'],
          'circle-opacity': 0.12,
          'circle-stroke-width': 0,
        }}
      />
      <Layer
        id="fire-incidents-circle"
        type="circle"
        source="incident-locations"
        filter={isKind('dot')}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': DOT_RADIUS,
          'circle-color': ['case', IS_FULLY_CONTAINED, '#9ca3af', '#ffaa00'],
          'circle-opacity': 0.9,
          'circle-stroke-color': 'rgba(255,255,255,0.7)',
          'circle-stroke-width': 1.5,
        }}
      />

      {/* Name labels at higher zoom, only for fires shown individually */}
      <Layer
        id="incident-locations-label"
        type="symbol"
        source="incident-locations"
        filter={NOT_CLUSTER}
        minzoom={7}
        layout={{
          visibility: vis,
          'text-field': ['coalesce', ['get', 'name'], ['get', 'IncidentName']],
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
