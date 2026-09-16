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

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

// IEM NEXRAD composite reflectivity (N0Q) — all CONUS WSR-88D stations.
// Whole-pipeline fallback only — see module doc comment.
const IEM_NEXRAD_WMS =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi' +
  '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=nexrad-n0q-900913' +
  '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857' +
  '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

const RadarLayer = memo(function RadarLayer({ visible, sites, beforeId }) {
  const hasSites = visible && Array.isArray(sites) && sites.length > 0;
  const iemVis = visible && !hasSites ? 'visible' : 'none';

  return (
    <>
      {hasSites && sites.map(({ siteId, dataUrl, coordinates }) => (
        <Source key={siteId} id={`nexrad-composite-${siteId}`} type="image" url={dataUrl} coordinates={coordinates}>
          <Layer
            id={`nexrad-composite-raster-${siteId}`}
            type="raster"
            beforeId={beforeId}
            paint={{
              'raster-opacity': 0.75,
              'raster-fade-duration': 300,
              // 'nearest', not 'linear' — no GPU resampling, full native
              // grain of each site's own rasterized sweep at every zoom
              // (deliberate per-cell look, not a resolution/resampling
              // mismatch — see NexradScanLayer.jsx for the same call).
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
