/**
 * CaliforniaCamerasLayer.jsx
 * Live California highway CCTV camera locations (Caltrans District CCTV
 * network). Renders as teal dot markers with a small white camera glyph
 * on top (same icon-registration pattern as HazardEventsLayer) so they
 * read as cameras at a glance rather than generic dots. Cameras
 * Caltrans reports as out of service get a red X over the dot instead of
 * the camera glyph. Hovering shows name/route/direction/status in
 * MapView's HoverTooltip, click opens CameraPanel with the live still image.
 */

import { memo, useEffect, useState } from 'react';
import { Source, Layer, useMap } from 'react-map-gl';

const EMPTY = { type: 'FeatureCollection', features: [] };
const CAMERA_COLOR = '#14b8a6';
const DOWN_COLOR = '#ef4444';
const CAMERA_ICON_ID = 'sentinel-camera-glyph';
const DOWN_ICON_ID = 'sentinel-camera-down';

// Simple camera silhouette in white; the lens is punched out in the same
// teal as the dot fill so it reads as a lens hole once layered on top of
// the circle layer beneath it.
const CAMERA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect x="8" y="22" width="48" height="30" rx="6" fill="#ffffff"/>
  <rect x="24" y="13" width="16" height="10" rx="3" fill="#ffffff"/>
  <circle cx="32" cy="37" r="9" fill="${CAMERA_COLOR}"/>
</svg>`;

// Red X for cameras Caltrans reports as out of service.
const DOWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <path d="M14 14 L50 50 M50 14 L14 50" stroke="${DOWN_COLOR}" stroke-width="10" stroke-linecap="round"/>
</svg>`;

const ICON_DEFS = { [CAMERA_ICON_ID]: CAMERA_SVG, [DOWN_ICON_ID]: DOWN_SVG };

const CaliforniaCamerasLayer = memo(function CaliforniaCamerasLayer({ geoJSON, visible }) {
  const { current: map } = useMap();
  const [iconsReady, setIconsReady] = useState(false);

  useEffect(() => {
    if (!map) return undefined;

    function registerIcons() {
      const entries = Object.entries(ICON_DEFS);
      const missing = entries.filter(([id]) => !map.hasImage(id));
      if (missing.length === 0) {
        setIconsReady(true);
        return;
      }
      let pending = missing.length;
      missing.forEach(([id, svg]) => {
        const img = new Image(64, 64);
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
        img.src = `data:image/svg+xml;base64,${btoa(svg)}`;
      });
    }

    // Re-register whenever the style reloads (satellite ↔ rendered toggle)
    function onStyleData() {
      const missingAny = Object.keys(ICON_DEFS).some((id) => !map.hasImage(id));
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
  const data = geoJSON || EMPTY;

  return (
    <Source id="ca-cameras" type="geojson" data={data}>
      {/* Glow ring */}
      <Layer
        id="ca-cameras-glow"
        type="circle"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 5, 5, 9, 10, 18],
          'circle-color': CAMERA_COLOR,
          'circle-opacity': 0.16,
          'circle-blur': 0.7,
          'circle-stroke-width': 0,
        }}
      />

      {/* Main camera dot – interactive target */}
      <Layer
        id="ca-cameras-circle"
        type="circle"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 3, 5, 4, 8, 6, 12, 8],
          'circle-color': CAMERA_COLOR,
          'circle-opacity': 0.95,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        }}
      />

      {/* Small camera glyph layered on top of the dot — in-service cameras only */}
      {iconsReady && (
        <Layer
          id="ca-cameras-icon"
          type="symbol"
          filter={['==', ['get', 'inService'], true]}
          layout={{
            visibility: vis,
            'icon-image': CAMERA_ICON_ID,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 0, 0.09, 5, 0.12, 8, 0.17, 12, 0.24],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          }}
        />
      )}

      {/* Red X over the dot — cameras Caltrans reports as out of service */}
      {iconsReady && (
        <Layer
          id="ca-cameras-down-icon"
          type="symbol"
          filter={['==', ['get', 'inService'], false]}
          layout={{
            visibility: vis,
            'icon-image': DOWN_ICON_ID,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 0, 0.1, 5, 0.13, 8, 0.19, 12, 0.26],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          }}
        />
      )}

      {/* Route / location label — only at closer zoom, keeps map legible
          given how dense the camera network is along freeways. */}
      <Layer
        id="ca-cameras-label"
        type="symbol"
        minzoom={9}
        layout={{
          visibility: vis,
          'text-field': ['get', 'route'],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': 10,
          'text-anchor': 'top',
          'text-offset': [0, 0.8],
          'text-allow-overlap': false,
          'text-optional': true,
        }}
        paint={{
          'text-color': CAMERA_COLOR,
          'text-halo-color': 'rgba(0,0,0,0.85)',
          'text-halo-width': 1.4,
        }}
      />
    </Source>
  );
});

export default CaliforniaCamerasLayer;
