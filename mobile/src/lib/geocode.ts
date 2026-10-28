/**
 * Address search, as on the web (src/app/utils/geocode.js): the Supabase `mapbox-geocoding` edge
 * function, falling back to Mapbox directly when it errors (but not when it rate-limits).
 */
import { ENV } from '@/config/env';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export interface Place {
  lat: number;
  lng: number;
  name: string;
}

const TYPES = 'address,place,postcode,neighborhood,locality';

function toPlaces(features: any[] | undefined): Place[] {
  return (features ?? [])
    .map(f => {
      const [lng, lat] = f?.geometry?.coordinates ?? f?.center ?? [];
      return { lat, lng, name: f?.place_name ?? f?.text ?? '' };
    })
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

async function searchDirect(query: string, limit: number): Promise<Place[]> {
  if (!ENV.mapboxToken) throw new Error('Search is unavailable right now.');
  const params = `access_token=${ENV.mapboxToken}&country=us&limit=${limit}&types=${TYPES}`;
  const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params}`);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return toPlaces((await res.json())?.features);
}

/** Up to `limit` US places matching free text (address, city, ZIP). */
export async function searchPlaces(query: string, limit = 5): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  if (!isSupabaseConfigured) return searchDirect(q, limit);
  const { data, error } = await supabase.functions.invoke('mapbox-geocoding', {
    body: { query: q, country: 'us', limit, types: TYPES },
  });
  if (error) {
    const status = (error as any)?.context?.status ?? (error as any)?.status;
    if (status === 429) throw new Error('Too many searches. Wait a moment and try again.');
    return searchDirect(q, limit);
  }
  return toPlaces(data?.features);
}

/** Distance in miles between two points. */
export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}

/** A circle of `miles` around a point, as a GeoJSON polygon (for drawing alert radii). */
export function circlePolygon(lat: number, lng: number, miles: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring: [number, number][] = [];
  const dLat = miles / 69.0;
  const dLng = miles / (69.0 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}
