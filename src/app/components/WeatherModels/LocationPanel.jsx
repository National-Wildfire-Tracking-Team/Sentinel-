/**
 * LocationPanel.jsx
 * Where the model forecast is for: a searched address, the device's
 * location, a saved location, or a point clicked on the map. Weather Models
 * works anywhere the models cover, with or without an incident.
 */

import { useState } from 'react';
import { Loader2, LocateFixed, MapPin, Search, Star } from 'lucide-react';
import { geocodeAddress } from '../../utils/geocode';
import { useSavedLocations } from '../../hooks/useSavedLocations';

export default function LocationPanel({ location, onChange }) {
  const { locations: saved } = useSavedLocations();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null); // 'search' | 'locate'
  const [error, setError] = useState(null);

  async function search(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy('search');
    setError(null);
    try {
      const { lat, lng, placeName } = await geocodeAddress(q);
      onChange({ lat, lon: lng, place: placeName });
      setQuery('');
    } catch (err) {
      setError(err.message || 'Address not found');
    } finally {
      setBusy(null);
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      setError('This browser cannot share its location');
      return;
    }
    setBusy('locate');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(null);
        onChange({ lat: pos.coords.latitude, lon: pos.coords.longitude, place: 'Your location' });
      },
      (err) => {
        setBusy(null);
        setError(err.code === 1 ? 'Location permission was denied' : 'Could not get your location');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <MapPin size={16} className="mt-0.5 shrink-0 text-sky-500" aria-hidden />
        <div className="min-w-0">
          <div className="font-semibold text-sentinel-900 dark:text-white truncate">
            {location ? location.place || 'Selected point' : 'Choose a location'}
          </div>
          <div className="text-xs text-sentinel-500 dark:text-sentinel-300 tabular-nums">
            {location
              ? `${location.lat.toFixed(3)}, ${location.lon.toFixed(3)}`
              : 'Search, use your location, or click anywhere on the map.'}
          </div>
        </div>
      </div>
      <form onSubmit={search} className="flex gap-1.5">
        <label className="sr-only" htmlFor="wm-search">Search an address or ZIP code</label>
        <input
          id="wm-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Address, city or ZIP"
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md text-sm bg-white dark:bg-sentinel-700 border border-sentinel-200 dark:border-sentinel-600 text-sentinel-900 dark:text-white placeholder-sentinel-400 dark:placeholder-sentinel-300 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30"
        />
        <button type="submit" disabled={!query.trim() || busy === 'search'} aria-label="Search"
          className="px-2.5 rounded-md bg-sky-600 hover:bg-sky-500 disabled:bg-sentinel-300 dark:disabled:bg-sentinel-600 text-white transition-colors">
          {busy === 'search' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        </button>
        <button type="button" onClick={locate} disabled={busy === 'locate'} aria-label="Use my location" title="Use my location"
          className="px-2.5 rounded-md border border-sentinel-200 dark:border-sentinel-600 text-sentinel-600 dark:text-sentinel-200 hover:bg-sentinel-100 dark:hover:bg-sentinel-700 transition-colors">
          {busy === 'locate' ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />}
        </button>
      </form>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {saved.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Saved locations">
          {saved.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange({ lat: Number(s.latitude), lon: Number(s.longitude), place: s.name || s.address })}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-sentinel-200 dark:border-sentinel-600 text-sentinel-600 dark:text-sentinel-200 hover:border-sky-500 hover:text-sentinel-900 dark:hover:text-white transition-colors"
            >
              <Star size={11} aria-hidden />
              {s.name || s.address}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
