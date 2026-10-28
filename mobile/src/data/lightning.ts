/**
 * GOES GLM lightning, as on the web (src/app/api/lightning.js): the lightning-builder edge function
 * writes the last 15 minutes of flashes, gzipped, to the public Supabase Storage bucket "lightning"
 * every minute. Coordinates are scaled integers; times are offsets from `base` (epoch seconds).
 */
import { inflate } from 'pako';

import { ENV } from '@/config/env';

const COORD_SCALE = 100;

export const LIGHTNING_AGE_COLORS = [
  { maxMin: 2, color: '#ffffff', label: 'Under 2 min' },
  { maxMin: 5, color: '#ffe14d', label: '2–5 min' },
  { maxMin: 10, color: '#ff9f1c', label: '5–10 min' },
  { maxMin: 15, color: '#ff4d2e', label: '10–15 min' },
];

export async function fetchLightning(): Promise<GeoJSON.FeatureCollection> {
  if (!ENV.supabaseUrl) throw new Error('Lightning is not configured');
  const res = await fetch(`${ENV.supabaseUrl}/storage/v1/object/public/lightning/v1/latest.json.gz`, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) throw new Error(`Lightning unavailable (HTTP ${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // Stored as application/gzip (not Content-Encoding), so it arrives compressed.
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = gzipped ? inflate(bytes, { toText: true }) : new TextDecoder().decode(bytes);
  const body = JSON.parse(text);
  if (body?.schemaVersion !== 1) throw new Error('Lightning data is in an unexpected format');
  const { lon = [], lat = [], t = [] } = body.flashes ?? {};
  const features: GeoJSON.Feature[] = [];
  const now = Date.now() / 1000;
  for (let i = 0; i < t.length; i++) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon[i] / COORD_SCALE, lat[i] / COORD_SCALE] },
      // Seconds old when fetched; the map colours flashes by age like the web's LightningLayer.
      properties: { age: Math.max(0, now - (body.base + t[i])) },
    });
  }
  return { type: 'FeatureCollection', features };
}
