import { useState, useCallback } from 'react';
import { Search, MapPin, Loader2, CheckCircle, X, Pencil, Bell, BellOff } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../shared/api/supabaseClient';
import { acquireSlot } from '../../utils/mapboxRateLimiter';
import { useSavedLocations } from '../../hooks/useSavedLocations';
import {
  DEFAULT_RADIUS_MILES,
  RADIUS_OPTIONS_MILES,
} from '../../../../supabase/functions/_shared/savedLocationAlerts.js';

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

/** Zip-code search box shared by "add" and "change location". */
function ZipSearch({ onResult, autoFocus = false, compact = false }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = useCallback(async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setError('');
    setBusy(true);
    try {
      onResult(await geocodeAddress(input.trim()));
      setInput('');
    } catch (err) {
      setError(err.message || 'Zip code not found. Try a different search.');
    } finally {
      setBusy(false);
    }
  }, [input, onResult]);

  return (
    <div className="space-y-2">
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Enter zip code (e.g. 90210)..."
            autoFocus={autoFocus}
            aria-label="Zip code"
            className={`w-full rounded-xl border border-sentinel-600 bg-sentinel-800 pl-9 pr-3 ${compact ? 'py-2' : 'py-2.5'} text-sm text-white placeholder-sentinel-500 focus:outline-none focus:border-fire-600/60 focus:ring-1 focus:ring-fire-600/20 transition-colors`}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className={`btn-glass-fire flex items-center justify-center gap-1.5 px-4 ${compact ? 'py-2' : 'py-2.5'} rounded-xl disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm whitespace-nowrap`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Search
        </button>
      </form>
      {error && (
        <p className="text-xs text-red-400 bg-red-950/40 border border-red-600/40 rounded-xl px-3 py-2.5">{error}</p>
      )}
    </div>
  );
}

/** Name, radius, and notification switch — the editable settings of a location. */
function LocationSettingsFields({ value, onChange, idPrefix }) {
  const radiusOptions = RADIUS_OPTIONS_MILES.includes(value.radius)
    ? RADIUS_OPTIONS_MILES
    : [...RADIUS_OPTIONS_MILES, value.radius].sort((a, b) => a - b);
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idPrefix}-name`} className="block text-[11px] font-semibold uppercase tracking-wider text-sentinel-400 mb-1">
          Name
        </label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          value={value.name}
          maxLength={120}
          onChange={e => onChange({ ...value, name: e.target.value })}
          placeholder="e.g. Home, Work, Cabin"
          className="w-full rounded-lg border border-sentinel-600 bg-sentinel-800 px-3 py-2 text-sm text-white placeholder-sentinel-500 focus:outline-none focus:border-fire-600/60"
        />
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor={`${idPrefix}-radius`} className="block text-[11px] font-semibold uppercase tracking-wider text-sentinel-400 mb-1">
            Alert radius
          </label>
          <select
            id={`${idPrefix}-radius`}
            value={value.radius}
            onChange={e => onChange({ ...value, radius: Number(e.target.value) })}
            className="w-full rounded-lg border border-sentinel-600 bg-sentinel-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-fire-600/60"
          >
            {radiusOptions.map(mi => <option key={mi} value={mi}>{mi} miles</option>)}
          </select>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value.alertsEnabled}
          onClick={() => onChange({ ...value, alertsEnabled: !value.alertsEnabled })}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
            value.alertsEnabled
              ? 'bg-fire-600/25 border-fire-600/50 text-fire-300'
              : 'bg-sentinel-800 border-sentinel-600 text-sentinel-400'
          }`}
        >
          {value.alertsEnabled ? <Bell size={13} /> : <BellOff size={13} />}
          Notifications {value.alertsEnabled ? 'on' : 'off'}
        </button>
      </div>
    </div>
  );
}

