import { useState, useCallback, useRef } from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl';
import { Search, MapPin, Loader2, CheckCircle, ArrowRight, LogOut } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase, isSupabaseConfigured } from '../../api/supabaseClient';
import { acquireSlot } from '../../utils/mapboxRateLimiter';
import { useSavedLocations } from '../../hooks/useSavedLocations';
import { useAuth } from '../../context/AuthContext';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
const HAS_MAPBOX = Boolean(MAPBOX_TOKEN.trim());

const MAP_STYLE = HAS_MAPBOX
  ? 'mapbox://styles/mapbox/dark-v11'
  : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const DEFAULT_VIEWPORT = {
  longitude: -98.5795,
  latitude: 39.8283,
  zoom: 3.5,
};

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

export default function AddressSetupScreen({ onReturn }) {
  const { user, signOut } = useAuth();
  const { addLocation, locations } = useSavedLocations();

  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [addressInput, setAddressInput] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');
  const [confirmedLocation, setConfirmedLocation] = useState(null); // { lat, lng, placeName }
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const mapRef = useRef(null);

  const handleSearch = useCallback(async (e) => {
    e.preventDefault();
    if (!addressInput.trim()) return;
    setGeocodeError('');
    setGeocoding(true);
    setConfirmedLocation(null);
    try {
      const result = await geocodeAddress(addressInput.trim());
      setConfirmedLocation(result);
      setViewport(v => ({ ...v, longitude: result.lng, latitude: result.lat, zoom: 12 }));
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

  const handleSignOut = useCallback(async () => {
    await signOut();
    onReturn?.();
  }, [signOut, onReturn]);

  const displayEmail = user?.email ?? '';

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-sentinel-900 text-white overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-sentinel-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight">Sentinel</span>
          <span className="text-[0.6em] font-bold text-fire-400 tracking-wider uppercase align-super">BETA</span>
        </div>
        <div className="flex items-center gap-3">
          {displayEmail && (
            <span className="text-sentinel-400 text-sm hidden sm:block">{displayEmail}</span>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-xs text-sentinel-400 hover:text-white transition-colors"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">
              Welcome{displayEmail ? `, ${displayEmail.split('@')[0]}` : ''}!
            </h1>
            <p className="text-sentinel-300 text-sm">
              Set your home address so Sentinel can show nearby wildfire and weather alerts on your map.
            </p>
          </div>

          {/* Mini map */}
          <div className="rounded-xl overflow-hidden border border-sentinel-600 shadow-2xl mb-6" style={{ height: 280 }}>
            <Map
              ref={mapRef}
              longitude={viewport.longitude}
              latitude={viewport.latitude}
              zoom={viewport.zoom}
              mapboxAccessToken={HAS_MAPBOX ? MAPBOX_TOKEN : undefined}
              mapStyle={MAP_STYLE}
              style={{ width: '100%', height: '100%' }}
              onMove={evt => setViewport(evt.viewState)}
              attributionControl={false}
              fadeDuration={200}
            >
              <NavigationControl position="top-right" />
              {confirmedLocation && (
                <Marker
                  longitude={confirmedLocation.lng}
                  latitude={confirmedLocation.lat}
                  anchor="bottom"
                >
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-fire-600 border-2 border-white flex items-center justify-center shadow-lg">
                      <MapPin size={16} className="text-white" fill="currentColor" />
                    </div>
                    <div className="w-0.5 h-2 bg-fire-600" />
                  </div>
                </Marker>
              )}
            </Map>
          </div>

          {/* Address search */}
          <form onSubmit={handleSearch} className="mb-4">
            <label className="block text-sm font-medium text-sentinel-300 mb-2">
              Search your address
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
                <input
                  type="text"
                  value={addressInput}
                  onChange={e => setAddressInput(e.target.value)}
                  placeholder="123 Main St, City, State..."
                  className="w-full rounded-lg border border-sentinel-600 bg-sentinel-800 pl-9 pr-3 py-2.5 text-sm text-white placeholder-sentinel-500 focus:outline-none focus:border-fire-500 focus:ring-1 focus:ring-fire-500/40 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={geocoding || !addressInput.trim()}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-sentinel-700 hover:bg-sentinel-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
              >
                {geocoding ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                <span className="hidden sm:inline">Search</span>
              </button>
            </div>
          </form>

          {geocodeError && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-600/40 rounded-lg px-3 py-2 mb-4">
              {geocodeError}
            </p>
          )}

          {confirmedLocation && (
            <div className="rounded-xl border border-sentinel-600 bg-sentinel-800/60 p-4 mb-4">
              <div className="flex items-start gap-3">
                <MapPin size={18} className="text-fire-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{confirmedLocation.placeName}</p>
                  <p className="text-xs text-sentinel-400 mt-0.5">
                    {confirmedLocation.lat.toFixed(5)}, {confirmedLocation.lng.toFixed(5)}
                  </p>
                </div>
              </div>

              {!saved ? (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-fire-600 hover:bg-fire-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                  Save as My Address
                </button>
              ) : (
                <div className="mt-3 flex items-center gap-2 text-green-400 text-sm font-medium">
                  <CheckCircle size={15} />
                  Address saved! It will appear on your map.
                </div>
              )}
            </div>
          )}

          {locations.length > 0 && !confirmedLocation && (
            <div className="rounded-xl border border-sentinel-600 bg-sentinel-800/40 p-4 mb-4">
              <p className="text-xs font-medium text-sentinel-400 uppercase tracking-wide mb-2">Saved Addresses</p>
              <ul className="space-y-2">
                {locations.map(loc => (
                  <li key={loc.id} className="flex items-center gap-2 text-sm text-white">
                    <MapPin size={13} className="text-fire-400 shrink-0" />
                    <span className="truncate">{loc.address || loc.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-sentinel-500 text-center">
            You can add or change your address later from the Saved Locations panel.
          </p>
        </div>
      </div>

      {/* Return to Sentinel – bottom right */}
      <div className="flex justify-end px-6 py-4 border-t border-sentinel-700 shrink-0">
        <button
          onClick={onReturn}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-fire-600 hover:bg-fire-500 text-sm font-semibold text-white transition-colors shadow-lg"
        >
          Return to Sentinel
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
