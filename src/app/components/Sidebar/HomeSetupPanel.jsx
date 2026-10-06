/**
 * HomeSetupPanel.jsx
 * Sidebar form for Home Setup: pick a home location (address/ZIP search or
 * current GPS position) and an alert radius. No radius is preselected for
 * a first-time setup — the user has to choose one.
 */

import { useState } from 'react';
import { Home, MapPin, LocateFixed, Loader2, X } from 'lucide-react';
import { useHomeSetup, HOME_RADIUS_OPTIONS } from '../../context/HomeSetupContext';
import { geocodeAddress } from '../../utils/geocode';

export default function HomeSetupPanel() {
  const { home, saveHome, clearHome, closeHomeSetup } = useHomeSetup();
  const [location, setLocation] = useState(home
    ? { latitude: home.latitude, longitude: home.longitude, label: home.label }
    : null);
  const [radiusMiles, setRadiusMiles] = useState(home?.radiusMiles ?? null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null); // 'search' | 'gps' | 'save' | null
  const [error, setError] = useState(null);

  async function handleSearch(e) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setBusy('search');
    setError(null);
    try {
      const { lat, lng, placeName } = await geocodeAddress(trimmed);
      setLocation({ latitude: lat, longitude: lng, label: placeName || trimmed });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  function handleUseCurrentLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location is not supported in this browser.');
      return;
    }
    setBusy('gps');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ latitude: coords.latitude, longitude: coords.longitude, label: 'My current location' });
        setBusy(null);
      },
      (err) => {
        setError(err?.code === 1
          ? 'Location permission denied. Search for your address instead.'
          : 'Could not get your location. Search for your address instead.');
        setBusy(null);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function handleSave() {
    setBusy('save');
    setError(null);
    try {
      await saveHome({ ...location, radiusMiles });
      closeHomeSetup();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    setBusy('save');
    setError(null);
    try {
      await clearHome();
      setLocation(null);
      setRadiusMiles(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const canSave = Boolean(location) && Boolean(radiusMiles) && !busy;

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <Home size={14} className="text-fire-400" />
            {home ? 'Edit Home Setup' : 'Set Up Your Home Location'}
          </h3>
          <p className="mt-1 text-xs text-sentinel-300 leading-snug">
            Choose your home location and alert radius to get personalized wildfire incidents,
            NWS alerts, and SPC/WPC risk information near you.
          </p>
        </div>
        <button
          type="button"
          onClick={closeHomeSetup}
          aria-label="Close Home Setup"
          className="shrink-0 text-sentinel-300 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Step 1 — location */}
      <section className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-sentinel-300">1. Home location</div>
        <form onSubmit={handleSearch} className="flex gap-1.5">
          <div className="relative flex-1">
            <MapPin size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sentinel-200" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Address, city, or ZIP code"
              className="w-full pl-8 pr-2 py-1.5 bg-sentinel-700 border border-sentinel-600 rounded-md text-sm text-white placeholder-sentinel-300 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={Boolean(busy) || !query.trim()}
            className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:bg-sentinel-600 disabled:text-sentinel-400 text-white text-xs font-semibold rounded-md transition-colors shrink-0"
          >
            {busy === 'search' ? <Loader2 size={14} className="animate-spin" /> : 'Find'}
          </button>
        </form>
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={Boolean(busy)}
          className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 border border-sentinel-600 hover:bg-sentinel-700 disabled:opacity-60 text-xs font-medium text-sentinel-100 rounded-md transition-colors"
        >
          {busy === 'gps' ? <Loader2 size={13} className="animate-spin" /> : <LocateFixed size={13} />}
          Use my current location
        </button>
        {location && (
          <div className="flex items-center gap-1.5 rounded-md border border-sentinel-600 bg-sentinel-800/70 px-2.5 py-1.5 text-xs text-sentinel-100">
            <Home size={12} className="text-fire-400 shrink-0" />
            <span className="truncate">{location.label || `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`}</span>
          </div>
        )}
      </section>

      {/* Step 2 — radius */}
      <section className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-sentinel-300">2. Alert radius</div>
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Alert radius">
          {HOME_RADIUS_OPTIONS.map((miles) => (
            <button
              key={miles}
              type="button"
              role="radio"
              aria-checked={radiusMiles === miles}
              onClick={() => setRadiusMiles(miles)}
              className={`px-1 py-1.5 rounded-md border text-xs font-semibold transition-colors ${
                radiusMiles === miles
                  ? 'btn-glass-fire border-fire-500'
                  : 'border-sentinel-600 text-sentinel-200 hover:bg-sentinel-700'
              }`}
            >
              {miles} mi
            </button>
          ))}
        </div>
        <p className="text-[11px] text-sentinel-400 leading-snug">
          “Go to My Current Location” uses this radius around wherever you are.
        </p>
      </section>

      {error && (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-800/50 rounded-md px-2.5 py-1.5">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="btn-glass-fire disabled:opacity-50 flex-1 px-3 py-2 text-sm font-semibold rounded-md"
        >
          {busy === 'save' ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Save Home'}
        </button>
        {home && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={Boolean(busy)}
            className="px-3 py-2 border border-sentinel-600 hover:bg-sentinel-700 text-sentinel-200 text-sm rounded-md transition-colors"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
