import { useState, useCallback } from 'react';
import { Search, MapPin, Loader2, CheckCircle, X } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../api/supabaseClient';
import { acquireSlot } from '../../utils/mapboxRateLimiter';
import { useSavedLocations } from '../../hooks/useSavedLocations';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

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

async function geocodeAddress(address) {
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

export default function MapAddressSearchPanel({ onClose }) {
  const { addLocation, locations, atLimit } = useSavedLocations();
  const [addressInput, setAddressInput] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');
  const [confirmedLocation, setConfirmedLocation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSearch = useCallback(async (e) => {
    e.preventDefault();
    if (!addressInput.trim()) return;
    setGeocodeError('');
    setGeocoding(true);
    setConfirmedLocation(null);
    setSaved(false);
    try {
      const result = await geocodeAddress(addressInput.trim());
      setConfirmedLocation(result);
    } catch (err) {
      setGeocodeError(err.message || 'Address not found. Try a different search.');
    } finally {
      setGeocoding(false);
    }
  }, [addressInput]);

  const handleSave = useCallback(async () => {
    if (!confirmedLocation) return;
    setSaving(true);
    try {
      await addLocation({
        name: confirmedLocation.placeName,
        address: confirmedLocation.placeName,
        latitude: confirmedLocation.lat,
        longitude: confirmedLocation.lng,
      });
      setSaved(true);
    } catch (err) {
      setGeocodeError(err.message || 'Failed to save location.');
    } finally {
      setSaving(false);
    }
  }, [confirmedLocation, addLocation]);

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[150] w-full max-w-md px-4 pointer-events-none">
      <div className="pointer-events-auto rounded-2xl border border-sentinel-600 bg-sentinel-900/95 backdrop-blur-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-sentinel-700">
          <div className="flex items-center gap-2">
            <MapPin size={15} className="text-white" />
            <span className="text-sm font-semibold text-white">Manage My Addresses</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-sentinel-400 hover:text-white hover:bg-sentinel-700 transition-colors"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4">
          <p className="text-xs text-sentinel-400 mb-3">
            Search your address to mark it on the map and receive nearby alerts.
          </p>

          {/* Address search form */}
          <form onSubmit={handleSearch} className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
              <input
                type="text"
                value={addressInput}
                onChange={e => setAddressInput(e.target.value)}
                placeholder="123 Main St, City, State..."
                autoFocus
                className="w-full rounded-lg border border-sentinel-600 bg-sentinel-800 pl-9 pr-3 py-2 text-sm text-white placeholder-sentinel-500 focus:outline-none focus:border-white/60 focus:ring-1 focus:ring-white/20 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={geocoding || !addressInput.trim()}
              className="flex items-center justify-center px-3 py-2 rounded-lg bg-sentinel-700 hover:bg-sentinel-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              aria-label="Search"
            >
              {geocoding ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            </button>
          </form>

          {geocodeError && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-600/40 rounded-lg px-3 py-2 mb-3">
              {geocodeError}
            </p>
          )}

          {confirmedLocation && (
            <div className="rounded-xl border border-sentinel-600 bg-sentinel-800/60 p-3 mb-3">
              <div className="flex items-start gap-2 mb-2.5">
                {/* Black map marker preview */}
                <div className="flex flex-col items-center shrink-0 mt-0.5">
                  <div className="w-5 h-5 rounded-full bg-black border-2 border-white flex items-center justify-center shadow-md">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                  </div>
                </div>
                <p className="text-xs font-medium text-white leading-tight flex-1">{confirmedLocation.placeName}</p>
              </div>

              {!saved ? (
                <button
                  onClick={handleSave}
                  disabled={saving || atLimit}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-black hover:bg-gray-900 border border-white/25 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-xs font-semibold text-white transition-colors"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                  {atLimit ? 'Location limit reached' : 'Save & Mark on Map'}
                </button>
              ) : (
                <div className="flex items-center gap-2 text-green-400 text-xs font-medium">
                  <CheckCircle size={13} />
                  Saved! Address is now marked on the map.
                </div>
              )}
            </div>
          )}

          {locations.length > 0 && (
            <p className="text-xs text-sentinel-500">
              {locations.length} address{locations.length !== 1 ? 'es' : ''} already saved on your map.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