function SavedLocationRow({ loc, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [newPlace, setNewPlace] = useState(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  const startEdit = () => {
    setDraft({
      name: loc.name,
      radius: loc.notify_radius_miles ?? DEFAULT_RADIUS_MILES,
      alertsEnabled: loc.alerts_enabled !== false,
    });
    setNewPlace(null);
    setError('');
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await onUpdate(loc.id, {
        name: draft.name,
        notify_radius_miles: draft.radius,
        alerts_enabled: draft.alertsEnabled,
        ...(newPlace && {
          address: newPlace.placeName,
          latitude: newPlace.lat,
          longitude: newPlace.lng,
        }),
      });
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Failed to update location.');
    } finally {
      setBusy(false);
    }
  };

  const toggleAlerts = async () => {
    setBusy(true);
    setError('');
    try {
      await onUpdate(loc.id, { alerts_enabled: loc.alerts_enabled === false });
    } catch (err) {
      setError(err.message || 'Failed to update notifications.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    setError('');
    try {
      await onRemove(loc.id);
    } catch (err) {
      setError(err.message || 'Failed to delete location.');
      setRemoving(false);
    }
  };

  const alertsOn = loc.alerts_enabled !== false;

  return (
    <div className="rounded-xl border border-sentinel-700 bg-sentinel-800/50 px-3.5 py-3 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 rounded-full bg-black border-2 border-white flex items-center justify-center shrink-0 shadow">
          <PinIcon size={9} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{loc.name}</p>
          <p className="text-[11px] text-sentinel-400 truncate">
            {loc.address && loc.address !== loc.name ? `${loc.address} · ` : ''}
            {loc.notify_radius_miles ?? DEFAULT_RADIUS_MILES} mi radius
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={alertsOn}
          onClick={toggleAlerts}
          disabled={busy || editing}
          title={alertsOn ? 'Notifications on' : 'Notifications off'}
          className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 shrink-0 ${
            alertsOn ? 'text-fire-400 hover:bg-fire-600/15' : 'text-sentinel-500 hover:bg-sentinel-700'
          }`}
          aria-label={`${alertsOn ? 'Turn off' : 'Turn on'} notifications for ${loc.name}`}
        >
          {alertsOn ? <Bell size={14} /> : <BellOff size={14} />}
        </button>
        <button
          type="button"
          onClick={editing ? () => setEditing(false) : startEdit}
          className="p-1.5 rounded-lg text-sentinel-400 hover:text-white hover:bg-sentinel-700 transition-colors shrink-0"
          aria-label={editing ? `Cancel editing ${loc.name}` : `Edit ${loc.name}`}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={removing}
          className="p-1.5 rounded-lg text-sentinel-400 hover:text-red-400 hover:bg-red-950/30 transition-colors disabled:opacity-40 shrink-0"
          aria-label={`Remove ${loc.name}`}
        >
          {removing ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
        </button>
      </div>

      {editing && draft && (
        <div className="space-y-3 border-t border-sentinel-700 pt-3">
          <LocationSettingsFields value={draft} onChange={setDraft} idPrefix={`edit-${loc.id}`} />
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-sentinel-400">
              Location {newPlace ? '(changed)' : ''}
            </p>
            <p className="text-xs text-sentinel-300 truncate">{newPlace?.placeName || loc.address || loc.name}</p>
            <ZipSearch onResult={setNewPlace} compact />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="btn-glass-fire flex-1 flex items-center justify-center gap-2 rounded-lg disabled:opacity-50 px-3 py-2 text-sm font-semibold"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Save changes
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-sentinel-600 px-3 py-2 text-sm text-sentinel-300 hover:bg-sentinel-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export default function MapAddressSearchPanel({ onClose, asPage = false }) {
  const { addLocation, removeLocation, updateLocation, locations, atLimit, limit } = useSavedLocations();
  const [confirmedLocation, setConfirmedLocation] = useState(null);
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleResult = useCallback((result) => {
    setSaveError('');
    setConfirmedLocation(result);
    setSettings({ name: '', radius: DEFAULT_RADIUS_MILES, alertsEnabled: true });
  }, []);

  const handleSave = useCallback(async () => {
    if (!confirmedLocation) return;
    setSaving(true);
    setSaveError('');
    try {
      await addLocation({
        name: settings.name.trim() || confirmedLocation.placeName,
        address: confirmedLocation.placeName,
        latitude: confirmedLocation.lat,
        longitude: confirmedLocation.lng,
        notifyRadiusMiles: settings.radius,
        alertsEnabled: settings.alertsEnabled,
      });
      setConfirmedLocation(null);
      setSettings(null);
    } catch (err) {
      setSaveError(err.message || 'Failed to save location.');
    } finally {
      setSaving(false);
    }
  }, [confirmedLocation, settings, addLocation]);

  const canClose = typeof onClose === 'function';
  const finiteLimit = Number.isFinite(limit);

  return (
    <div
      className={asPage
        ? 'w-full'
        : 'fixed inset-0 z-[150] flex justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4'}
      onClick={(e) => {
        if (!asPage && canClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`w-full max-w-lg my-auto rounded-2xl border border-sentinel-600 bg-sentinel-900 overflow-hidden animate-fade-in ${asPage ? '' : 'shadow-2xl'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sentinel-700">
          <div className="flex items-center gap-2.5">
            <MapPin size={18} className="text-fire-500" />
            <h2 className="text-base font-bold text-white">Saved Locations</h2>
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
            Search a zip code to save it, mark it on the live map, and get emailed when a wildfire
            or a weather alert you follow is within its radius.
            {finiteLimit && ` Up to ${limit} locations on your plan.`}
          </p>

          {atLimit ? (
            <p className="text-xs text-yellow-400 bg-yellow-950/30 border border-yellow-700/40 rounded-xl px-3 py-2.5">
              You've reached your plan's limit of {limit} saved locations. Remove one to add another.
            </p>
          ) : (
            <ZipSearch onResult={handleResult} autoFocus />
          )}

          {/* New location settings */}
          {confirmedLocation && settings && !atLimit && (
            <div className="rounded-xl border border-sentinel-600 bg-sentinel-800/60 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-black border-2 border-white flex items-center justify-center shrink-0 mt-0.5 shadow-md">
                  <PinIcon size={11} />
                </div>
                <p className="text-sm font-medium text-white leading-snug flex-1">{confirmedLocation.placeName}</p>
              </div>
              <LocationSettingsFields value={settings} onChange={setSettings} idPrefix="new-location" />
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-glass-fire w-full flex items-center justify-center gap-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-sm font-semibold"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Save &amp; Mark on Map
              </button>
            </div>
          )}

          {saveError && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-600/40 rounded-xl px-3 py-2.5">
              {saveError}
            </p>
          )}

          {/* Saved locations */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-sentinel-300 uppercase tracking-wider">
                Your Locations
              </h3>
              <span className="text-xs text-sentinel-500">
                {locations.length} / {finiteLimit ? limit : '∞'} used
              </span>
            </div>

            {locations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-sentinel-700 bg-sentinel-800/20 px-4 py-8 text-center">
                <MapPin size={22} className="text-sentinel-600 mx-auto mb-2" />
                <p className="text-sm text-sentinel-500">No locations saved yet.</p>
                <p className="text-xs text-sentinel-600 mt-1">Search above to add your first location.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {locations.map(loc => (
                  <SavedLocationRow
                    key={loc.id}
                    loc={loc}
                    onUpdate={updateLocation}
                    onRemove={removeLocation}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
