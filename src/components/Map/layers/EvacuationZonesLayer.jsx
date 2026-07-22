/**
 * EvacuationZonesLayer.jsx
 * Renders all evacuation zone polygons — official Cal OES / IPAWS feeds and
 * field reporter-drawn boundaries — as a single combined map layer.
 *
 * Expects a merged FeatureCollection (official + reporter features
 * concatenated) where each feature carries whichever schema its source
 * produces:
 *
 *   Official (see useCombinedEvacZones):
 *     warningType, zoneName, county, agency, jurisdiction, instructions,
 *     comments, effectiveDate, expirationDate, externalURL,
 *     source – "hosted" | "prod" | "ipaws"
 *
 *   Reporter-drawn (see useReporterEvacZones / reporterEvacZonesToGeoJSON):
 *     zone_type, title, incident_name, county, state, status,
 *     effective_at, expires_at, source – "reporter"
 *
 * Color scheme mirrors standard Cal OES zone classification regardless of
 * source (order/warning/watch → red/orange/yellow). Reporter-drawn zones get
 * a dashed outline + white halo so they read as field-reported rather than
 * an official feed, matching the polygon drawn on EvacZoneDrawer.
 */

import { useEffect, useRef, useMemo } from 'react';
import { Source, Layer, useMap } from 'react-map-gl';
import {
  EVAC_ZONE_FILL_COLORS,
  EVAC_ZONE_FILL_OPACITY,
  EVAC_ZONE_LINE_OPACITY,
} from './evacZonesPaint';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const NOT_REPORTER_FILTER = ['!=', ['get', 'source'], 'reporter'];
const IS_REPORTER_FILTER = ['==', ['get', 'source'], 'reporter'];

/** Normalized zone-level key shared by both schemas: warningType (official) or zone_type (reporter). */
const ZONE_LEVEL = ['coalesce', ['get', 'warningType'], ['get', 'zone_type']];

/**
 * Compute the centroid of a GeoJSON Polygon or MultiPolygon ring.
 * Returns [lng, lat] or null.
 */
function polygonCentroid(geometry) {
  try {
    if (!geometry) return null;
    const coords =
      geometry.type === 'Polygon'
        ? geometry.coordinates[0]
        : geometry.type === 'MultiPolygon'
        ? geometry.coordinates[0][0]
        : null;
    if (!coords?.length) return null;
    const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
    return [lng, lat];
  } catch {
    return null;
  }
}

const COLOR_MATCH = [
  'match',
  ZONE_LEVEL,
  'Evacuation Order',   EVAC_ZONE_FILL_COLORS['Evacuation Order'],
  'Evacuation Warning', EVAC_ZONE_FILL_COLORS['Evacuation Warning'],
  'Evacuation Watch',   EVAC_ZONE_FILL_COLORS['Evacuation Watch'],
  /* default */         EVAC_ZONE_FILL_COLORS.default,
];

const OPACITY_MATCH = [
  'match',
  ZONE_LEVEL,
  'Evacuation Order',   EVAC_ZONE_FILL_OPACITY['Evacuation Order'],
  'Evacuation Warning', EVAC_ZONE_FILL_OPACITY['Evacuation Warning'],
  'Evacuation Watch',   EVAC_ZONE_FILL_OPACITY['Evacuation Watch'],
  /* default */         EVAC_ZONE_FILL_OPACITY.default,
];

const LINE_WIDTH_MATCH = [
  'match',
  ZONE_LEVEL,
  'Evacuation Order',   2.5,
  'Evacuation Warning', 2.0,
  /* default */         1.5,
];

