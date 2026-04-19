/**
 * AddressAlertSearch.jsx
 * Address search bar that geocodes an address via Mapbox and
 * fetches NOAA weather alerts for that location.
 */

import { useState, useRef } from 'react';
import { Search, MapPin, Loader2, X, AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import { fetchAlertsByPoint } from '../../api/noaaWeather';
import { useApp } from '../../context/AppContext';
import { supabase, isSupabaseConfigured } from '../../api/supabaseClient';
import { acquireSlot } from '../../utils/mapboxRateLimiter';

const SEVERITY_STYLES = {
  Extreme:  'border-red-600/60 bg-red-950/50 text-red-200',
  Severe:   'border-orange-600/60 bg-orange-950/50 text-orange-200',
  Moderate: 'border-yellow-600/60 bg-yellow-950/50 text-yellow-200',
  Minor:    'border-blue-600/60 bg-blue-950/50 text-blue-200',
  Unknown:  'border-sentinel-600 bg-sentinel-800/60 text-sentinel-200',
};

const SEVERITY_ICONS = {
  Extreme:  ShieldAlert,
  Severe:   AlertTriangle,
  Moderate: AlertTriangle,
  Minor:    Info,
  Unknown:  Info,
};

async function geocodeAddress(address) {
  if (!isSupabaseConfigured) throw new Error('Geocoding unavailable – Supabase not configured');
  await acquireSlot();
  const { data, error } = await supabase.functions.invoke('mapbox-geocoding', {
    body: { query: address, country: 'us', limit: 1, types: 'address,place,postcode,neighborhood,locality' },
  });
  if (error) throw new Error('Geocoding failed');
  if (!data?.features?.length) throw new Error('Address not found');
  const first = data.features[0];
  if (!Array.isArray(first?.geometry?.coordinates)) throw new Error('Address not found');
  const [lng, lat] = first.geometry.coordinates;
  return { lat, lng, placeName: first.properties?.full_address ?? first.properties?.name ?? '' };
}

function AlertCard({ alert }) {
  const [expanded, setExpanded] = useState(false);
  const severity = alert.severity || 'Unknown';
  const styles = SEVERITY_STYLES[severity] || SEVERITY_STYLES.Unknown;
  const Icon = SEVERITY_ICONS[severity] || Info;

  return (
    <div className={`rounded-lg border p-2.5 ${styles}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className="flex items-start gap-2">
          <Icon size={14} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold leading-tight">{alert.type}</div>
            <div className="text-[11px] opacity-80 mt-0.5 line-clamp-2">{alert.headline}</div>
          </div>
          <span className="text-[10px] font-medium opacity-70 shrink-0">{severity}</span>
        </div>
      </button>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-white/10 space-y-1.5">
          {alert.affectedArea && (
            <div className="text-[11px]">
              <span className="font-semibold">Area:</span> {alert.affectedArea}
            </div>
          )}
          {alert.instruction && (
            <div className="text-[11px]">
              <span className="font-semibold">Instructions:</span> {alert.instruction}
            </div>
          )}
          {alert.expires && (
            <div className="text-[10px] opacity-70">
              Expires: {new Date(alert.expires).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AddressAlertSearch() {
  const { setViewport } = useApp();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null); // { placeName, alerts }
  const inputRef = useRef(null);

  async function handleSearch(e) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const { lat, lng, placeName } = await geocodeAddress(trimmed);
      const alerts = await fetchAlertsByPoint(lat, lng);
      setResults({ placeName, alerts, lat, lng });

      // Fly map to the searched location
      setViewport({ longitude: lng, latitude: lat, zoom: 8 });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setQuery('');
    setResults(null);
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <div className="p-3 border-b border-sentinel-700 space-y-2 shrink-0">
      {/* Search form */}
      <form onSubmit={handleSearch} className="relative flex gap-1.5">
        <div className="relative flex-1">
          <MapPin size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sentinel-200" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search address for alerts..."
            className="w-full pl-8 pr-8 py-1.5 bg-sentinel-700 border border-sentinel-600 rounded-md text-sm text-white placeholder-sentinel-300 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-sentinel-300 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:bg-sentinel-600 disabled:text-sentinel-400 text-white rounded-md transition-colors shrink-0"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-800/50 rounded-md px-2.5 py-1.5">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] text-sentinel-200">
            <MapPin size={11} className="text-sky-400 shrink-0" />
            <span className="truncate">{results.placeName}</span>
          </div>

          {results.alerts.length === 0 ? (
            <div className="text-xs text-green-300 bg-green-950/30 border border-green-800/40 rounded-md px-2.5 py-2 text-center">
              No active weather alerts for this location.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5 scrollbar-thin">
              <div className="text-[11px] text-sentinel-300 font-medium">
                {results.alerts.length} active alert{results.alerts.length !== 1 ? 's' : ''}
              </div>
              {results.alerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
