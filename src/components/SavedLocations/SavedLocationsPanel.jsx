/**
 * SavedLocationsPanel.jsx
 * Sidebar panel for managing saved locations with live alert checks.
 * Free accounts: up to 4 locations (FREE_LOCATION_LIMIT).
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin, Plus, Trash2, Loader2, AlertTriangle,
  ChevronDown, ChevronUp, LogIn, Lock, RefreshCw,
  Bell, CheckCircle2,
} from 'lucide-react';

import { useSavedLocations, fetchLocationAlerts, FREE_LOCATION_LIMIT } from '../../hooks/useSavedLocations';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { supabase, isSupabaseConfigured } from '../../api/supabaseClient';
import { acquireSlot } from '../../utils/mapboxRateLimiter';

// ── Geocoding helper ──────────────────────────────────────────────────────────

async function geocodeAddress(address) {
  if (!isSupabaseConfigured) throw new Error('Geocoding unavailable – Supabase not configured');
  await acquireSlot();
  const { data, error } = await supabase.functions.invoke('mapbox-geocoding', {
    body: { query: address, country: 'us', limit: 1, types: 'address,place,postcode,neighborhood,locality' },
  });
  if (error) throw new Error('Geocoding failed');
  if (!data?.features?.length) throw new Error('Address not found');
  const [lng, lat] = data.features[0].center;
  return { lat, lng, placeName: data.features[0].place_name };
}

// ── Severity styling ──────────────────────────────────────────────────────────

const SEVERITY_ORDER = ['Extreme', 'Severe', 'Moderate', 'Minor'];

const SEVERITY_CARD = {
  Extreme:  'border-red-700/50 bg-red-950/40 text-red-200',
  Severe:   'border-orange-700/50 bg-orange-950/40 text-orange-200',
  Moderate: 'border-yellow-700/50 bg-yellow-950/40 text-yellow-200',
  Minor:    'border-blue-700/50 bg-blue-950/40 text-blue-200',
};

const SEVERITY_BADGE = {
  Extreme:  'bg-red-600/30 border-red-700/50 text-red-300',
  Severe:   'bg-orange-600/30 border-orange-700/50 text-orange-300',
  Moderate: 'bg-yellow-600/30 border-yellow-700/50 text-yellow-300',
  Minor:    'bg-blue-600/30 border-blue-700/50 text-blue-300',
};

function maxSeverity(alerts) {
  if (!alerts?.length) return null;
  return alerts.reduce((max, a) => {
    const mi = SEVERITY_ORDER.indexOf(a.severity);
    const ci = SEVERITY_ORDER.indexOf(max);
    return mi !== -1 && (ci === -1 || mi < ci) ? a.severity : max;
  }, 'Minor');
}

// ── AlertBadge ───────────────────────────────────────────────────────────────

function AlertBadge({ count, severity }) {
  if (!count) return null;
  const style = SEVERITY_BADGE[severity] || 'bg-sentinel-700 border-sentinel-600 text-sentinel-300';
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-bold leading-none ${style}`}>
      <AlertTriangle size={8} />
      {count}
    </span>
  );
}

// ── LocationCard ─────────────────────────────────────────────────────────────

function LocationCard({ location, onDelete, onFlyTo }) {
  const [alerts, setAlerts]           = useState(null);   // null = not yet loaded
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [alertError, setAlertError]   = useState(null);
  const [expanded, setExpanded]       = useState(false);
  const [deleting, setDeleting]       = useState(false);

  const loadAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    setAlertError(null);
    try {
      const result = await fetchLocationAlerts(location.latitude, location.longitude);
      setAlerts(result);
    } catch (err) {
      setAlertError('Could not fetch alerts');
      setAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  }, [location.latitude, location.longitude]);

  // Load alerts on mount
  useEffect(() => {
    if (location.alerts_enabled) loadAlerts();
    else setAlerts([]);
  }, [location.alerts_enabled, loadAlerts]);

  const sev = maxSeverity(alerts);
  const hasAlerts = alerts?.length > 0;

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(location.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg bg-sentinel-800 border border-sentinel-700 overflow-hidden">
      {/* Card header row */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        {/* Location pin icon */}
        <div className="w-7 h-7 rounded-full bg-fire-600/15 border border-fire-500/25
                        flex items-center justify-center shrink-0">
          <MapPin size={13} className="text-fire-400" />
        </div>

        {/* Name + address */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap leading-none">
            <span className="text-xs font-semibold text-white">{location.name}</span>
            {loadingAlerts
              ? <Loader2 size={10} className="text-sentinel-400 animate-spin" />
              : <AlertBadge count={alerts?.length} severity={sev} />
            }
          </div>
          {location.address && (
            <p className="text-[11px] text-sentinel-400 truncate mt-0.5">{location.address}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => onFlyTo(location)}
            title="Fly to location"
            className="p-1.5 rounded text-sentinel-400 hover:text-sky-400 hover:bg-sentinel-700 transition-colors"
          >
            <MapPin size={12} />
          </button>

          {hasAlerts && (
            <button
              onClick={() => setExpanded(v => !v)}
              title={expanded ? 'Hide alerts' : 'Show alerts'}
              className="p-1.5 rounded text-sentinel-400 hover:text-white hover:bg-sentinel-700 transition-colors"
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}

          <button
            onClick={() => loadAlerts()}
            disabled={loadingAlerts}
            title="Refresh alerts"
            className="p-1.5 rounded text-sentinel-400 hover:text-white hover:bg-sentinel-700 disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={11} className={loadingAlerts ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Remove location"
            className="p-1.5 rounded text-sentinel-400 hover:text-red-400 hover:bg-red-950/30 disabled:opacity-40 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* No alerts indicator */}
      {alerts !== null && !hasAlerts && !loadingAlerts && (
        <div className="px-2.5 pb-2 flex items-center gap-1.5 text-[11px] text-green-400">
          <CheckCircle2 size={11} />
          No active alerts
        </div>
      )}

      {alertError && (
        <div className="px-2.5 pb-2 text-[11px] text-red-400">{alertError}</div>
      )}

      {/* Expanded alert list */}
      {expanded && hasAlerts && (
        <div className="border-t border-sentinel-700 p-2 space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
          {alerts.map(alert => {
            const style = SEVERITY_CARD[alert.severity] || 'border-sentinel-600 bg-sentinel-700/30 text-sentinel-300';
            return (
              <div key={alert.id} className={`rounded px-2 py-1.5 border text-[11px] ${style}`}>
                <div className="font-semibold">{alert.type}</div>
                {alert.headline && (
                  <div className="opacity-80 text-[10px] mt-0.5 line-clamp-2">{alert.headline}</div>
                )}
                {alert.expires && (
                  <div className="opacity-60 text-[10px] mt-0.5">
                    Expires: {new Date(alert.expires).toLocaleString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── AddLocationForm ───────────────────────────────────────────────────────────

function AddLocationForm({ onAdd, onCancel, busy }) {
  const [name, setName]             = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [geocoding, setGeocoding]   = useState(false);
  const [geocodeResult, setGeoResult] = useState(null);
  const [formError, setFormError]   = useState(null);

  async function handleGeocode() {
    const q = addressQuery.trim();
    if (!q) return;
    setGeocoding(true);
    setFormError(null);
    setGeoResult(null);
    try {
      const result = await geocodeAddress(q);
      setGeoResult(result);
      // Auto-fill name from the first segment of the place name
      if (!name.trim()) {
        setName(result.placeName.split(',')[0].trim().slice(0, 30));
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setGeocoding(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!geocodeResult) { setFormError('Search and confirm an address first'); return; }
    if (!name.trim())   { setFormError('Enter a label for this location');     return; }
    setFormError(null);
    await onAdd({
      name: name.trim(),
      address: geocodeResult.placeName,
      latitude:  geocodeResult.lat,
      longitude: geocodeResult.lng,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 rounded-lg border border-sentinel-600 bg-sentinel-800/80 space-y-2.5">
      <p className="text-xs font-bold text-white">New Saved Location</p>

      {/* Address search */}
      <div className="flex gap-1.5">
        <input
          value={addressQuery}
          onChange={e => setAddressQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleGeocode(); } }}
          placeholder="Search address or city…"
          className="flex-1 px-2.5 py-1.5 bg-sentinel-700 border border-sentinel-600 rounded-md
                     text-xs text-white placeholder-sentinel-400
                     focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 transition-colors"
        />
        <button
          type="button"
          onClick={handleGeocode}
          disabled={geocoding || !addressQuery.trim()}
          className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500
                     disabled:bg-sentinel-600 disabled:text-sentinel-400
                     text-white text-xs font-semibold rounded-md transition-colors shrink-0"
        >
          {geocoding ? <Loader2 size={12} className="animate-spin" /> : 'Find'}
        </button>
      </div>

      {/* Geocode result confirmation */}
      {geocodeResult && (
        <div className="flex items-center gap-1.5 text-[11px] text-green-300
                        bg-green-950/30 border border-green-800/40 rounded px-2 py-1.5">
          <MapPin size={10} className="shrink-0" />
          <span className="truncate">{geocodeResult.placeName}</span>
        </div>
      )}

      {/* Location label */}
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Label (e.g. Home, Work, Cabin)"
        maxLength={30}
        className="w-full px-2.5 py-1.5 bg-sentinel-700 border border-sentinel-600 rounded-md
                   text-xs text-white placeholder-sentinel-400
                   focus:outline-none focus:border-fire-500 focus:ring-1 focus:ring-fire-500/20 transition-colors"
      />

      {formError && (
        <p className="text-[11px] text-red-300">{formError}</p>
      )}

      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={busy || !geocodeResult || !name.trim()}
          className="flex-1 py-1.5 bg-fire-600 hover:bg-fire-500
                     disabled:bg-sentinel-700 disabled:text-sentinel-400
                     text-white text-xs font-semibold rounded-md transition-colors"
        >
          {busy ? 'Saving…' : 'Save Location'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-sentinel-300 hover:text-white
                     border border-sentinel-600 rounded-md transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── SavedLocationsPanel ───────────────────────────────────────────────────────

export default function SavedLocationsPanel() {
  const { isAuthenticated } = useAuth();
  const { setViewport } = useApp();
  const {
    locations, loading, error,
    addLocation, removeLocation,
    atLimit, limit,
  } = useSavedLocations();

  const [showAddForm, setShowAddForm] = useState(false);
  const [addBusy, setAddBusy]         = useState(false);
  const [addError, setAddError]       = useState(null);

  async function handleAdd(data) {
    setAddBusy(true);
    setAddError(null);
    try {
      await addLocation(data);
      setShowAddForm(false);
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddBusy(false);
    }
  }

  function handleFlyTo(location) {
    setViewport({ longitude: location.longitude, latitude: location.latitude, zoom: 10 });
  }

  // ── Unauthenticated state ──
  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
        <div className="w-14 h-14 rounded-full bg-sentinel-800 border border-sentinel-700
                        flex items-center justify-center">
          <Lock size={22} className="text-sentinel-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white mb-1">Sign in to save locations</p>
          <p className="text-xs text-sentinel-400 leading-relaxed">
            Track up to {limit} locations and get real-time fire &amp; weather alert summaries.
          </p>
        </div>
        <Link
          to="/login"
          className="flex items-center gap-2 px-4 py-2 bg-fire-600 hover:bg-fire-500
                     text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <LogIn size={13} />
          Sign In
        </Link>
      </div>
    );
  }

  // ── Authenticated state ──
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">

      {/* ── Top bar: count + Add button ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Bell size={13} className="text-sentinel-400" />
          <span className="text-xs text-sentinel-400">
            {locations.length}/{limit} saved
          </span>
          {atLimit && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40
                             border border-amber-700/40 text-amber-300 font-semibold">
              Limit reached
            </span>
          )}
        </div>

        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            disabled={atLimit}
            title={atLimit ? `Free accounts support up to ${limit} saved locations` : 'Add a location'}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                       bg-fire-600/90 hover:bg-fire-500 text-white
                       disabled:bg-sentinel-700 disabled:text-sentinel-500
                       transition-colors"
          >
            <Plus size={12} />
            Add
          </button>
        )}
      </div>

      {/* ── Free-tier limit notice ── */}
      {atLimit && !showAddForm && (
        <div className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-800/40
                        rounded-lg px-2.5 py-2">
          Free accounts support up to {FREE_LOCATION_LIMIT} saved locations.
        </div>
      )}

      {/* ── Add location form ── */}
      {showAddForm && (
        <AddLocationForm
          onAdd={handleAdd}
          onCancel={() => { setShowAddForm(false); setAddError(null); }}
          busy={addBusy}
        />
      )}

      {addError && (
        <p className="text-xs text-red-300 bg-red-950/40 border border-red-800/50
                      rounded-lg px-2.5 py-1.5">
          {addError}
        </p>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-sentinel-400">
          <Loader2 size={14} className="animate-spin" />
          Loading…
        </div>
      )}

      {/* ── Fetch error ── */}
      {error && (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-800/50
                        rounded-lg px-2.5 py-1.5">
          {error}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && locations.length === 0 && !showAddForm && (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
          <MapPin size={30} className="text-sentinel-600" />
          <div>
            <p className="text-sm text-white font-semibold">No saved locations yet</p>
            <p className="text-xs text-sentinel-400 mt-1 leading-relaxed max-w-[200px] mx-auto">
              Save up to {limit} locations to monitor for active fire &amp; weather alerts.
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-fire-600 hover:bg-fire-500
                       text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Plus size={13} />
            Add First Location
          </button>
        </div>
      )}

      {/* ── Location cards ── */}
      {locations.map(loc => (
        <LocationCard
          key={loc.id}
          location={loc}
          onDelete={removeLocation}
          onFlyTo={handleFlyTo}
        />
      ))}
    </div>
  );
}
