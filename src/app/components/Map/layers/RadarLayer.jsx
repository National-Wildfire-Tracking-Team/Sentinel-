/**
 * RadarLayer.jsx
 * Composite Radar layer — national reflectivity mosaic. Primary source is
 * Sentinel's own NOAA MRMS ingestion pipeline (scripts/mrms-radar-sync.mjs);
 * falls back to the Iowa Environmental Mesonet NEXRAD N0Q WMS mosaic when
 * the MRMS frame is stale or unavailable, per Sentinel's radar architecture
 * (the fallback stays in place until MRMS has proven stable in production —
 * not removed in this phase). Layer stays mounted; visibility is controlled
 * via layout property.
 *
 * Fully independent of the NEXRAD Level II layer (NexradScanLayer /
 * NexradSitesLayer) — this component only ever reads `layers.radarComposite`
 * upstream, never NEXRAD site/product state.
 */

import { memo, useEffect, useRef, useState } from 'react';
import { Source, Layer } from 'react-map-gl';

// IEM NEXRAD composite reflectivity (N0Q) — all CONUS WSR-88D stations.
// Fallback source only — see module doc comment.
const IEM_NEXRAD_WMS =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi' +
  '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=nexrad-n0q-900913' +
  '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857' +
  '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

// How long a new MRMS frame takes to cross-fade in over the previous one
// (scan-to-scan playback/scrubbing) — see the two-slot comment below. Kept
// comfortably under useMrmsComposite's PLAYBACK_FRAME_MS (350ms) so each
// fade fully resolves before the next frame lands during playback — a
// crossfade that's still running when the next one starts would look
// choppier, not smoother.
const MRMS_CROSSFADE_MS = 150;

const RadarLayer = memo(function RadarLayer({ visible, mrmsDataUrl, mrmsCoordinates, mrmsFresh, beforeId }) {
  const useMrms = visible && mrmsFresh && Boolean(mrmsDataUrl) && Boolean(mrmsCoordinates);
  const iemVis = visible && !useMrms ? 'visible' : 'none';

  // Two alternating image sources so scrubbing/playing through past scans
  // cross-fades smoothly instead of going blank for a moment. Mapbox's own
  // ImageSource#updateImage() doc is explicit about the cause: "To avoid
  // having the image flash after changing, set raster-fade-duration to 0" —
  // but a flash-free swap is still an instant hard cut, not a smooth
  // transition. So each new frame is loaded into whichever slot is
  // currently hidden (its updateImage() reload happens off-screen), then
  // raster-opacity ramps the two slots past each other over
  // MRMS_CROSSFADE_MS via raster-opacity-transition — the previous frame
  // stays fully visible right up until the new one is faded in over it.
  const [slots, setSlots] = useState([null, null]);
  const [activeSlot, setActiveSlot] = useState(0);
  const activeSlotRef = useRef(0);
  const lastUrlRef = useRef(null);

  useEffect(() => {
    if (!mrmsDataUrl || !mrmsCoordinates || mrmsDataUrl === lastUrlRef.current) return;
    lastUrlRef.current = mrmsDataUrl;
    const nextActive = activeSlotRef.current === 0 ? 1 : 0;
    activeSlotRef.current = nextActive;
    setSlots((prev) => {
      const next = [...prev];
      next[nextActive] = { url: mrmsDataUrl, coordinates: mrmsCoordinates };
      return next;
    });
    setActiveSlot(nextActive);
  }, [mrmsDataUrl, mrmsCoordinates]);

  return (
    <>
      {useMrms && slots.map((slot, i) => slot && (
        <Source key={i} id={`mrms-composite-${i}`} type="image" url={slot.url} coordinates={slot.coordinates}>
          <Layer
            id={`mrms-composite-raster-${i}`}
            type="raster"
            beforeId={beforeId}
            paint={{
              'raster-opacity': activeSlot === i ? 0.75 : 0,
              'raster-opacity-transition': { duration: MRMS_CROSSFADE_MS },
              'raster-fade-duration': 0,
              // 'nearest', not 'linear' — no GPU resampling, full native
              // grain of the 0.01° source grid at every zoom.
              'raster-resampling': 'nearest',
            }}
          />
        </Source>
      ))}

      <Source
        id="nexrad-radar"
        type="raster"
        tiles={[IEM_NEXRAD_WMS]}
        tileSize={256}
        maxzoom={10}
        attribution="NEXRAD Level 2 via Iowa Environmental Mesonet"
      >
        <Layer
          id="nexrad-radar-raster"
          type="raster"
          source="nexrad-radar"
          beforeId={beforeId}
          layout={{ visibility: iemVis }}
          paint={{
            'raster-opacity': 0.75,
            'raster-resampling': 'nearest',
            'raster-fade-duration': 300,
          }}
        />
      </Source>
    </>
  );
});
export default RadarLayer;
