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
 *     source – "hosted" | "ipaws"
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

import { memo, useMemo } from 'react';
import { Source, Layer } from 'react-map-gl';
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

function polygonCentroid(geometry) {
  const coordinates = geometry?.type === 'Polygon'
    ? geometry.coordinates[0]
    : geometry?.type === 'MultiPolygon'
      ? geometry.coordinates[0]?.[0]
      : null;

  if (!coordinates?.length) return null;

  const [longitude, latitude] = coordinates.reduce(
    ([longitudeSum, latitudeSum], coordinate) => [
      longitudeSum + coordinate[0],
      latitudeSum + coordinate[1],
    ],
    [0, 0],
  );

  return [longitude / coordinates.length, latitude / coordinates.length];
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

function EvacuationZonesLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';
  const data = geoJSON || EMPTY_GEOJSON;
  const markerData = useMemo(() => ({
    type: 'FeatureCollection',
    features: data.features.flatMap((feature, index) => {
      const coordinates = polygonCentroid(feature.geometry);
      if (!coordinates) return [];

      return [{
        type: 'Feature',
        id: `marker-${feature.id ?? index}`,
        geometry: { type: 'Point', coordinates },
        properties: feature.properties,
      }];
    }),
  }), [data]);

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

      <Source id="evac-zones-dots" type="geojson" data={markerData}>
        <Layer
          id="evac-zones-dot-halo"
          type="circle"
          source="evac-zones-dots"
          layout={{ visibility: vis }}
          paint={{
            'circle-color': '#111827',
            'circle-opacity': 0.9,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 7, 5, 11, 10, 14],
          }}
        />
        <Layer
          id="evac-zones-dot"
          type="circle"
          source="evac-zones-dots"
          layout={{ visibility: vis }}
          paint={{
            'circle-color': COLOR_MATCH,
            'circle-opacity': 0.95,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 5, 5, 8, 10, 11],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-stroke-opacity': 1,
          }}
        />
        <Layer
          id="evac-zones-dot-alert"
          type="symbol"
          source="evac-zones-dots"
          layout={{
            visibility: vis,
            'text-field': '!',
            'text-size': ['interpolate', ['linear'], ['zoom'], 0, 9, 5, 12, 10, 15],
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            'text-allow-overlap': true,
          }}
          paint={{
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0,0,0,0.45)',
            'text-halo-width': 0.5,
          }}
        />
      </Source>
    </>
  );
}

export default memo(EvacuationZonesLayer);
