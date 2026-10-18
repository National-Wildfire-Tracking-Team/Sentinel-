/**
 * frontSymbols.js
 * NOAA/WPC surface-analysis front symbology as repeating line patterns:
 *
 *   cold        blue line, blue triangles
 *   warm        red line, red semicircles
 *   occluded    purple line, alternating purple triangles and semicircles, same side
 *   stationary  alternating blue (triangle) / red (semicircle) stretches,
 *               triangles on one side, semicircles on the other
 *   dryline     brown line, open semicircles
 *   trough, squall line: dashed lines without symbols (drawn by WpcFrontsLayer)
 *
 * Each pattern tile is the line itself plus its symbols, so a Mapbox
 * `line-pattern` repeats it along the front: the symbols follow every curve,
 * keep a steady on-screen spacing at any zoom, and a stationary front's red
 * and blue stretches always sit under their own symbol.
 *
 * Which way the symbols face: WPC lists every front's points so its symbols
 * sit on the LEFT of the line as you walk the points (the side it is moving
 * toward). Mapbox lays a line pattern's tile bottom edge on that left side
 * (checked against the live analysis: cold triangles face the warm sector,
 * stationary triangles face the warm air), so symbols are drawn on the tile's
 * bottom half; stationary fronts put their warm semicircles on the top half,
 * facing the cold air.
 */

export const NOAA_FRONT_COLORS = {
  cold: '#0050FF',
  warm: '#FF0000',
  occluded: '#A020F0',
  dryline: '#C28A3A',
};

// Tile geometry, CSS px (drawn at PIXEL_RATIO). Width must give a power-of-two image width.
const PIXEL_RATIO = 2;
export const TILE_HEIGHT = 24; // the line layer's width is scaled against this
const MID = TILE_HEIGHT / 2; // the front line runs along the tile's middle
const LINE = 3; // front line thickness
const TRI_BASE = 12;
const TRI_HEIGHT = 9;
const SEMI_R = 6;

// Tile half, relative to the direction WPC lists the points (see above)
const LEFT = 1; // bottom half: the side the front is moving toward
const RIGHT = -1; // top half

function triangle(ctx, cx, side, color) {
  ctx.beginPath();
  ctx.moveTo(cx - TRI_BASE / 2, MID);
  ctx.lineTo(cx + TRI_BASE / 2, MID);
  ctx.lineTo(cx, MID + side * TRI_HEIGHT);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function semicircle(ctx, cx, side, color, { open = false } = {}) {
  ctx.beginPath();
  // Bulge away from the line toward `side`
  // Canvas y grows downward: angles 0→π sweep the bottom half, π→2π the top.
  ctx.arc(cx, MID, SEMI_R, side === RIGHT ? Math.PI : 0, side === RIGHT ? 2 * Math.PI : Math.PI);
  if (open) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    return;
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function line(ctx, x0, x1, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x0, MID - LINE / 2, x1 - x0, LINE);
}

/** Pattern id → { width (CSS px), draw(ctx) } */
export const FRONT_PATTERNS = {
  'noaa-front-cold': {
    width: 32,
    draw(ctx) {
      line(ctx, 0, 32, NOAA_FRONT_COLORS.cold);
      triangle(ctx, 16, LEFT, NOAA_FRONT_COLORS.cold);
    },
  },
  'noaa-front-warm': {
    width: 32,
    draw(ctx) {
      line(ctx, 0, 32, NOAA_FRONT_COLORS.warm);
      semicircle(ctx, 16, LEFT, NOAA_FRONT_COLORS.warm);
    },
  },
  'noaa-front-occluded': {
    width: 64,
    draw(ctx) {
      line(ctx, 0, 64, NOAA_FRONT_COLORS.occluded);
      triangle(ctx, 16, LEFT, NOAA_FRONT_COLORS.occluded);
      semicircle(ctx, 48, LEFT, NOAA_FRONT_COLORS.occluded);
    },
  },
  'noaa-front-stationary': {
    width: 64,
    draw(ctx) {
      line(ctx, 0, 32, NOAA_FRONT_COLORS.cold);
      triangle(ctx, 16, LEFT, NOAA_FRONT_COLORS.cold);
      line(ctx, 32, 64, NOAA_FRONT_COLORS.warm);
      semicircle(ctx, 48, RIGHT, NOAA_FRONT_COLORS.warm);
    },
  },
  'noaa-front-dryline': {
    width: 32,
    draw(ctx) {
      line(ctx, 0, 32, NOAA_FRONT_COLORS.dryline);
      semicircle(ctx, 16, LEFT, NOAA_FRONT_COLORS.dryline, { open: true });
    },
  },
};

/** frontType → pattern id (types without symbols are absent) */
export const PATTERN_BY_TYPE = {
  COLD: 'noaa-front-cold',
  WARM: 'noaa-front-warm',
  OCCLUDED: 'noaa-front-occluded',
  STATIONARY: 'noaa-front-stationary',
  DRYLINE: 'noaa-front-dryline',
};

/** Render one pattern tile. @returns {{ image: ImageData, options: { pixelRatio: number } }} */
export function renderFrontPattern(id) {
  const def = FRONT_PATTERNS[id];
  const canvas = document.createElement('canvas');
  canvas.width = def.width * PIXEL_RATIO;
  canvas.height = TILE_HEIGHT * PIXEL_RATIO;
  const ctx = canvas.getContext('2d');
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO);
  def.draw(ctx);
  return { image: ctx.getImageData(0, 0, canvas.width, canvas.height), options: { pixelRatio: PIXEL_RATIO } };
}
