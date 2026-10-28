/**
 * Draws one Level 3 sweep as a map image, the way the web's radarSweepLayer.js does on the GPU:
 * a fragment shader turns each output pixel into ground range and azimuth from the radar, picks
 * that radial's range gate, and colours it from the product palette. Here the shader (SkSL) runs
 * once per scan into an offscreen Skia surface laid out in Web Mercator over the scan's coverage,
 * and the PNG is drawn by a Mapbox ImageSource pinned to the same four corners, so every gate is
 * still a true polar cell. The "Reflectivity Gates" filter re-runs the shader with new limits.
 */
import { AlphaType, ColorType, FilterMode, ImageFormat, MipmapMode, Skia, TileMode, type SkImage } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';

import type { Level3Scan } from '@/lib/nexrad/nexradLevel3';
import { CC_SCALE, REFLECTIVITY_SCALE, VELOCITY_SCALE, ZDR_SCALE } from '@/data/radarSites';

const EARTH_KM = 6371.0088;
const DEG = Math.PI / 180;
const AZ_STEPS = 3600; // 0.1° azimuth lookup
/** Longest side of the rendered image; ~0.45 km per pixel across a WSR-88D's 460 km range. */
const MAX_SIZE = 2048;

const SWEEP_SKSL = `
uniform shader gates;    // Alpha8: one row per radial, one column per gate
uniform shader azIndex;  // Alpha8, 3600 x 2: radial index + 1 (row 0 low byte, row 1 high byte)
uniform shader palette;  // 256 x 1 RGBA: data level -> colour
uniform float2 size;     // output pixels
uniform float4 geo;      // west, east (deg), Mercator y north, south
uniform float2 station;  // lat, lon (radians)
uniform float3 gate;     // gate km, first gate, gate count
uniform float2 levels;   // lowest and highest data level drawn

half4 main(float2 p) {
  float lon = radians(mix(geo.x, geo.y, p.x / size.x));
  float my = mix(geo.z, geo.w, p.y / size.y);
  float e = exp(my);
  float lat = atan((e - 1.0 / e) * 0.5);
  float dLat = lat - station.x;
  float dLon = lon - station.y;
  // Haversine ground range: stays precise next to the radar, where acos(cos c) would not.
  float s1 = sin(dLat * 0.5);
  float s2 = sin(dLon * 0.5);
  float a = s1 * s1 + cos(station.x) * cos(lat) * s2 * s2;
  float km = 2.0 * asin(min(1.0, sqrt(a))) * 6371.0088;
  float az = degrees(atan(sin(dLon) * cos(lat), cos(station.x) * sin(lat) - sin(station.x) * cos(lat) * cos(dLon)));
  if (az < 0.0) az += 360.0;
  float bucket = min(floor(az * 10.0), 3599.0);
  float lo = floor(azIndex.eval(float2(bucket + 0.5, 0.5)).a * 255.0 + 0.5);
  float hi = floor(azIndex.eval(float2(bucket + 0.5, 1.5)).a * 255.0 + 0.5);
  float radial = lo + hi * 256.0;
  if (radial < 1.0) return half4(0);
  float g = floor(km / gate.x - gate.y);
  if (g < 0.0 || g >= gate.z) return half4(0);
  float level = floor(gates.eval(float2(g + 0.5, radial - 0.5)).a * 255.0 + 0.5);
  if (level >= 2.0 && (level < levels.x || level > levels.y)) return half4(0);
  return palette.eval(float2(level + 0.5, 0.5));
}
`;

let effect: ReturnType<typeof Skia.RuntimeEffect.Make> | undefined;
function sweepEffect() {
  if (effect === undefined) effect = Skia.RuntimeEffect.Make(SWEEP_SKSL);
  if (!effect) throw new Error('Radar shader failed to compile');
  return effect;
}

type Stops = [number, string][];
const PRODUCT_COLORS: Record<number, { scale: Stops; stepped?: boolean; rangeFolded?: boolean }> = {
  153: { scale: REFLECTIVITY_SCALE, stepped: true },
  180: { scale: REFLECTIVITY_SCALE, stepped: true },
  154: { scale: VELOCITY_SCALE, rangeFolded: true },
  182: { scale: VELOCITY_SCALE, rangeFolded: true },
  161: { scale: CC_SCALE },
  159: { scale: ZDR_SCALE },
};

const hexRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Data level → RGBA, as radarSweep.js levelPalette (transparent below 5 dBZ on reflectivity). */
function levelPalette(scan: Level3Scan): Uint8Array {
  const out = new Uint8Array(256 * 4);
  const spec = PRODUCT_COLORS[scan.productCode] ?? PRODUCT_COLORS[153];
  const stops = spec.scale.map(([v, hex]) => [v, hexRgb(hex)] as const);
  if (spec.rangeFolded) out.set([...hexRgb('#7d2fbf'), 255], 4);
  for (let level = 2; level < 256; level++) {
    const value = scan.valueMin + (level - 2) * scan.valueInc;
    let c: readonly number[] | null = null;
    if (spec.stepped) {
      for (const [t, rgb] of stops) if (value >= t) c = rgb;
    } else if (value <= stops[0][0]) c = stops[0][1];
    else {
      c = stops[stops.length - 1][1];
      for (let i = 1; i < stops.length; i++) {
        if (value <= stops[i][0]) {
          const t = (value - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
          c = stops[i - 1][1].map((x, k) => Math.round(x + (stops[i][1][k] - x) * t));
          break;
        }
      }
    }
    if (c) out.set([c[0], c[1], c[2], 255], level * 4);
  }
  return out;
}

const mercY = (latDeg: number) => Math.log(Math.tan(Math.PI / 4 + (latDeg * DEG) / 2));

/** Coverage box of the scan circle (radarSweep.js scanBounds). */
function scanBounds(scan: Level3Scan) {
  const d = ((scan.firstGate + scan.gates) * scan.gateKm) / EARTH_KM;
  const dLat = d / DEG;
  const s = Math.sin(d) / Math.cos(scan.lat * DEG);
  const dLon = (s >= 1 ? Math.PI : Math.asin(s)) / DEG;
  return { west: scan.lon - dLon, east: scan.lon + dLon, north: scan.lat + dLat, south: scan.lat - dLat };
}

function alphaImage(bytes: Uint8Array, width: number, height: number): SkImage {
  const img = Skia.Image.MakeImage(
    { width, height, colorType: ColorType.Alpha_8, alphaType: AlphaType.Unpremul },
    Skia.Data.fromBytes(bytes),
    width,
  );
  if (!img) throw new Error('Radar: could not build gate texture');
  return img;
}

export interface SweepImage {
  uri: string;
  /** Corners for Mapbox ImageSource: top-left, top-right, bottom-right, bottom-left. */
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
}

export interface SweepTextures {
  scan: Level3Scan;
  gates: SkImage;
  azIndex: SkImage;
  palette: SkImage;
}

/** Upload a scan's gates, azimuth lookup and palette once; re-render with new limits cheaply. */
export function sweepTextures(scan: Level3Scan): SweepTextures {
  const { radials, gates } = scan;
  const data = new Uint8Array(radials.length * gates);
  radials.forEach((r, i) => data.set(r.data.subarray(0, gates), i * gates));
  const az = new Uint8Array(AZ_STEPS * 2);
  radials.forEach((r, i) => {
    const from = Math.round(r.start * 10);
    const steps = Math.max(1, Math.round(r.width * 10));
    for (let k = 0; k < steps; k++) {
      const b = (((from + k) % AZ_STEPS) + AZ_STEPS) % AZ_STEPS;
      az[b] = (i + 1) & 255;
      az[AZ_STEPS + b] = (i + 1) >> 8;
    }
  });
  const paletteImg = Skia.Image.MakeImage(
    { width: 256, height: 1, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
    Skia.Data.fromBytes(levelPalette(scan)),
    256 * 4,
  );
  if (!paletteImg) throw new Error('Radar: could not build palette');
  return { scan, gates: alphaImage(data, gates, radials.length), azIndex: alphaImage(az, AZ_STEPS, 2), palette: paletteImg };
}

let renderCount = 0;
let lastFile: File | null = null;

/**
 * Render the sweep to a PNG in the cache directory. `minLevel`/`maxLevel` are data levels
 * (2…255); reflectivity's gates filter converts its dBZ limits with `dbzToLevel`.
 */
export async function renderSweep(t: SweepTextures, minLevel = 2, maxLevel = 255): Promise<SweepImage> {
  const { scan } = t;
  const b = scanBounds(scan);
  const mN = mercY(b.north);
  const mS = mercY(b.south);
  const spanX = (b.east - b.west) * DEG;
  const spanY = mN - mS;
  const width = Math.round(spanX >= spanY ? MAX_SIZE : (MAX_SIZE * spanX) / spanY);
  const height = Math.round(spanY >= spanX ? MAX_SIZE : (MAX_SIZE * spanY) / spanX);

  const nearest = (img: SkImage) => img.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Nearest, MipmapMode.None);
  const shader = sweepEffect().makeShaderWithChildren(
    [width, height, b.west, b.east, mN, mS, scan.lat * DEG, scan.lon * DEG, scan.gateKm, scan.firstGate, scan.gates, minLevel, maxLevel],
    [nearest(t.gates), nearest(t.azIndex), nearest(t.palette)],
  );
  const surface = Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
  if (!surface) throw new Error('Radar: no drawing surface');
  const paint = Skia.Paint();
  paint.setShader(shader);
  surface.getCanvas().drawPaint(paint);
  surface.flush();
  const bytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.PNG);
  surface.dispose?.();

  // A fresh name per render so Mapbox reloads it; the previous one is removed.
  const file = new File(Paths.cache, `radar-sweep-${Date.now()}-${renderCount++}.png`);
  await file.write(bytes);
  const previous = lastFile;
  lastFile = file;
  if (previous) setTimeout(() => previous.exists && previous.delete(), 5000);

  return {
    uri: file.uri,
    coordinates: [
      [b.west, b.north],
      [b.east, b.north],
      [b.east, b.south],
      [b.west, b.south],
    ],
  };
}

/** dBZ → data level for the reflectivity gates filter. */
export function dbzToLevel(scan: Level3Scan, dbz: number): number {
  return Math.ceil((dbz - scan.valueMin) / scan.valueInc) + 2;
}
