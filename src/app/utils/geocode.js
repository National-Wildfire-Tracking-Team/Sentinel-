/**
 * geocode.js
 * Forward-geocodes a free-text US address/ZIP/place to { lat, lng, placeName }
 * via the Supabase mapbox-geocoding edge function, falling back to Mapbox
 * directly when Supabase isn't configured or the function errors.
 */

import { supabase, isSupabaseConfigured } from '../../shared/api/supabaseClient';
import { acquireSlot } from './mapboxRateLimiter';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

async function geocodeViaDirect(address) {
  if (!MAPBOX_TOKEN) throw new Error('Geocoding unavailable – Mapbox token not configured');
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    country: 'us',
    limit: '1',
    types: 'address,place,postcode,neighborhood,locality',
  });
  const encoded = encodeURIComponent(address.trim());
  const resp = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?${params}`
  );
  if (!resp.ok) throw new Error(`Geocoding failed (${resp.status})`);
  const data = await resp.json();
  if (!data?.features?.length) throw new Error('Address not found');
  const [lng, lat] = data.features[0].center;
  return { lat, lng, placeName: data.features[0].place_name };
}

export async function geocodeAddress(address) {
  if (!isSupabaseConfigured) return geocodeViaDirect(address);
  await acquireSlot();
  const { data, error } = await supabase.functions.invoke('mapbox-geocoding', {
    body: { query: address, country: 'us', limit: 1, types: 'address,place,postcode,neighborhood,locality' },
  });
  if (error) return geocodeViaDirect(address);
  if (!data?.features?.length) throw new Error('Address not found');
  const first = data.features[0];
  if (!Array.isArray(first?.geometry?.coordinates)) throw new Error('Address not found');
  const [lng, lat] = first.geometry.coordinates;
  return { lat, lng, placeName: first.properties?.full_address ?? first.properties?.name ?? '' };
}
