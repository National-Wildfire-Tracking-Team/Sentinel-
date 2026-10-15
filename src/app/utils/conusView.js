/**
 * conusView.js
 * The map's opening camera: the contiguous US (lower 48) centered and fully
 * in view, whatever the window size. ViewportContext starts from
 * initialViewport; MapView refines it with cameraForBounds once the map loads.
 */

/** Contiguous US (lower 48), [[west, south], [east, north]]. */
export const CONUS_BOUNDS = [[-124.8, 24.4], [-66.9, 49.4]];

/**
 * Extreme points along the lower 48's outline, [lng, lat]. On the globe the
 * parallels curve, so the bounding box above leaves a band of Canada/Mexico in
 * view; fitting these instead frames the actual coastline and borders.
 */
export const CONUS_OUTLINE = [
  [-124.73, 48.38], // Cape Flattery
  [-123.32, 49.0], [-117.0, 49.0], [-110.0, 49.0], [-104.0, 49.0], [-97.23, 49.0],
  [-95.15, 49.38], // Northwest Angle
  [-89.6, 48.0], [-84.4, 46.5], [-82.5, 45.3], [-79.0, 43.3], [-74.7, 45.0],
  [-71.5, 45.0], [-69.23, 47.46], [-67.8, 47.07], // Maine
  [-66.95, 44.82], // West Quoddy Head
  [-69.95, 41.67], [-75.53, 35.23], [-80.03, 26.7], // Cape Cod, Hatteras, Palm Beach
  [-81.8, 24.54], [-82.9, 27.8], [-85.0, 29.6], [-89.4, 28.93], // Key West, Gulf coast, Mississippi delta
  [-97.15, 25.95], // Brownsville
  [-103.3, 28.97], [-106.5, 31.75], [-111.07, 31.33], [-117.12, 32.53], // Mexico border
  [-120.65, 34.57], [-124.41, 40.44], [-124.56, 42.84], // Point Conception, Mendocino, Blanco
];

/** Gap (px) left between the US and the header above / bottom bar below. */
export const FRAME_MARGIN = 4;
/** Bottom bar height plus its 16 px offset, before it can be measured. */
const BOTTOM_BAR_ESTIMATE = 72;

/**
 * Map padding (px) around CONUS. The map starts at the bottom of the header,
 * so the top only needs the margin; the bottom clears the floating bottom bar
 * (`bottomBarSpace`: map bottom edge → top of the bar). Framing inside that
 * band centers the US between the header and the bottom bar.
 */
export function conusPadding(bottomBarSpace = BOTTOM_BAR_ESTIMATE) {
  return {
    top: FRAME_MARGIN,
    bottom: bottomBarSpace + FRAME_MARGIN,
    left: FRAME_MARGIN,
    right: FRAME_MARGIN,
  };
}

const mercY = (lat) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
const latFromMercY = (y) => (360 / Math.PI) * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - 90;

/**
 * Camera that fits CONUS into a width × height map, centered between the
 * header and the bottom bar (Web Mercator, 512 px tiles). The map refines this with cameraForBounds once it loads
 * (see MapView), so this only has to be close enough not to visibly jump.
 */
export function conusViewport(width, height) {
  const [[w, s], [e, n]] = CONUS_BOUNDS;
  const pad = conusPadding();
  const xSpan = (e - w) / 360;
  const yTop = mercY(n);
  const yBottom = mercY(s);
  const availW = Math.max(100, width - pad.left - pad.right);
  const availH = Math.max(100, height - pad.top - pad.bottom);
  const zoom = Math.log2(Math.min(availW / (xSpan * 512), availH / ((yBottom - yTop) * 512)));
  // The map center sits at the middle of the canvas; shift it so CONUS lands
  // in the middle of the padded band instead.
  const scale = 512 * 2 ** zoom;
  const shiftY = (pad.bottom - pad.top) / 2 / scale;
  return {
    longitude: (w + e) / 2,
    latitude: latFromMercY((yTop + yBottom) / 2 + shiftY),
    zoom: Math.max(1, Math.min(zoom, 6)),
    pitch: 0,
    bearing: 0,
  };
}

// The map fills the window under the navbar (~64 px).
export const initialViewport = typeof window === 'undefined'
  ? conusViewport(1280, 720)
  : conusViewport(window.innerWidth, Math.max(300, window.innerHeight - 64));

/**
 * One step of framing CONUS_OUTLINE inside the padded area of a live Mapbox
 * map: project the outline at the current camera, then rescale and recenter.
 * The globe isn't linear, so the caller applies the camera, lets the map
 * render, and steps again; two or three steps land on an exact fit.
 * Read-only on the map (react-map-gl owns the camera).
 * @returns {null | { camera: { longitude, latitude, zoom }, done: boolean }}
 */
export function conusFitStep(map, padding) {
  const { width, height } = map.getContainer().getBoundingClientRect();
  const availW = width - padding.left - padding.right;
  const availH = height - padding.top - padding.bottom;
  if (availW <= 0 || availH <= 0) return null;
  const pts = CONUS_OUTLINE.map((p) => map.project(p));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const dz = Math.log2(Math.min(availW / (maxX - minX), availH / (maxY - minY)));
  // Outline's pixel centre relative to where it should sit; recentre on the
  // point that's that far from the canvas centre.
  const offX = (minX + maxX) / 2 - (padding.left + availW / 2);
  const offY = (minY + maxY) / 2 - (padding.top + availH / 2);
  const center = map.unproject([width / 2 + offX, height / 2 + offY]);
  return {
    camera: { longitude: center.lng, latitude: center.lat, zoom: map.getZoom() + dz },
    done: Math.abs(dz) < 0.003 && Math.hypot(offX, offY) < 1.5,
  };
}