export default function EvacuationZonesLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';
  const data = geoJSON || EMPTY_GEOJSON;
  const { current: map } = useMap();
  const prevCountRef = useRef(0);

  // Build a companion FeatureCollection of centroid points for the dot layer
  const dotsData = useMemo(() => {
    if (!data?.features?.length) return EMPTY_GEOJSON;
    const dots = data.features
      .map((f, idx) => {
        const center = polygonCentroid(f.geometry);
        if (!center) return null;
        return {
          type: 'Feature',
          id: `dot-${f.id || idx}`,
          geometry: { type: 'Point', coordinates: center },
          properties: f.properties,
        };
      })
      .filter(Boolean);
    return {
      type: 'FeatureCollection',
      features: dots,
    };
  }, [data]);

  // Force source data update when geoJSON changes
  useEffect(() => {
    if (!map) return;

    prevCountRef.current = data?.features?.length ?? 0;

    try {
      const source = map.getSource('evac-zones');
      if (source && source.type === 'geojson') {
        source.setData(data);
      }
    } catch {
      // source not yet added
    }

    try {
      const dotSource = map.getSource('evac-zones-dots');
      if (dotSource && dotSource.type === 'geojson') {
        dotSource.setData(dotsData);
      }
    } catch {
      // source not yet added
    }
  }, [data, dotsData, map]);

  return (
    <>
      {/* Polygons (fill, outlines, labels) — rendered first, behind dots */}
      <Source
        id="evac-zones"
        type="geojson"
        data={data}
      >
        {/* Polygon fill — shared by official and reporter-drawn zones */}
        <Layer
          id="evac-zones-fill"
          type="fill"
          source="evac-zones"
          layout={{ visibility: vis }}
          paint={{
            'fill-color':   COLOR_MATCH,
            'fill-opacity': OPACITY_MATCH,
          }}
        />

        {/* Solid outline for official Cal OES / IPAWS zones */}
        <Layer
          id="evac-zones-line"
          type="line"
          source="evac-zones"
          filter={NOT_REPORTER_FILTER}
          layout={{ visibility: vis }}
          paint={{
            'line-color':   COLOR_MATCH,
            'line-width':   LINE_WIDTH_MATCH,
            'line-opacity': EVAC_ZONE_LINE_OPACITY,
          }}
        />

        {/* Dashed outline for reporter-drawn zones */}
        <Layer
          id="evac-zones-line-reporter"
          type="line"
          source="evac-zones"
          filter={IS_REPORTER_FILTER}
          layout={{
            visibility: vis,
            'line-cap': 'round',
            'line-join': 'round',
          }}
          paint={{
            'line-color':     COLOR_MATCH,
            'line-width':     2.5,
            'line-opacity':   EVAC_ZONE_LINE_OPACITY,
            'line-dasharray': [3, 2],
          }}
        />

        {/* Brighter halo so the reporter dashed line reads well on satellite */}
        <Layer
          id="evac-zones-line-reporter-halo"
          type="line"
          source="evac-zones"
          filter={IS_REPORTER_FILTER}
          layout={{
            visibility: vis,
            'line-cap': 'round',
            'line-join': 'round',
          }}
          paint={{
            'line-color':   '#ffffff',
            'line-width':   4,
            'line-opacity': 0.12,
          }}
        />

        {/* Zone-name labels at higher zoom */}
        <Layer
          id="evac-zones-label"
          type="symbol"
          source="evac-zones"
          minzoom={8}
          layout={{
            visibility: vis,
            'text-field': ['coalesce', ['get', 'zoneName'], ['get', 'title'], ''],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 11,
            'text-anchor': 'center',
            'text-max-width': 10,
          }}
          paint={{
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0,0,0,0.85)',
            'text-halo-width': 2,
          }}
        />
      </Source>

      {/* Dot markers at polygon centroids (low zoom) — on top of polygons */}
      <Source id="evac-zones-dots" type="geojson" data={dotsData}>
        <Layer
          id="evac-zones-dot"
          type="circle"
          source="evac-zones-dots"
          maxzoom={6}
          layout={{ visibility: vis }}
          paint={{
            'circle-color':   COLOR_MATCH,
            'circle-opacity': 0.95,
            'circle-radius':  [
              'interpolate', ['linear'], ['zoom'],
              0, 4,
              3, 6,
              5, 8,
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-stroke-opacity': 1,
          }}
        />
      </Source>
    </>
  );
}
