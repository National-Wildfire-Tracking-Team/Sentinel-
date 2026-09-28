/**
 * HazardEventsLayer.jsx
 * Renders community-submitted hazard event pins on the map — wildfire,
 * hazmat, hazard, and flooding. Each category gets its own pin gradient +
 * glyph, registered as a Mapbox image and driven by a single symbol layer
 * keyed off `category`.
 */

import { useState, useEffect, memo } from 'react';
import { Source, Layer, useMap } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

/** Solid swatch per category — used by the Legend, not the map pins themselves. */
export const HAZARD_CATEGORY_COLORS = {
  wildfire: '#ff4500',
  hazmat:   '#7c3aed',
  hazard:   '#eab308',
  flooding: '#1e73e0',
};

/** Display order + labels for the four incident types (map legend, popups). */
export const HAZARD_CATEGORY_LABELS = {
  wildfire: 'Wildfire',
  hazmat:   'Hazmat',
  hazard:   'Hazard',
  flooding: 'Flooding',
};

// Teardrop pin outline shared by every category — only the fill gradient
// and inner glyph change.
const PIN_PATH = 'M32 3C18 3 7 14 7 27c0 19 25 34 25 34s25-15 25-34C57 14 46 3 32 3z';

// Wraps a 24×24 lucide-style stroke icon so it sits centered in the pin head
// (circle at 32,27), matching the icons used in the reporter dashboard.
function lucideGlyph(paths, color = '#fff') {
  return `<g transform="translate(18 13) scale(1.1667)" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
}

const ICON_DEFS = {
  wildfire: {
    id: 'sentinel-hazard-wildfire',
    gradient: ['#ffb020', '#ff4500'],
    glyph: `<path d="M32 14c2 5-1 7-3 10-2 3-1 6 1 6 2 0 3-2 2-4 4 2 6 6 6 10 0 6-5 11-11 11s-11-5-11-11c0-4 2-7 4-10 1 2 2 3 3 2 1-1 0-3-1-5-1-4 1-7 6-9z" fill="#fff7ec"/>`,
  },
  // Biohazard trefoil
  hazmat: {
    id: 'sentinel-hazard-hazmat',
    gradient: ['#c8a2ff', '#7c3aed'],
    glyph: lucideGlyph(`
      <circle cx="12" cy="11.9" r="2"/>
      <path d="M6.7 3.4c-.9 2.5 0 5.2 2.2 6.7C6.5 9 3.7 9.6 2 11.6"/>
      <path d="m8.9 10.1 1.4.8"/>
      <path d="M17.3 3.4c.9 2.5 0 5.2-2.2 6.7 2.4-1.2 5.2-.6 6.9 1.5"/>
      <path d="m15.1 10.1-1.4.8"/>
      <path d="M16.7 20.8c-2.6-.4-4.6-2.6-4.7-5.3-.2 2.6-2.1 4.8-4.7 5.2"/>
      <path d="M12 13.9v1.6"/>
      <path d="M13.5 5.4c-1-.2-2-.2-3 0"/>
      <path d="M17 16.4c.7-.7 1.2-1.6 1.5-2.5"/>
      <path d="M5.5 13.9c.3.9.8 1.8 1.5 2.5"/>`),
  },
  // Warning triangle with exclamation — dark glyph for contrast on yellow
  hazard: {
    id: 'sentinel-hazard-hazard',
    gradient: ['#fde047', '#ca8a04'],
    glyph: lucideGlyph(`
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
      <path d="M12 9v4"/>
      <path d="M12 17h.01"/>`, '#1c1400'),
  },
  // Stacked water waves
  flooding: {
    id: 'sentinel-hazard-flooding',
    gradient: ['#69c3ff', '#1e73e0'],
    glyph: lucideGlyph(`
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>`),
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

function svgDataUrl(key) {
  return `data:image/svg+xml;base64,${btoa(buildSvg(ICON_DEFS[key], `grad-${key}`))}`;
}

/** Data URL of a category's map pin, so the Legend shows the exact same icon. */
export function hazardPinDataUrl(category) {
  return ICON_DEFS[category] ? svgDataUrl(category) : svgDataUrl('hazard');
}

const CATEGORY_ICON = [
  'match', ['get', 'category'],
  'wildfire', ICON_DEFS.wildfire.id,
  'hazmat',   ICON_DEFS.hazmat.id,
  'flooding', ICON_DEFS.flooding.id,
  ICON_DEFS.hazard.id,
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
        img.src = svgDataUrl(key);
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
