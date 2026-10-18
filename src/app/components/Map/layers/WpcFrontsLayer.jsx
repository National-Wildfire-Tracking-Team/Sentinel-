/**
 * WpcFrontsLayer.jsx
 * WPC surface fronts and pressure centers drawn the way NOAA's surface
 * analysis maps draw them:
 *   - fronts as repeating line patterns (frontSymbols.js): blue triangles
 *     (cold), red semicircles (warm), purple alternating (occluded),
 *     red/blue alternating on opposite sides (stationary), open brown
 *     semicircles (dryline) — symbols facing the way the front moves;
 *   - troughs as dashed brown lines, squall lines as dash-dot purple;
 *   - highs as a blue "H" and lows as a red "L", with the central pressure
 *     (mb) beneath when the source gives it (the live analysis does).
 */

import { memo, useEffect } from 'react';
import { Source, Layer, useMap } from 'react-map-gl';
import { FRONT_PATTERNS, PATTERN_BY_TYPE, TILE_HEIGHT, renderFrontPattern } from './frontSymbols';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const PATTERNED = ['has', ['get', 'frontType'], ['literal', PATTERN_BY_TYPE]];
const LINE_PATTERN = ['get', ['get', 'frontType'], ['literal', PATTERN_BY_TYPE]];
// The pattern tile is scaled to the line's width, so this sets the symbols' size.
const PATTERN_WIDTH = ['interpolate', ['linear'], ['zoom'], 2, TILE_HEIGHT * 0.75, 5, TILE_HEIGHT, 8, TILE_HEIGHT * 1.15, 11, TILE_HEIGHT * 1.3];
const PLAIN_WIDTH = ['interpolate', ['linear'], ['zoom'], 2, 1.6, 6, 2.4, 10, 3.2];

const HL_COLOR = ['match', ['get', 'kind'], 'H', '#0050FF', '#FF0000'];
const HL_TEXT = [
  'case',
  ['!=', ['get', 'pressure'], null],
  ['format', ['get', 'kind'], { 'font-scale': 1 }, '\n', {}, ['to-string', ['get', 'pressure']], { 'font-scale': 0.5 }],
  ['get', 'kind'],
];

/** Register the pattern tiles with the map, and again whenever the style reloads. */
function useFrontPatterns() {
  const { current } = useMap();
  useEffect(() => {
    const map = current?.getMap();
    if (!map) return undefined;
    const add = (id) => {
      if (!FRONT_PATTERNS[id] || map.hasImage(id)) return;
      const { image, options } = renderFrontPattern(id);
      map.addImage(id, image, options);
    };
    const addAll = () => Object.keys(FRONT_PATTERNS).forEach(add);
    const onMissing = (e) => add(e.id);
    if (map.isStyleLoaded()) addAll();
    map.on('style.load', addAll);
    map.on('styleimagemissing', onMissing);
    return () => {
      map.off('style.load', addAll);
      map.off('styleimagemissing', onMissing);
    };
  }, [current]);
}

const WpcFrontsLayer = memo(function WpcFrontsLayer({ geoJSON, centers, visible }) {
  useFrontPatterns();
  const vis = visible ? 'visible' : 'none';

  return (
    <>
      <Source id="wpc-fronts" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
        {/* Troughs (dashed brown) and squall lines (dash-dot purple): no symbols */}
        <Layer
          id="wpc-fronts-dashed"
          type="line"
          filter={['all', ['!', PATTERNED], ['==', ['get', 'frontType'], 'TROUGH']]}
          layout={{ visibility: vis, 'line-cap': 'butt', 'line-join': 'round' }}
          paint={{ 'line-color': ['coalesce', ['get', 'color'], '#D2691E'], 'line-width': PLAIN_WIDTH, 'line-dasharray': [3, 2] }}
        />
        <Layer
          id="wpc-fronts-squall"
          type="line"
          filter={['==', ['get', 'frontType'], 'SQUALL']}
          layout={{ visibility: vis, 'line-cap': 'butt', 'line-join': 'round' }}
          paint={{ 'line-color': ['coalesce', ['get', 'color'], '#A020F0'], 'line-width': PLAIN_WIDTH, 'line-dasharray': [4, 1.5, 1, 1.5] }}
        />
        {/* Cold, warm, occluded, stationary, dryline: line + symbols in one pattern */}
        <Layer
          id="wpc-fronts-solid"
          type="line"
          filter={PATTERNED}
          layout={{ visibility: vis, 'line-cap': 'butt', 'line-join': 'round' }}
          paint={{ 'line-pattern': LINE_PATTERN, 'line-width': PATTERN_WIDTH }}
        />
      </Source>

      {/* Highs and lows */}
      <Source id="wpc-pressure-centers" type="geojson" data={centers || EMPTY_GEOJSON}>
        <Layer
          id="wpc-pressure-centers-label"
          type="symbol"
          layout={{
            visibility: vis,
            'text-field': HL_TEXT,
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 2, 20, 6, 28, 10, 34],
            'text-line-height': 0.95,
            'text-anchor': 'top',
            'text-offset': [0, -0.55], // the letter's center on the point, pressure beneath
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          }}
          paint={{
            'text-color': HL_COLOR,
            'text-halo-color': 'rgba(255,255,255,0.9)',
            'text-halo-width': 1.4,
          }}
        />
      </Source>
    </>
  );
});

export default WpcFrontsLayer;
