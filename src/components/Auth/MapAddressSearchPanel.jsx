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
    types: 'postcode',
  });
  const encoded = encodeURIComponent(address.trim());
  const resp = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?${params}`
  );
  if (!resp.ok) throw new Error(`Geocoding failed (${resp.status})`);
  const data = await resp.json();
  if (!data?.features?.length) throw new Error('Zip code not found');
  const [lng, lat] = data.features[0].center;
  return { lat, lng, placeName: data.features[0].place_name };
}

async function geocodeAddress(address) {
  if (!isSupabaseConfigured) return geocodeViaDirect(address);
  await acquireSlot();
  const { data, error } = await supabase.functions.invoke('mapbox-geocoding', {
    body: { query: address, country: 'us', limit: 1, types: 'postcode' },
  });
  if (error) return geocodeViaDirect(address);
  if (!data?.features?.length) throw new Error('Zip code not found');
  const first = data.features[0];
  if (!Array.isArray(first?.geometry?.coordinates)) throw new Error('Zip code not found');
  const [lng, lat] = first.geometry.coordinates;
  return { lat, lng, placeName: first.properties?.full_address ?? first.properties?.name ?? '' };
}

function PinIcon({ size = 9 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="text-white">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  );
}

export default function MapAddressSearchPanel({ onClose, asPage = false }) {
  const { addLocation, removeLocation, locations, atLimit, limit } = useSavedLocations();
  const [addressInput, setAddressInput] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');
  const [confirmedLocation, setConfirmedLocation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const handleSearch = useCallback(async (e) => {
    e.preventDefault();
    if (!addressInput.trim()) return;
    setGeocodeError('');
    setGeocoding(true);
    setConfirmedLocation(null);
    try {
      const result = await geocodeAddress(addressInput.trim());
      setConfirmedLocation(result);
    } catch (err) {
      setGeocodeError(err.message || 'Zip code not found. Try a different search.');
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
      setAddressInput('');
      setConfirmedLocation(null);
    } catch (err) {
      setGeocodeError(err.message || 'Failed to save location.');
    } finally {
      setSaving(false);
    }
  }, [confirmedLocation, addLocation]);

  const handleRemove = useCallback(async (id) => {
    setRemovingId(id);
    try {
      await removeLocation(id);
    } finally {
      setRemovingId(null);
    }
  }, [removeLocation]);

  const canClose = typeof onClose === 'function';

  return (
    <div
      className={asPage
        ? 'w-full'
        : 'fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'}
      onClick={(e) => {
        if (!asPage && canClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`w-full max-w-lg rounded-2xl border border-sentinel-600 bg-sentinel-900 overflow-hidden animate-fade-in ${asPage ? '' : 'shadow-2xl'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sentinel-700">
          <div className="flex items-center gap-2.5">
            <MapPin size={18} className="text-fire-500" />
            <h2 className="text-base font-bold text-white">Manage My Zip Codes</h2>
          </div>
          {canClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-sentinel-400 hover:text-white hover:bg-sentinel-700 transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-5">
          <p className="text-sm text-sentinel-400">
            Search a zip code to save it and place a marker on the live map. Up to {limit} zip codes supported.
          </p>

          {/* Search form */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
              <input
                type="text"
                value={addressInput}
                onChange={e => setAddressInput(e.target.value)}
                placeholder="Enter zip code (e.g. 90210)..."
                autoFocus
                className="w-full rounded-xl border border-sentinel-600 bg-sentinel-800 pl-9 pr-3 py-2.5 text-sm text-white placeholder-sentinel-500 focus:outline-none focus:border-fire-600/60 focus:ring-1 focus:ring-fire-600/20 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={geocoding || !addressInput.trim()}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-fire-600 hover:bg-fire-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors whitespace-nowrap"
            >
              {geocoding ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Search
            </button>
          </form>

          {geocodeError && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-600/40 rounded-xl px-3 py-2.5">
              {geocodeError}
            </p>
          )}

          {/* Geocoded result */}
          {confirmedLocation && (
            <div className="rounded-xl border border-sentinel-600 bg-sentinel-800/60 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-black border-2 border-white flex items-center justify-center shrink-0 mt-0.5 shadow-md">
                  <PinIcon size={11} />
                </div>
                <p className="text-sm font-medium text-white leading-snug flex-1">{confirmedLocation.placeName}</p>
              </div>
              <button
                onClick={handleSave}
                disabled={saving || atLimit}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-fire-600 hover:bg-fire-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-sm font-semibold text-white transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {atLimit ? `Limit reached (${limit} max)` : 'Save & Mark on Map'}
              </button>
            </div>
          )}

          {/* Saved zip codes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-sentinel-300 uppercase tracking-wider">
                Saved Zip Codes
              </h3>
              <span className="text-xs text-sentinel-500">{locations.length} / {limit} used</span>
            </div>

            {locations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-sentinel-700 bg-sentinel-800/20 px-4 py-8 text-center">
                <MapPin size={22} className="text-sentinel-600 mx-auto mb-2" />
                <p className="text-sm text-sentinel-500">No zip codes saved yet.</p>
                <p className="text-xs text-sentinel-600 mt-1">Search above to add your first location.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {locations.map(loc => (
                  <div
                    key={loc.id}
                    className="flex items-center gap-3 rounded-xl border border-sentinel-700 bg-sentinel-800/50 px-3.5 py-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-black border-2 border-white flex items-center justify-center shrink-0 shadow">
                      <PinIcon size={9} />
                    </div>
                    <p className="text-sm text-white flex-1 truncate">{loc.address || loc.name}</p>
                    <button
                      onClick={() => handleRemove(loc.id)}
                      disabled={removingId === loc.id}
                      className="p-1.5 rounded-lg text-sentinel-400 hover:text-red-400 hover:bg-red-950/30 transition-colors disabled:opacity-40 shrink-0"
                      aria-label={`Remove ${loc.name}`}
                    >
                      {removingId === loc.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <X size={14} />
                      }
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
