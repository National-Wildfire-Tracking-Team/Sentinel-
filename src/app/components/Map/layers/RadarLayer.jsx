/**
 * RadarLayer.jsx
 * Composite Radar layer — every NEXRAD site's own reflectivity sweep
 * rendered as its own image layer (no cross-site blending/mosaicking; see
 * useNexradComposite.js and radarRaster.js's rasterizeSweep, the same
 * per-site rasterizer NexradScanLayer.jsx uses for the single selected
 * site). Falls back to the Iowa Environmental Mesonet NEXRAD N0Q WMS mosaic
 * only while live and only when the whole composite pipeline has nothing to
 * show (e.g. Firestore/GCS unreachable) — not per-site, since per-site
 * staleness is already filtered out upstream in useNexradComposite.js, and
 * never while browsing history (see the `live` prop below) since the IEM
 * mosaic only ever shows current conditions. Layer stays mounted; visibility
 * is controlled via layout property.
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

// How long a site's new frame takes to cross-fade in over its previous one,
// while live (see the `live` prop below — history/playback intentionally
// skip this, see SiteLayer's doc comment). Sites scan on independent,
// staggered schedules (see useNexradComposite.js), so live updates land at
// each site's own moment, not in sync with any other site — without a
// cross-fade that reads as a jarring per-site "pop" every time a site's
// turn comes up.
const CROSSFADE_MS = 200;

// How long after a cross-fade is handed over the outgoing slot is
// unmounted. A margin past CROSSFADE_MS so releasing it can never clip
// the tail of the fade and pop the old frame off a beat early.
const FADE_RELEASE_MS = CROSSFADE_MS + 50;

/**
 * One site's image layer, cross-fading between two alternating Mapbox
 * `image` sources whenever `dataUrl` changes while live — the same
 * two-slot trick Composite Radar's old MRMS-backed version used for its
 * one national frame (see git history), now applied per site instead. A
 * hard swap (updateImage() / changing the `url` prop) always flashes
 * instantly no matter what `raster-fade-duration` is set to — that
 * property only smooths tile-source updates, not `image`-source ones — so
 * an actual cross-fade needs two sources ramping opacity past each other.
 *
 * The second slot only exists for the ~200ms a fade is actually running:
 * it mounts at opacity 0, is handed the active opacity on the next tick
 * (so it fades in rather than popping in on top of the outgoing one — a
 * freshly added Mapbox layer takes its initial paint value with no
 * transition, so the hand-over has to be a *separate* commit from the
 * mount), and the outgoing slot is unmounted once it is fully
 * transparent. Steady state is therefore exactly one image source and one
 * raster layer per site, live or in history. Browsing history just swaps
 * the image in the slot that is already on screen — no fade, nothing
 * added, nothing removed.
 *
 * That invariant is the whole point, and both halves of it are load-bearing:
 *
 *  - The component itself is the same one regardless of `live`. It used to
 *    switch to a plain single-source component while browsing history
 *    (matching NexradScanLayer.jsx's single-site pattern), but that meant
 *    `<SiteLayer>` in RadarLayer's .map() resolved to a *different
 *    component function* for the same `key={siteId}` the instant the user
 *    started scrubbing — which React always fully unmounts and remounts
 *    for, even with a matching key — up to ~200 sites' worth of Mapbox
 *    sources/layers torn down and rebuilt in one commit, confirmed live to
 *    leave the composite blank afterward (PR #621).
 *
 *  - Its *child list* is the same regardless of `live` too. Unifying to one
 *    component originally kept both slots permanently populated, so history
 *    was later changed to collapse to a single slot — but that collapse
 *    fired for every visible site at once on the first scrub away from the
 *    newest frame (the newest frame resolves to the same scan the live view
 *    was already showing, so it no-ops), removing ~200 sources and ~200
 *    layers in one commit: the same mass mutation as above, and the same
 *    blank map (PR #626). Releasing the fade slot per site, as each site's
 *    own fade finishes, means there is nothing left to collapse by the time
 *    the user scrubs — toggling `live` changes no Mapbox state at all.
 *
 * Note that the resident-but-invisible slot was never the GPU cost it was
 * once described as: mapbox-gl's drawRaster returns immediately when
 * `raster-opacity` is 0, so a faded-out slot is skipped by the render loop
 * entirely. What it does cost is style size — every extra layer is another
 * react-map-gl <Source>/<Layer> re-rendering on every `styledata` event —
 * which is why releasing it still matters, and why doing it per site
 * rather than all at once is both cheaper and safe.
 */
