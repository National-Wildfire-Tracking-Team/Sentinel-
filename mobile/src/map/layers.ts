/** Basemaps. Style URLs match the web's MAP_STYLES (MapView.jsx). */
export type BasemapId = 'satellite' | 'dark';

export const BASEMAPS: Record<BasemapId, { label: string; styleURL: string }> = {
  satellite: { label: 'Satellite', styleURL: 'mapbox://styles/mapbox/standard-satellite' },
  dark: { label: 'Rendered', styleURL: 'mapbox://styles/mapbox/dark-v11' },
};

/** Contiguous US, as in the web's conusView.js. */
export const CONUS_BOUNDS = { ne: [-66.9, 49.4] as [number, number], sw: [-124.8, 24.4] as [number, number] };
