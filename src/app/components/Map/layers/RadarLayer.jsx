/**
 * RadarLayer.jsx
 * Composite Radar layer — every NEXRAD site's own reflectivity sweep
 * rendered as its own image layer (no cross-site blending/mosaicking; see
 * useNexradComposite.js and radarRaster.js's rasterizeSweep, the same
 * per-site rasterizer NexradScanLayer.jsx uses for the single selected
 * site). Falls back to the Iowa Environmental Mesonet NEXRAD N0Q WMS mosaic
 * only when the whole composite pipeline has nothing to show (e.g. Supabase
 * unreachable) — not per-site, since per-site staleness is already filtered
 * out upstream in useNexradComposite.js. Layer stays mounted; visibility is
 * controlled via layout property.
 *
 * Fully independent of the NEXRAD Level II single-site layer
 * (NexradScanLayer / NexradSitesLayer) — this component only ever reads
 * `layers.radarComposite` upstream, never NEXRAD site/product state.
 */

import { memo, useEffect, useRef, useState } from 'react';
import { Source, Layer } from 'react-map-gl';

// IEM NEXRAD composite reflectivity (N0Q) — all CONUS WSR-88D stations.
// Whole-pipeline fallback only — see module doc comment.
const IEM_NEXRAD_WMS =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi' +
  '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=nexrad-n0q-900913' +
  '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857' +
  '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

// How long a site's new frame takes to cross-fade in over its previous one.
// Sites scan on independent, staggered schedules (see useNexradComposite.js),
// so scrubbing/playing through history — or just watching live updates land
// — means each site's own image swaps at its own moment, not in sync with
// any other site. Without a cross-fade, that reads as a jarring per-site
// "pop" every time a site's turn comes up; with one, motion stays smooth
// even though the underlying updates are inherently unsynchronized. Kept
// comfortably under useNexradComposite.js's PLAYBACK_FRAME_MS (700ms) so
// each fade fully resolves before the next tick lands during playback.
const CROSSFADE_MS = 200;

/**
 * One site's image layer, cross-fading between two alternating Mapbox
 * `image` sources whenever `dataUrl` changes — the same two-slot trick
 * Composite Radar's old MRMS-backed version used for its one national
 * frame (see git history), now applied per site instead. A hard swap
 * (updateImage() / changing the `url` prop) always flashes instantly no
 * matter what `raster-fade-duration` is set to — that property only
 * smooths tile-source updates, not `image`-source ones — so an actual
 * cross-fade needs two sources ramping opacity past each other instead.
 */
const CrossfadingSiteLayer = memo(function CrossfadingSiteLayer({ siteId, dataUrl, coordinates, beforeId }) {
  const [slots, setSlots] = useState([null, null]);
  const [activeSlot, setActiveSlot] = useState(0);
  const activeSlotRef = useRef(0);
  const lastUrlRef = useRef(null);

  useEffect(() => {
    if (!dataUrl || !coordinates || dataUrl === lastUrlRef.current) return;
    lastUrlRef.current = dataUrl;
    const nextActive = activeSlotRef.current === 0 ? 1 : 0;
    activeSlotRef.current = nextActive;
    setSlots((prev) => {
      const next = [...prev];
      next[nextActive] = { url: dataUrl, coordinates };
      return next;
    });
    setActiveSlot(nextActive);
  }, [dataUrl, coordinates]);

  return slots.map((slot, i) => slot && (
    <Source key={i} id={`nexrad-composite-${siteId}-${i}`} type="image" url={slot.url} coordinates={slot.coordinates}>
      <Layer
        id={`nexrad-composite-raster-${siteId}-${i}`}
        type="raster"
        beforeId={beforeId}
        paint={{
          'raster-opacity': activeSlot === i ? 0.75 : 0,
          'raster-opacity-transition': { duration: CROSSFADE_MS },
          'raster-fade-duration': 0,
          // 'nearest', not 'linear' — no GPU resampling, full native grain
          // of each site's own rasterized sweep at every zoom (deliberate
          // per-cell look, not a resolution/resampling mismatch — see
          // NexradScanLayer.jsx for the same call). The cross-fade above
          // smooths *when* a new frame appears, not the pixels within it.
          'raster-resampling': 'nearest',
        }}
      />
    </Source>
  ));
});

const RadarLayer = memo(function RadarLayer({ visible, sites, beforeId }) {
  const hasSites = visible && Array.isArray(sites) && sites.length > 0;
  const iemVis = visible && !hasSites ? 'visible' : 'none';

  return (
    <>
      {hasSites && sites.map(({ siteId, dataUrl, coordinates }) => (
        <CrossfadingSiteLayer key={siteId} siteId={siteId} dataUrl={dataUrl} coordinates={coordinates} beforeId={beforeId} />
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
