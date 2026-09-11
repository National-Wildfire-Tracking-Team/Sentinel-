/**
 * NexradSitesLayer.jsx
 * NWS NEXRAD (WSR-88D) Level 2 radar site locations, rendered as small pill
 * markers sized to fit each station's ID text (icon-text-fit: 'width' against
 * a single stretchable SDF capsule icon, so the pill hugs the text instead of
 * a separate fixed-size dot + label). Gray by default, green when the site is
 * selected (selectRadarSite / selectedRadarSite in AppContext), red when the
 * site is out of service (status === 'offline', see nexradSites.js).
 *
 * Kept as one interactive layer id, `nexrad-sites-circle`, matching the prior
 * circle layer's id — MapView.jsx's interactiveLayerIds/click/hover handling
 * all key off that id and don't need to change just because the underlying
 * Mapbox layer type moved from `circle` to `symbol`.
 */

import { useEffect, useState, memo } from 'react';
import { Source, Layer, useMap } from 'react-map-gl';

const EMPTY = { type: 'FeatureCollection', features: [] };
const MIN_ZOOM = 0;

// Capsule SDF icon registered once per style load, then recolored per-feature
// via the `icon-color` paint expression below. stretchX marks the flat middle
// (excluding the two fully-rounded end caps) as the only horizontally
// stretchable region, so icon-text-fit: 'width' can grow the pill to match
// varying station-ID lengths (e.g. "KTLX" vs "KAMA") without squashing the
// rounded ends.
const PILL_ICON_ID = 'sentinel-nexrad-pill';
const PILL_WIDTH = 36;
const PILL_HEIGHT = 16;
const PILL_RADIUS = PILL_HEIGHT / 2;

const GRAY = '#9ca3af';
const GREEN = '#22c55e';
const RED = '#ef4444';

function buildPillImageData() {
  const canvas = document.createElement('canvas');
  canvas.width = PILL_WIDTH;
  canvas.height = PILL_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.roundRect(0, 0, PILL_WIDTH, PILL_HEIGHT, PILL_RADIUS);
  ctx.fill();
  return ctx.getImageData(0, 0, PILL_WIDTH, PILL_HEIGHT);
}

function registerPillIcon(map) {
  if (map.hasImage(PILL_ICON_ID)) return;
  try {
    map.addImage(PILL_ICON_ID, buildPillImageData(), {
      sdf: true,
      stretchX: [[PILL_RADIUS, PILL_WIDTH - PILL_RADIUS]],
      content: [PILL_RADIUS, 0, PILL_WIDTH - PILL_RADIUS, PILL_HEIGHT],
    });
  } catch {
    // ignore — style may have reloaded mid-flight
  }
}

const NexradSitesLayer = memo(function NexradSitesLayer({ geoJSON, visible, selectedId }) {
  const { current: map } = useMap();
  const [iconReady, setIconReady] = useState(false);

  useEffect(() => {
    if (!map) return;

    function ensureIcon() {
      registerPillIcon(map);
      setIconReady(map.hasImage(PILL_ICON_ID));
    }

    // Re-register whenever the style reloads (satellite ↔ rendered toggle)
    function onStyleData() {
      if (!map.hasImage(PILL_ICON_ID)) {
        setIconReady(false);
        ensureIcon();
      }
    }

    map.on('styledata', onStyleData);
    if (map.isStyleLoaded()) ensureIcon();

    return () => map.off('styledata', onStyleData);
  }, [map]);

  const vis = visible && iconReady ? 'visible' : 'none';
  const data = geoJSON || EMPTY;

  const pillColor = [
    'case',
    ['==', ['get', 'id'], selectedId ?? '__none_selected__'], GREEN,
    ['==', ['get', 'status'], 'offline'], RED,
    GRAY,
  ];

  return (
    <Source id="nexrad-sites" type="geojson" data={data}>
      <Layer
        id="nexrad-sites-circle"
        type="symbol"
        minzoom={MIN_ZOOM}
        layout={{
          visibility: vis,
          'icon-image': PILL_ICON_ID,
          'icon-text-fit': 'width',
          'icon-text-fit-padding': [2, 2, 2, 2],
          'text-field': ['get', 'id'],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': 9,
          'symbol-sort-key': ['case', ['==', ['get', 'id'], selectedId ?? '__none_selected__'], 0, 1],
        }}
        paint={{
          'icon-color': pillColor,
          'text-color': '#0b0f14',
        }}
      />
    </Source>
  );
});

export default NexradSitesLayer;
