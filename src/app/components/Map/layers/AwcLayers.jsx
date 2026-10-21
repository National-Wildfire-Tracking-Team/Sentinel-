/**
 * AwcLayers.jsx
 * Every Aviation Weather Center map layer (Weather and All Hazards tabs),
 * drawn from AwcContext, bottom to top:
 *   advisory shapes (SIGMETs, CWAs, G-AIRMETs, Alaska AIRMETs, TCF), filtered
 *     by the drawer's hazard switches; freezing levels as labelled contours
 *   navigation points (airports, stations, navaids, fixes, obstacles, landmarks)
 *   pilot reports, coloured by the worst turbulence or icing reported
 *   airport weather: a dot per METAR station filled with its flight rules,
 *     ringed in the app theme's colour, with a wind barb off the dot
 * Clicking any of them opens it in the detail panel (awcRecords buildAwcRecord).
 */

import { memo, useLayoutEffect } from 'react';
import { Layer, Source, useMap } from 'react-map-gl';
import { useAwcContext } from '../../../context/AwcContext';
import { useOptionalTheme } from '../../../context/ThemeContext';
import { FLIGHT_CATEGORY_COLORS, HAZARD_COLOR_EXPRESSION, PIREP_SEVERITY_COLORS } from '../../../api/awc/awc';
import { attachBarbImages } from './awcWindBarbs';
import { ADVISORY_KEYS, srcId } from './awcRecords';

const NAV_STYLES = {
  awcAirports: { color: '#e5e7eb', radius: 3.5, label: ['coalesce', ['get', 'icaoId'], ['get', 'id']], labelZoom: 8 },
  awcStations: { color: '#94a3b8', radius: 3, label: ['coalesce', ['get', 'icaoId'], ['get', 'id']], labelZoom: 9 },
  awcNavaids: { color: '#2dd4bf', radius: 3.5, label: ['get', 'id'], labelZoom: 8 },
  awcFixes: { color: '#a3a3a3', radius: 2, label: ['get', 'id'], labelZoom: 11 },
  // AWC gives heights in metres.
  awcObstacles: { color: '#f87171', radius: 2.5, label: ['concat', ['to-string', ['round', ['*', ['to-number', ['get', 'height'], 0], 3.28084]]], ' ft'], labelZoom: 12 },
  awcFeatures: { color: '#facc15', radius: 3, label: ['get', 'name'], labelZoom: 10 },
};

/** Station dot ring and label halo per app theme. */
const THEME_RING = { dark: '#18181b', light: '#ffffff' };

function AdvisoryShapes({ sourceKey, data, hazardFilter }) {
  const id = srcId(sourceKey);
  const show = ['in', ['get', 'hz'], ['literal', hazardFilter]];
  const isTcf = sourceKey === 'awcTcf';
  const polygons = ['all', show, ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]];
  const lines = ['all', show, ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]]];
  return (
    <Source id={id} type="geojson" data={data}>
      <Layer
        id={`${id}-fill`}
        type="fill"
        filter={polygons}
        paint={{
          'fill-color': HAZARD_COLOR_EXPRESSION,
          // TCF shades by forecast coverage; the rest are outlines over a light tint.
          'fill-opacity': isTcf ? ['match', ['get', 'cov'], 'solid', 0.38, 'medium', 0.26, 0.16] : 0.16,
        }}
      />
      <Layer
        id={`${id}-outline`}
        type="line"
        filter={polygons}
        paint={{
          'line-color': HAZARD_COLOR_EXPRESSION,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.25, 8, 2.25],
          'line-opacity': 0.95,
        }}
      />
      {/* Freezing-level contours (G-AIRMET Zulu): lines, labelled with the level. */}
      <Layer
        id={`${id}-contour`}
        type="line"
        filter={lines}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': HAZARD_COLOR_EXPRESSION,
          'line-width': 2,
          'line-dasharray': [2, 1.5],
        }}
      />
      <Layer
        id={`${id}-contour-label`}
        type="symbol"
        filter={lines}
        minzoom={4}
        layout={{
          'symbol-placement': 'line',
          'text-field': ['case', ['has', 'level'], ['concat', 'FZL ', ['get', 'level']], ''],
          'text-size': 10,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        }}
        paint={{ 'text-color': '#bfdbfe', 'text-halo-color': 'rgba(9,9,11,0.9)', 'text-halo-width': 1.2 }}
      />
    </Source>
  );
}

function NavPoints({ sourceKey, data, ring }) {
  const id = srcId(sourceKey);
  const s = NAV_STYLES[sourceKey];
  return (
    <Source id={id} type="geojson" data={data}>
      <Layer
        id={`${id}-dot`}
        type="circle"
        paint={{
          'circle-radius': s.radius,
          'circle-color': s.color,
          'circle-stroke-color': ring,
          'circle-stroke-width': 1,
        }}
      />
      <Layer
        id={`${id}-label`}
        type="symbol"
        minzoom={s.labelZoom}
        layout={{
          'text-field': s.label,
          'text-size': 10,
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        }}
        paint={{ 'text-color': '#ffffff', 'text-halo-color': 'rgba(9,9,11,0.85)', 'text-halo-width': 1.1 }}
      />
    </Source>
  );
}

