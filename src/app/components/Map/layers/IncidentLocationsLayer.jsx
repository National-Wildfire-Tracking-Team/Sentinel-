/**
 * IncidentLocationsLayer.jsx
 * Renders every fire point on the live map — WFIGS incident locations,
 * perimeter centroid dots and the remaining IRWIN/CAL FIRE incident dots —
 * from one clustered source, so all of them group together.
 * Layer stays mounted; visibility is controlled via layout property.
 *
 * Nearby fires are clustered into a count flame at low zoom so the overview
 * isn't a pile of overlapping pins; clicking a flame zooms in (handled in
 * MapView), and from CLUSTER_MAX_ZOOM + 1 onward every fire shows
 * individually. Zooming back out regroups them. The flame is the Sentinel logo
 * (lucide Flame) with the count in its base: a red outline if a third or more
 * of its fires are red (0% contained), orange if any fire in it is
 * still active, a grey outline if all are fully contained.
 *
 * Each kind of point keeps its own look and its own layer id
 * (incident-locations-circle, fire-perimeter-centroids-circle,
 * fire-incidents-circle), so MapView's click and hover handling is unchanged.
 * Perimeter dots and incident dots used to live in separate, unclustered
 * sources: once perimeter data loaded, every fire with a perimeter dropped
 * out of the bubbles and the map looked ungrouped.
 */

import { memo, useEffect, useMemo, useState } from 'react';
import { Source, Layer, useMap } from 'react-map-gl';
import { MIN_FIRE_ACRES, drawsCentroidDot } from './perimeterCentroids';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Containment, normalized across the three kinds' property names.
const IS_FULLY_CONTAINED = ['>=', ['coalesce', ['get', '_contained'], 0], 100];

// Fires below MIN_FIRE_ACRES are hidden — filtered before clustering so they
// aren't counted in the groups either. Every kind of fire point follows the
// same rules to stay on the map and the same containment colors.
const MIN_ACRES = MIN_FIRE_ACRES;

const CLUSTER_MAX_ZOOM = 8;
const CLUSTER_RADIUS = 45;
const IS_CLUSTER = ['has', 'point_count'];
const NOT_CLUSTER = ['!', IS_CLUSTER];
const isKind = (kind) => ['all', NOT_CLUSTER, ['==', ['get', '_kind'], kind]];

// Containment red and orange, pushed apart so they never read as one color:
// a deep crimson red and a softer, less bright orange. Exported for the legend.
export const CONTAINMENT_RED = '#c8102e';
export const CONTAINMENT_ORANGE = '#e8801a';

// A fire that draws as a red dot: 0% contained, the legend's "Uncontained"
// step. Every kind of fire point is colored by containment.
const RED_DOT_MAX_CONTAINED = 1;
const IS_RED_DOT = ['<', ['coalesce', ['get', '_contained'], 0], RED_DOT_MAX_CONTAINED];

// Per-cluster counts: fires that aren't fully contained, and red fires.
const CLUSTER_PROPERTIES = {
  activeCount: ['+', ['case', IS_FULLY_CONTAINED, 0, 1]],
  redCount: ['+', ['case', IS_RED_DOT, 1, 0]],
};

// Cluster flames use a dark fill with a colored outline so they can't be
// mistaken for the containment-colored incident dots. Exported for the map legend.
export const CLUSTER_FILL_COLOR = '#111827';
export const CLUSTER_ACTIVE_RING_COLOR = CONTAINMENT_ORANGE; // the dot orange, so red flames stand apart
export const CLUSTER_CONTAINED_RING_COLOR = '#9ca3af';
export const CLUSTER_RED_RING_COLOR = CONTAINMENT_RED; // the red-dot color, for largely uncontained groups

// lucide Flame (the header logo), 24×24. Its round base is centred at (12, 15).
export const CLUSTER_FLAME_PATH =
  'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z';

const FLAME_PX = 96;        // image size; registered at pixelRatio 2, so 48 px at icon-size 1
const FLAME_ICON_OFFSET = [0, -8]; // lifts the flame so its base, not its middle, sits on the point (and under the count)
const FLAME_ICONS = {
  'fire-cluster-red': CLUSTER_RED_RING_COLOR,
  'fire-cluster-active': CLUSTER_ACTIVE_RING_COLOR,
  'fire-cluster-contained': CLUSTER_CONTAINED_RING_COLOR,
};

function flameDataUrl(stroke) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FLAME_PX}" height="${FLAME_PX}" viewBox="0 0 24 24">`
    + `<path d="${CLUSTER_FLAME_PATH}" fill="${CLUSTER_FILL_COLOR}" fill-opacity="0.85" stroke="${stroke}"`
    + ' stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/** Registers the two cluster flames with the map (again after a style reload); true once both exist. */
