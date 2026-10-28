/**
 * Tile overlays that aren't NOAA ArcGIS exports: the USGS WFPI grid (WfpiLayer), LANDFIRE fuel
 * models (FuelModelLayer, one ImageServer per region) and GOES satellite imagery (GOESLayer).
 */
import { LANDFIRE_SERVICES, landfireTileUrl, wfpiTileUrl } from '@/data/fireDanger';

export interface RasterOverlay {
  key: string;
  url: string;
  opacity: number;
  tileSize?: number;
  minZoom?: number;
  maxZoom?: number;
}

/**
 * Satellite: NASA GIBS's latest GOES-East GeoColor (true color by day, infrared at night), the
 * web's default region. The web's band, region and loop pickers aren't in the app yet.
 */
const GOES_EAST_GEOCOLOR =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png';

/** The overlays a catalog key draws, bottom to top. `bucket` changes the URL so tiles refresh. */
export function rasterOverlaysFor(key: string, bucket: number): RasterOverlay[] {
  switch (key) {
    case 'wfpi':
      return [{ key: 'wfpi', url: wfpiTileUrl(1), opacity: 0.65, tileSize: 256, minZoom: 3, maxZoom: 12 }];
    case 'fuelModels':
      return LANDFIRE_SERVICES.map(s => ({ key: `lf-${s.id}`, url: landfireTileUrl(s.path), opacity: 0.7, tileSize: 256, minZoom: 3, maxZoom: 16 }));
    case 'satellite':
      // GIBS publishes a frame every 10 minutes.
      return [{ key: 'satellite', url: `${GOES_EAST_GEOCOLOR}?_r=${bucket}`, opacity: 0.7, tileSize: 256, maxZoom: 7 }];
    default:
      return [];
  }
}

export const RASTER_OVERLAY_KEYS = new Set(['wfpi', 'fuelModels', 'satellite']);
