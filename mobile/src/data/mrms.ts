/**
 * MRMS composite radar, as on the web (src/app/api/mrms.js, MrmsLayer.jsx): the AWS pipeline
 * publishes a manifest and value-encoded PNG frames over CONUS; the map colours them on the GPU
 * with `raster-color` from the product's palette (api/modelFields.js rasterPaint).
 */
import { ENV } from '@/config/env';

const MRMS_BASE = `${ENV.dataServicesUrl}/mrms/v1`;

export interface MrmsSpec {
  label: string;
  quantity: string;
  encoding: { transform: 'linear' | 'sqrt'; lo: number; hi: number };
  palette: [number, string, number][];
  encodingId: string;
}

export interface MrmsFrame {
  url: string;
  time: string;
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  spec: MrmsSpec;
}

export async function fetchLatestMrms(product = 'reflectivity'): Promise<MrmsFrame> {
  const res = await fetch(`${MRMS_BASE}/manifest.json`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`Radar unavailable (HTTP ${res.status})`);
  const m = await res.json();
  if (m?.schemaVersion !== 1 || m?.kind !== 'mrms-manifest') throw new Error('Unexpected radar manifest');
  const p = m.products?.[product];
  const frame = p?.frames?.[p.frames.length - 1];
  if (!frame) throw new Error('No radar frames available');
  return {
    url: `${MRMS_BASE}/${product}/${p.encodingId}/lo/${frame.id}.png`,
    time: frame.time,
    coordinates: m.image.coordinates,
    spec: p,
  };
}

function valueToByte(value: number, { lo, hi, transform }: MrmsSpec['encoding']): number {
  const v = Math.min(Math.max(value, lo), hi);
  const t = transform === 'sqrt' ? Math.sqrt(v - lo) / Math.sqrt(hi - lo) : (v - lo) / (hi - lo);
  return 1 + t * 254;
}

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The `raster-color` ramp for a product: encoded byte → palette colour (0 = no data). */
export function mrmsRasterColor(spec: MrmsSpec): any[] {
  const stops: (number | string)[] = [];
  let last = 0.5;
  for (const [value, hex, alpha] of spec.palette) {
    let b = valueToByte(value, spec.encoding);
    if (b <= last) b = last + 1e-3;
    stops.push(b, rgba(hex, alpha));
    last = b;
  }
  return ['interpolate', ['linear'], ['raster-value'], 0, 'rgba(0, 0, 0, 0)', 0.5, 'rgba(0, 0, 0, 0)', ...stops];
}

/** Legend rows (dBZ) for reflectivity. */
export function mrmsLegend(spec: MrmsSpec): { color: string; label: string }[] {
  return spec.palette
    .filter(([, , alpha]) => alpha > 0)
    .filter((_, i) => i % 2 === 0)
    .map(([value, color]) => ({ color, label: `${Math.round(value)} ${spec.quantity === 'reflectivity' ? 'dBZ' : ''}`.trim() }));
}