function useFlameIcons(map) {
  const [ready, setReady] = useState(() => Boolean(map) && Object.keys(FLAME_ICONS).every((id) => map.hasImage(id)));
  useEffect(() => {
    if (!map) return undefined;
    const missing = () => Object.keys(FLAME_ICONS).filter((id) => !map.hasImage(id));
    function register() {
      const ids = missing();
      if (!ids.length) { setReady(true); return; }
      setReady(false);
      let pending = ids.length;
      ids.forEach((id) => {
        const img = new Image(FLAME_PX, FLAME_PX);
        img.onload = () => {
          if (!map.hasImage(id)) {
            try { map.addImage(id, img, { pixelRatio: 2 }); } catch { /* style reloaded mid-flight */ }
          }
          pending -= 1;
          if (pending <= 0) setReady(true);
        };
        img.src = flameDataUrl(FLAME_ICONS[id]);
      });
    }
    function onStyleData() { if (missing().length) register(); }
    map.on('styledata', onStyleData);
    if (map.isStyleLoaded()) register();
    return () => map.off('styledata', onStyleData);
  }, [map]);
  return ready;
}

// A cluster count, 0 when absent. A source created before a count was added
// (react-map-gl can't change clusterProperties in place) lacks it, and an
// unguarded null makes the whole icon expression fail, hiding every flame.
const CLUSTER_COUNT = (name) => ['coalesce', ['get', name], 0];

const CLUSTER_SIZE_STEP = (small, medium, large) => ['step', ['get', 'point_count'], small, 10, medium, 50, large];

// Grey at 100% contained; red at 0% (the same test the cluster flames count);
// orange through 1–24%, then interpolate orange -> yellow -> lime.
const CONTAINMENT_COLOR = [
  'case',
  IS_FULLY_CONTAINED,
  '#6b7280',
  ['<', ['coalesce', ['get', '_contained'], 0], RED_DOT_MAX_CONTAINED],
  CONTAINMENT_RED,
  [
    'interpolate', ['linear'], ['get', '_contained'],
    25, CONTAINMENT_ORANGE,
    50, '#eab308',
    75, '#84cc16',
  ],
];

// react-map-gl can't change clusterProperties on an existing source, so the
// source is keyed by them: a change rebuilds it instead of keeping stale counts.
const CLUSTER_SOURCE_KEY = JSON.stringify(CLUSTER_PROPERTIES);

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
  const { current: map } = useMap();
  const flamesReady = useFlameIcons(map);

  const data = useMemo(() => {
    const incidents = (geoJSON?.features || []).filter((f) => Number(f.properties?.acres) >= MIN_ACRES);
    // Only the perimeters that draw a dot (see drawsCentroidDot).
    const centroids = (perimeterCentroidsGeoJSON?.features || []).filter((f) => drawsCentroidDot(f.properties));
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
      key={CLUSTER_SOURCE_KEY}
      id="incident-locations"
      type="geojson"
      data={data}
      cluster
      clusterMaxZoom={CLUSTER_MAX_ZOOM}
      clusterRadius={CLUSTER_RADIUS}
      clusterProperties={CLUSTER_PROPERTIES}
    >
      {/* Cluster count flames. They mount once their images load, after the
          count layer exists, so beforeId keeps them under the numbers. */}
      {flamesReady && (
        <Layer
          id="incident-locations-cluster"
          beforeId="incident-locations-cluster-count"
          type="symbol"
          source="incident-locations"
          filter={IS_CLUSTER}
          layout={{
            visibility: vis,
            'icon-image': [
              'case',
              // A third or more of its fires are red (and at least one is).
              ['all',
                ['>', CLUSTER_COUNT('redCount'), 0],
                ['>=', ['*', CLUSTER_COUNT('redCount'), 3], ['get', 'point_count']],
              ], 'fire-cluster-red',
              ['>', CLUSTER_COUNT('activeCount'), 0], 'fire-cluster-active',
              'fire-cluster-contained',
            ],
            'icon-size': CLUSTER_SIZE_STEP(0.8, 0.95, 1.1),
            'icon-offset': FLAME_ICON_OFFSET,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          }}
        />
      )}
      <Layer
        id="incident-locations-cluster-count"
        type="symbol"
        source="incident-locations"
        filter={IS_CLUSTER}
        layout={{
          visibility: vis,
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': CLUSTER_SIZE_STEP(9, 10, 11),
          'text-allow-overlap': true,
          'text-ignore-placement': true,
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

      {/* Perimeter centroid dots: containment-colored, like every fire dot */}
      <Layer
        id="fire-perimeter-centroids-glow"
        type="circle"
        source="incident-locations"
        filter={isKind('perimeter')}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': DOT_GLOW_RADIUS,
          'circle-color': CONTAINMENT_COLOR,
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
          'circle-color': CONTAINMENT_COLOR,
          'circle-opacity': 0.8,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.6,
        }}
      />

      {/* Incident dots with no perimeter: containment-colored, like every fire dot */}
      <Layer
        id="fire-incidents-glow"
        type="circle"
        source="incident-locations"
        filter={isKind('dot')}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': DOT_GLOW_RADIUS,
          'circle-color': CONTAINMENT_COLOR,
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
          'circle-color': CONTAINMENT_COLOR,
          'circle-opacity': 0.8,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.6,
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
