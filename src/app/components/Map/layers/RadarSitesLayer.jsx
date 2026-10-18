/**
 * RadarSitesLayer.jsx
 * Radar Site layer (Weather tab): every NEXRAD (WSR-88D) and TDWR station as
 * a small pill holding its station ID (gray; red when NWS reports it down;
 * the selected one in the Weather tab's blue) (RadarSitesLayer, pinned near the
 * top by layerStack.js), and the latest sweep from the one selected station
 * (RadarSiteSweepLayer: true polar gates via a custom WebGL layer, beneath
 * place labels with the other radar imagery).
 * Data and selection come from RadarSiteContext; clicks are routed through
 * MapView's handleClick (RADAR_SITES_PILL_ID).
 *
 * The pill is a stretchable image (icon-text-fit), so each pill hugs its ID.
 * It is re-registered whenever the basemap style reloads.
 */

import { useEffect, useMemo, useState } from 'react';
import { Layer, Source, useMap } from 'react-map-gl';
import { useRadarSiteContext } from '../../../context/RadarSiteContext';
import { createRadarSweepLayer } from './radarSweepLayer';
import { DBZ_MAX } from '../../../utils/radarSweep';

export const RADAR_SITES_PILL_ID = 'radar-sites-pill';

const PILL = 'radar-site-pill';
const PILL_SELECTED = 'radar-site-pill-selected';
const PILL_DOWN = 'radar-site-pill-down';
const EMPTY = { type: 'FeatureCollection', features: [] };

const SWEEP_LAYER_ID = 'radar-site-sweep';

/** Draw a rounded-capsule image Mapbox can stretch around the label. */
function pillImage({ fill, stroke }) {
  const ratio = 2;
  const h = 16 * ratio;
  const w = 24 * ratio;
  const r = h / 2;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const lw = 1 * ratio;
  ctx.beginPath();
  ctx.roundRect(lw / 2, lw / 2, w - lw, h - lw, r - lw / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  return {
    image: ctx.getImageData(0, 0, w, h),
    options: {
      pixelRatio: ratio,
      stretchX: [[r, w - r]],
      stretchY: [[r - 1, r + 1]],
      content: [r * 0.6, 2, w - r * 0.6, h - 2],
    },
  };
}

const PILL_STYLES = {
  [PILL]: { fill: 'rgba(75, 85, 99, 0.88)', stroke: 'rgba(255, 255, 255, 0.28)' },
  [PILL_SELECTED]: { fill: 'rgba(2, 132, 199, 0.96)', stroke: 'rgba(255, 255, 255, 0.9)' }, // sky-600, the Weather tab
  [PILL_DOWN]: { fill: 'rgba(220, 38, 38, 0.9)', stroke: 'rgba(255, 255, 255, 0.35)' }, // red-600
};

function usePillImages() {
  const { current } = useMap();
  useEffect(() => {
    const map = current?.getMap();
    if (!map) return undefined;
    const add = (id) => {
      if (!PILL_STYLES[id] || map.hasImage(id)) return;
      const { image, options } = pillImage(PILL_STYLES[id]);
      map.addImage(id, image, options);
    };
    const addAll = () => Object.keys(PILL_STYLES).forEach(add);
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

function firstLabelLayer(map) {
  try {
    return map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
  } catch {
    return undefined;
  }
}

/**
 * The selected station's latest sweep, drawn as polar gates by a custom
 * WebGL layer (radarSweepLayer.js) beneath place labels and the pills.
 */
export function RadarSiteSweepLayer() {
  const { current } = useMap();
  const radar = useRadarSiteContext();
  const sweep = radar?.active ? radar.sweep : null;
  const [layer] = useState(() => createRadarSweepLayer(SWEEP_LAYER_ID));
  const show = Boolean(sweep);

  // Mount the custom layer while there is a sweep; re-add it after basemap style reloads.
  useEffect(() => {
    const map = current?.getMap();
    if (!map || !show) return undefined;
    const add = () => {
      try {
        if (!map.getLayer(SWEEP_LAYER_ID)) map.addLayer(layer, firstLabelLayer(map));
      } catch {
        // Style not ready yet; the next styledata event retries.
      }
    };
    add();
    map.on('styledata', add);
    return () => {
      map.off('styledata', add);
      if (map.getStyle() && map.getLayer(SWEEP_LAYER_ID)) map.removeLayer(SWEEP_LAYER_ID);
    };
  }, [current, show, layer]);

  useEffect(() => { layer.setSweep(sweep); }, [layer, sweep]);
  const low = radar?.dbzLow ?? 0;
  const high = radar?.dbzHigh ?? DBZ_MAX;
  const opacity = radar?.opacity ?? 1;
  // The Reflectivity Gates filter is in dBZ: other products draw every gate.
  const filtered = radar?.kind === 'reflectivity';
  useEffect(() => {
    if (filtered) layer.setValueRange(low, high >= DBZ_MAX ? null : high);
    else layer.setValueRange(null, null);
  }, [layer, filtered, low, high]);
  useEffect(() => { layer.setOpacity(opacity); }, [layer, opacity]);

  return null;
}

/** Station pills. */
export default function RadarSitesLayer() {
  const radar = useRadarSiteContext();
  usePillImages();
  const { active, sites, selectedId, downIds } = radar ?? {};

  const geoJSON = useMemo(() => (sites ? {
    type: 'FeatureCollection',
    features: sites.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { id: s.id, type: s.type, place: s.place, state: s.state, down: Boolean(downIds?.has(s.id)) },
    })),
  } : EMPTY), [sites, downIds]);

  const vis = active ? 'visible' : 'none';
  const selected = selectedId ?? '';

  return (
    <Source id="radar-sites" type="geojson" data={geoJSON}>
      <Layer
        id={RADAR_SITES_PILL_ID}
        type="symbol"
        layout={{
          visibility: vis,
          'text-field': ['get', 'id'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 10,
          'text-letter-spacing': 0.04,
          'icon-image': ['case', ['==', ['get', 'id'], selected], PILL_SELECTED, ['get', 'down'], PILL_DOWN, PILL],
          'icon-text-fit': 'both',
          'icon-text-fit-padding': [1, 3, 1, 3],
          // Placed first, so the selected station wins collisions; the rest thin out when zoomed out.
          'symbol-sort-key': ['case', ['==', ['get', 'id'], selected], 0, 1],
          'icon-padding': 1,
        }}
        paint={{
          'text-color': '#ffffff',
        }}
      />
    </Source>
  );
}
