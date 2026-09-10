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

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

// IEM NEXRAD composite reflectivity (N0Q) — all CONUS WSR-88D stations.
// Fallback source only — see module doc comment.
const IEM_NEXRAD_WMS =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi' +
  '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=nexrad-n0q-900913' +
  '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857' +
  '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

const RadarLayer = memo(function RadarLayer({ visible, mrmsDataUrl, mrmsCoordinates, mrmsFresh }) {
  const useMrms = visible && mrmsFresh && Boolean(mrmsDataUrl) && Boolean(mrmsCoordinates);
  const iemVis = visible && !useMrms ? 'visible' : 'none';

  return (
    <>
      {useMrms && (
        <Source id="mrms-composite" type="image" url={mrmsDataUrl} coordinates={mrmsCoordinates}>
          <Layer
            id="mrms-composite-raster"
            type="raster"
            paint={{
              'raster-opacity': 0.85,
              'raster-fade-duration': 300,
              // 'linear', not 'nearest' — verified directly against real
              // production MRMS data (real storms over the FL panhandle,
              // real KMLB-adjacent Gulf cells) at regional through very
              // close zoom: 'nearest' made every one of the grid's 0.02°
              // (~2.2km) cells an obvious visible square once zoomed past
              // regional scale — exactly the "blocky" complaint this was
              // meant to avoid. 'linear' produces smooth, storm-shaped
              // structure with clean coastline/ocean edges and distinct
              // color bands at every zoom tested, with no observed "haze"
              // or muddy-color downside in this data. If a future dataset
              // does show unacceptable blur, prefer increasing the source
              // grid resolution over reverting to 'nearest' — the
              // blockiness is a resolution/resampling mismatch, not a
              // reason to un-smooth adjacent real cells.
              'raster-resampling': 'linear',
            }}
          />
        </Source>
      )}

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
          layout={{ visibility: iemVis }}
          paint={{
            'raster-opacity': 0.75,
            'raster-resampling': 'linear',
            'raster-fade-duration': 300,
          }}
        />
      </Source>
    </>
  );
});
export default RadarLayer;