function PilotReports({ data, ring }) {
  const id = srcId('awcPirep');
  return (
    <Source id={id} type="geojson" data={data}>
      <Layer
        id={`${id}-dot`}
        type="circle"
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3.5, 8, 6],
          'circle-color': ['match', ['get', 'sev'], 0, PIREP_SEVERITY_COLORS[0], 1, PIREP_SEVERITY_COLORS[1],
            2, PIREP_SEVERITY_COLORS[2], 3, PIREP_SEVERITY_COLORS[3], PIREP_SEVERITY_COLORS[4]],
          // Urgent PIREPs (UUA) get a red ring.
          'circle-stroke-color': ['case', ['==', ['get', 'urgent'], true], '#ef4444', ring],
          'circle-stroke-width': ['case', ['==', ['get', 'urgent'], true], 2.25, 1.25],
        }}
      />
      <Layer
        id={`${id}-label`}
        type="symbol"
        minzoom={6}
        layout={{
          'text-field': ['concat', ['get', 'kind'],
            ['case', ['>', ['to-number', ['get', 'fltlvl'], 0], 0], ['concat', ' FL', ['to-string', ['get', 'fltlvl']]], '']],
          'text-size': 10,
          'text-offset': [0, 1],
          'text-anchor': 'top',
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        }}
        paint={{ 'text-color': '#ffffff', 'text-halo-color': 'rgba(9,9,11,0.85)', 'text-halo-width': 1.1 }}
      />
    </Source>
  );
}

function AirportWeather({ data, theme }) {
  const id = srcId('awcMetarTaf');
  return (
    <Source id={id} type="geojson" data={data}>
      {/* Barbs first, so the dot sits over the base of its staff. */}
      <Layer
        id={`${id}-barb`}
        type="symbol"
        filter={['>', ['get', 'barb'], 0]}
        minzoom={3}
        layout={{
          'icon-image': ['concat', 'awc-barb-', theme, '-', ['to-string', ['get', 'barb']]],
          'icon-rotate': ['get', 'wdir'],
          'icon-rotation-alignment': 'map',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 7, 1],
          // Crowded views thin barbs out (strongest winds kept); every dot still shows.
          'icon-allow-overlap': false,
          'icon-ignore-placement': true,
          'symbol-sort-key': ['-', 0, ['get', 'wspd']],
        }}
      />
      <Layer
        id={`${id}-dot`}
        type="circle"
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 6, 4.5, 9, 6, 12, 7],
          'circle-color': ['match', ['get', 'fltcat'],
            'VFR', FLIGHT_CATEGORY_COLORS.VFR, 'MVFR', FLIGHT_CATEGORY_COLORS.MVFR,
            'IFR', FLIGHT_CATEGORY_COLORS.IFR, 'LIFR', FLIGHT_CATEGORY_COLORS.LIFR, FLIGHT_CATEGORY_COLORS.UNK],
          'circle-stroke-color': THEME_RING[theme],
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 8, 1.75],
        }}
      />
      <Layer
        id={`${id}-label`}
        type="symbol"
        minzoom={8}
        layout={{
          'text-field': ['get', 'id'],
          'text-size': 10,
          'text-offset': [-0.6, 0.6],
          'text-anchor': 'top-right',
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        }}
        paint={{
          'text-color': theme === 'light' ? '#111827' : '#ffffff',
          'text-halo-color': theme === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(9,9,11,0.85)',
          'text-halo-width': 1.1,
        }}
      />
    </Source>
  );
}

const AwcLayers = memo(function AwcLayers() {
  const awc = useAwcContext();
  const theme = useOptionalTheme()?.theme === 'light' ? 'light' : 'dark';
  const { current: mapRef } = useMap();
  const map = mapRef?.getMap?.() ?? null;

  // Before any layer asks for a barb image (layout effects run ahead of the layers' effects).
  useLayoutEffect(() => attachBarbImages(map), [map]);

  if (!awc?.active) return null;
  const { visible, sources, hazardFilter } = awc;
  const ring = THEME_RING[theme];

  return (
    <>
      {ADVISORY_KEYS.map((key) => (visible[key] ? (
        <AdvisoryShapes key={key} sourceKey={key} data={sources[key]} hazardFilter={hazardFilter} />
      ) : null))}
      {Object.keys(NAV_STYLES).map((key) => (visible[key] ? (
        <NavPoints key={key} sourceKey={key} data={sources[key]} ring={ring} />
      ) : null))}
      {visible.awcPirep && <PilotReports data={sources.awcPirep} ring={ring} />}
      {visible.awcMetarTaf && <AirportWeather data={sources.awcMetarTaf} theme={theme} />}
    </>
  );
});

export default AwcLayers;
