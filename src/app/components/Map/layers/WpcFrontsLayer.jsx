/**
 * WpcFrontsLayer.jsx
 * Renders WPC surface-analysis fronts (Day 1-3) using standardized surface
 * chart symbology: cold (blue triangles), warm (red semicircles), occluded
 * (purple, alternating semicircle/triangle), stationary (alternating red
 * semicircle / blue triangle on opposite sides) — plus trough (amber
 * dashed, no pips). The colored/dashed line itself is drawn by two Layers
 * split on the pre-computed `dashed` boolean (line-dasharray isn't
 * data-driven in MapLibre); the pips are a separate symbol layer built by
 * `buildFrontPipPoints`, since a repeating line-pattern can't rotate to
 * follow a curving line.
 */

import { memo, useEffect, useMemo, useState } from 'react';
import { Source, Layer, useMap } from 'react-map-gl';
import { buildFrontPipPoints, buildIconSvg, buildStationaryLineSegments, FRONT_ICON_DEFS } from './frontSymbols';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const LINE_COLOR_FALLBACK = [
  'match', ['get', 'frontType'],
  'COLD',       '#2E6FDB',
  'WARM',       '#DB2E2E',
  'STATIONARY', '#9B59B6',
  'OCCLUDED',   '#7B4FA6',
  'TROUGH',     '#D97706',
  '#9B59B6',
];

const LINE_COLOR = ['case', ['!=', ['get', 'color'], null], ['get', 'color'], LINE_COLOR_FALLBACK];
// Stationary fronts are rendered by their own alternating red/blue segment
// layer below, so they're filtered out of both of these.
const NOT_STATIONARY = ['!=', ['get', 'frontType'], 'STATIONARY'];
const LINE_WIDTH = ['interpolate', ['linear'], ['zoom'], 3, 2.2, 7, 3.4, 10, 4.6];
const PIP_ICON_SIZE = ['interpolate', ['linear'], ['zoom'], 3, 0.7, 7, 1.05, 10, 1.4];

const WpcFrontsLayer = memo(function WpcFrontsLayer({ geoJSON, visible }) {
  const { current: map } = useMap();
  const [iconsReady, setIconsReady] = useState(false);
  const vis = visible ? 'visible' : 'none';

  useEffect(() => {
    if (!map) return;

    function registerIcons() {
      const entries = Object.entries(FRONT_ICON_DEFS);
      const missing = entries.filter(([id]) => !map.hasImage(id));
      if (missing.length === 0) {
        setIconsReady(true);
        return;
      }
      let pending = missing.length;
      missing.forEach(([id, def]) => {
        const img = new Image(22, 32);
        img.onload = () => {
          if (!map.hasImage(id)) {
            try {
              map.addImage(id, img);
            } catch {
              // ignore — style may have reloaded mid-flight
            }
          }
          pending -= 1;
          if (pending <= 0) setIconsReady(true);
        };
        img.src = `data:image/svg+xml;base64,${btoa(buildIconSvg(def))}`;
      });
    }

    function onStyleData() {
      const missingAny = Object.keys(FRONT_ICON_DEFS).some((id) => !map.hasImage(id));
      if (missingAny) {
        setIconsReady(false);
        registerIcons();
      }
    }

    map.on('styledata', onStyleData);
    if (map.isStyleLoaded()) registerIcons();

    return () => map.off('styledata', onStyleData);
  }, [map]);

  const pipGeoJSON = useMemo(() => buildFrontPipPoints(geoJSON || EMPTY_GEOJSON), [geoJSON]);
  const stationaryGeoJSON = useMemo(
    () => buildStationaryLineSegments(geoJSON || EMPTY_GEOJSON),
    [geoJSON]
  );

  return (
    <>
      <Source id="wpc-fronts" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
        <Layer
          id="wpc-fronts-solid"
          type="line"
          source="wpc-fronts"
          filter={['all', ['!=', ['get', 'dashed'], true], NOT_STATIONARY]}
          layout={{ visibility: vis, 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': LINE_COLOR, 'line-opacity': 0.9, 'line-width': LINE_WIDTH }}
        />
        <Layer
          id="wpc-fronts-dashed"
          type="line"
          source="wpc-fronts"
          filter={['all', ['==', ['get', 'dashed'], true], NOT_STATIONARY]}
          layout={{ visibility: vis, 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': LINE_COLOR,
            'line-opacity': 0.9,
            'line-width': LINE_WIDTH,
            'line-dasharray': [2, 1.5],
          }}
        />
      </Source>
      <Source id="wpc-fronts-stationary" type="geojson" data={stationaryGeoJSON}>
        <Layer
          id="wpc-fronts-stationary-line"
          type="line"
          source="wpc-fronts-stationary"
          layout={{ visibility: vis, 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': ['get', 'color'], 'line-opacity': 0.9, 'line-width': LINE_WIDTH }}
        />
      </Source>
      <Source id="wpc-fronts-pips" type="geojson" data={pipGeoJSON}>
        {iconsReady && (
          <Layer
            id="wpc-fronts-pips-symbol"
            type="symbol"
            source="wpc-fronts-pips"
            layout={{
              visibility: vis,
              'icon-image': ['get', 'icon'],
              'icon-rotate': ['get', 'bearing'],
              'icon-rotation-alignment': 'map',
              'icon-anchor': 'bottom',
              'icon-size': PIP_ICON_SIZE,
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            }}
          />
        )}
      </Source>
    </>
  );
});

export default WpcFrontsLayer;
