/**
 * HazardEventsLayer.jsx
 * Renders community-submitted hazard event pins on the map — wildfire,
 * flooding, hazmat, and other. Each category gets its own pin gradient +
 * glyph, registered as a Mapbox image (same pattern as FlightLayer's
 * airplane icon) and driven by a single symbol layer keyed off `category`.
 */

import { useState, useEffect, memo } from 'react';
import { Source, Layer, useMap } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

/** Solid swatch per category — used by the Legend, not the map pins themselves. */
export const HAZARD_CATEGORY_COLORS = {
  wildfire: '#ff4500',
  flooding: '#1e73e0',
  hazmat:   '#7c3aed',
  other:    '#6b7280',
};

// Teardrop pin outline shared by every category — only the fill gradient
// and inner glyph change.
const PIN_PATH = 'M32 3C18 3 7 14 7 27c0 19 25 34 25 34s25-15 25-34C57 14 46 3 32 3z';

const ICON_DEFS = {
  wildfire: {
    id: 'sentinel-hazard-wildfire',
    gradient: ['#ffb020', '#ff4500'],
    glyph: `<path d="M32 14c2 5-1 7-3 10-2 3-1 6 1 6 2 0 3-2 2-4 4 2 6 6 6 10 0 6-5 11-11 11s-11-5-11-11c0-4 2-7 4-10 1 2 2 3 3 2 1-1 0-3-1-5-1-4 1-7 6-9z" fill="#fff7ec"/>`,
  },
  flooding: {
    id: 'sentinel-hazard-flooding',
    gradient: ['#69c3ff', '#1e73e0'],
    glyph: `<path d="M13 23c3-3 6-3 9 0s6 3 9 0 6-3 9 0 6 3 9 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
            <path d="M13 32c3-3 6-3 9 0s6 3 9 0 6-3 9 0 6 3 9 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`,
  },
  hazmat: {
    id: 'sentinel-hazard-hazmat',
    gradient: ['#c8a2ff', '#7c3aed'],
    glyph: `<path d="M32 13 46 35H18z" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
            <rect x="30.4" y="22" width="3.2" height="7.5" rx="1.4" fill="#fff"/>
            <rect x="30.4" y="31.3" width="3.2" height="3.2" rx="1.4" fill="#fff"/>`,
  },
  other: {
    id: 'sentinel-hazard-other',
    gradient: ['#c7cbd1', '#6b7280'],
    glyph: `<circle cx="32" cy="19" r="2.6" fill="#fff"/>
            <rect x="29.6" y="24" width="4.8" height="12" rx="2.2" fill="#fff"/>`,
  },
};

function buildSvg({ gradient, glyph }, gradId) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${gradient[0]}"/>
        <stop offset="1" stop-color="${gradient[1]}"/>
      </linearGradient>
    </defs>
    <path d="${PIN_PATH}" fill="url(#${gradId})" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>
    <circle cx="32" cy="27" r="16" fill="rgba(255,255,255,0.14)"/>
    ${glyph}
  </svg>`;
}

const CATEGORY_ICON = [
  'match', ['get', 'category'],
  'wildfire', ICON_DEFS.wildfire.id,
  'flooding', ICON_DEFS.flooding.id,
  'hazmat',   ICON_DEFS.hazmat.id,
  ICON_DEFS.other.id,
];

const HazardEventsLayer = memo(function HazardEventsLayer({ geoJSON, visible }) {
  const { current: map } = useMap();
  const [iconsReady, setIconsReady] = useState(false);

  useEffect(() => {
    if (!map) return;

    function registerIcons() {
      const entries = Object.entries(ICON_DEFS);
      const missing = entries.filter(([, def]) => !map.hasImage(def.id));
      if (missing.length === 0) {
        setIconsReady(true);
        return;
      }
      let pending = missing.length;
      missing.forEach(([key, def]) => {
        const img = new Image(64, 64);
        img.onload = () => {
          if (!map.hasImage(def.id)) {
            try {
              map.addImage(def.id, img);
            } catch {
              // ignore — style may have reloaded mid-flight
            }
          }
          pending -= 1;
          if (pending <= 0) setIconsReady(true);
        };
        img.src = `data:image/svg+xml;base64,${btoa(buildSvg(def, `grad-${key}`))}`;
      });
    }

    // Re-register whenever the style reloads (satellite ↔ rendered toggle)
    function onStyleData() {
      const missingAny = Object.values(ICON_DEFS).some((def) => !map.hasImage(def.id));
      if (missingAny) {
        setIconsReady(false);
        registerIcons();
      }
    }

    map.on('styledata', onStyleData);
    if (map.isStyleLoaded()) registerIcons();

    return () => map.off('styledata', onStyleData);
  }, [map]);

  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="hazard-events" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      {iconsReady && (
        <Layer
          id="hazard-events-circle"
          type="symbol"
          source="hazard-events"
          layout={{
            visibility: vis,
            'icon-image': CATEGORY_ICON,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.35, 8, 0.55, 12, 0.75],
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'text-field': ['step', ['zoom'], '', 7, ['get', 'title']],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 11,
            'text-anchor': 'top',
            'text-offset': [0, 0.6],
            'text-max-width': 10,
            'text-optional': true,
            'text-allow-overlap': false,
          }}
          paint={{
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0,0,0,0.85)',
            'text-halo-width': 1.5,
          }}
        />
      )}
    </Source>
  );
});
export default HazardEventsLayer;
