/**
 * awcWindBarbs.js
 * Wind barb icons for the Airport weather layer (AwcLayers), drawn the way
 * AWC and the station model draw them: a staff from the station toward where
 * the wind blows from, a short line per 5 kt, a long line per 10 kt and a
 * flag (pennant) per 50 kt, on the clockwise side as in the Northern
 * Hemisphere convention.
 *
 * Each image is square with the station at its exact center, so the symbol
 * layer can rotate it by the wind direction about the station
 * (icon-rotation-alignment: map). Images are made on demand: the map asks
 * for one it doesn't have through `styleimagemissing`, which also covers
 * basemap style switches that drop every added image.
 */

import { barbParts } from '../../../api/awc/awc';

export const BARB_PREFIX = 'awc-barb-';

/** Image id for a speed bucket (multiple of 5 kt) and theme. */
export const barbImageId = (theme, bucket) => `${BARB_PREFIX}${theme === 'light' ? 'light' : 'dark'}-${bucket}`;

/** Barb stroke and its outline per app theme; the outline keeps it legible on any basemap. */
export const BARB_COLORS = {
  dark: { stroke: '#ffffff', outline: 'rgba(9, 9, 11, 0.85)' },
  light: { stroke: '#111827', outline: 'rgba(255, 255, 255, 0.92)' },
};

// Geometry in CSS px, drawn at PIXEL_RATIO for crisp edges.
const PIXEL_RATIO = 2;
const STAFF = 25; // station → staff tip
const FEATHER = 10; // long line length, sideways
const SLANT = 4.5; // how far a line leans toward the tip
const SPACING = 4; // between lines along the staff
const FLAG = 5; // pennant width along the staff
const LINE = 1.5;
const HALF = STAFF + SLANT + 3; // half the image: room for the lean past the tip

/**
 * Draws one barb, staff pointing up (north) from the canvas center.
 * @param {CanvasRenderingContext2D} ctx  already scaled to CSS px
 */
export function drawBarb(ctx, speedKt, { stroke, outline }) {
  const { pennants, full, half } = barbParts(speedKt);
  const cx = HALF;
  const cy = HALF;
  const tip = cy - STAFF;

  const segments = [[cx, cy, cx, tip]];
  const flags = [];
  let y = tip;
  for (let i = 0; i < pennants; i += 1) {
    flags.push([[cx, y], [cx + FEATHER, y - SLANT], [cx, y + FLAG]]);
    y += FLAG + 1.5;
  }
  for (let i = 0; i < full; i += 1) {
    segments.push([cx, y, cx + FEATHER, y - SLANT]);
    y += SPACING;
  }
  if (half) {
    // A lone 5-kt line sits one step in from the tip, so it can't read as 10 kt.
    if (pennants === 0 && full === 0) y += SPACING;
    segments.push([cx, y, cx + FEATHER / 2, y - SLANT / 2]);
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [width, color] of [[LINE + 2, outline], [LINE, stroke]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const [x0, y0, x1, y1] of segments) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
    for (const pts of flags) {
      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      ctx.lineTo(...pts[1]);
      ctx.lineTo(...pts[2]);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.fillStyle = stroke;
  for (const pts of flags) {
    ctx.beginPath();
    ctx.moveTo(...pts[0]);
    ctx.lineTo(...pts[1]);
    ctx.lineTo(...pts[2]);
    ctx.closePath();
    ctx.fill();
  }
}

/** Parses an image id made by barbImageId. */
export function parseBarbImageId(id) {
  const m = String(id).match(/^awc-barb-(dark|light)-(\d+)$/);
  return m ? { theme: m[1], bucket: Number(m[2]) } : null;
}

/** RGBA pixels for one barb, ready for map.addImage; null without a 2D canvas (tests). */
export function makeBarbImage(theme, bucket) {
  if (typeof document === 'undefined') return null;
  const size = Math.ceil(HALF * 2);
  const canvas = document.createElement('canvas');
  canvas.width = size * PIXEL_RATIO;
  canvas.height = size * PIXEL_RATIO;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO);
  drawBarb(ctx, bucket, BARB_COLORS[theme === 'light' ? 'light' : 'dark']);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data };
}

/**
 * Supplies barb images to a Mapbox map as it asks for them.
 * @returns {() => void} detach
 */
export function attachBarbImages(map) {
  if (!map?.on) return () => {};
  const onMissing = (e) => {
    const parsed = parseBarbImageId(e.id);
    if (!parsed || map.hasImage(e.id)) return;
    const image = makeBarbImage(parsed.theme, parsed.bucket);
    if (image) map.addImage(e.id, image, { pixelRatio: PIXEL_RATIO });
  };
  map.on('styleimagemissing', onMissing);
  return () => map.off('styleimagemissing', onMissing);
}