const SiteLayer = memo(function SiteLayer({ siteId, dataUrl, coordinates, beforeId, live }) {
  const [slots, setSlots] = useState([null, null]);
  const [activeSlot, setActiveSlot] = useState(0);
  // The slot the newest frame lives in. Tracked in a ref as well as state
  // because the hand-over below is deferred a tick, and a history swap
  // landing in that window still has to target the incoming slot.
  const activeSlotRef = useRef(0);
  const lastUrlRef = useRef(null);
  const handoverRef = useRef(null);
  const releaseRef = useRef(null);

  useEffect(() => () => {
    clearTimeout(handoverRef.current);
    clearTimeout(releaseRef.current);
  }, []);

  useEffect(() => {
    if (!dataUrl || !coordinates || dataUrl === lastUrlRef.current) return;
    lastUrlRef.current = dataUrl;
    const frame = { url: dataUrl, coordinates };
    const from = activeSlotRef.current;

    if (!live) {
      // History: scrubbing/playback is the user jumping directly between
      // two specific past moments, not two adjacent live updates — fading
      // between them reads as motion blur across time, not smoothing. So
      // swap the image in place, in the slot that is already on screen.
      setSlots((prev) => {
        const next = [...prev];
        next[from] = frame;
        return next;
      });
      return;
    }

    // Live, step 1: mount the incoming frame in the other slot. `activeSlot`
    // hasn't moved yet, so it comes up at opacity 0 instead of popping in
    // at full opacity on top of the frame it is supposed to fade over.
    const to = from === 0 ? 1 : 0;
    activeSlotRef.current = to;
    setSlots((prev) => {
      const next = [...prev];
      next[to] = frame;
      return next;
    });

    // Step 2, next tick (a separate commit, so both layers already exist on
    // the map): hand over. Now it's a paint-property change on each — a
    // real cross-fade in both directions.
    clearTimeout(handoverRef.current);
    handoverRef.current = setTimeout(() => {
      setActiveSlot(to);
      // Step 3: once the outgoing slot is fully transparent, release it —
      // back to one source/layer for this site until its next update.
      clearTimeout(releaseRef.current);
      releaseRef.current = setTimeout(() => {
        setSlots((prev) => {
          if (!prev[from]) return prev;
          const next = [...prev];
          next[from] = null;
          return next;
        });
      }, FADE_RELEASE_MS);
    }, 0);
  }, [dataUrl, coordinates, live]);

  return slots.map((slot, i) => slot && (
    <Source key={i} id={`nexrad-composite-${siteId}-${i}`} type="image" url={slot.url} coordinates={slot.coordinates}>
      <Layer
        id={`nexrad-composite-raster-${siteId}-${i}`}
        type="raster"
        beforeId={beforeId}
        paint={{
          'raster-opacity': activeSlot === i ? 0.75 : 0,
          'raster-opacity-transition': { duration: live ? CROSSFADE_MS : 0 },
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

const RadarLayer = memo(function RadarLayer({ visible, sites, live = true, beforeId }) {
  const hasSites = visible && Array.isArray(sites) && sites.length > 0;
  // Live-only. The IEM mosaic is a different rendering source entirely (its
  // own external tiles, not radarRaster.js's REFLECTIVITY_SCALE) and always
  // shows *current* conditions, never a historical moment — falling back to
  // it while scrubbing/playing history used to read as "the color coding
  // changes" the instant a tick happened to resolve zero sites (e.g. no
  // site in view had a frame near that timestamp, which is unremarkable —
  // every product elsewhere in the app just shows nothing for a gap like
  // that) and, worse, silently swapped in live data for whatever historical
  // time was selected. A history tick with no sites now shows nothing,
  // same as any other product's data gap.
  const iemVis = visible && !hasSites && live ? 'visible' : 'none';

  return (
    <>
      {hasSites && sites.map(({ siteId, dataUrl, coordinates }) => (
        <SiteLayer key={siteId} siteId={siteId} dataUrl={dataUrl} coordinates={coordinates} beforeId={beforeId} live={live} />
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
