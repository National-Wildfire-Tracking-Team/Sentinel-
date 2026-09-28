/**
 * EventReportsTab.jsx
 * Lets a reporter submit and manage hazard events (wildfire, hazmat,
 * hazard, flooding). Ownership stays scoped to the submitting reporter —
 * collaborative cross-reporter editing wasn't part of this feature's scope.
 */

import { useState, useRef } from 'react';
import {
  Flame, Waves, Biohazard, AlertTriangle, MapPin, ChevronDown, CheckCheck,
  Trash2, RefreshCw, AlertCircle, CheckCircle2, Send,
} from 'lucide-react';

import { supabase, isSupabaseConfigured } from '../../../shared/api/supabaseClient';
import { acquireSlot } from '../../utils/mapboxRateLimiter';
import { submitHazardEvent, updateHazardEvent, deleteHazardEvent, normalizeHazardCategory } from '../../hooks/useHazardEvents';
import { HAZARD_CATEGORY_COLORS } from '../../components/Map/layers/HazardEventsLayer';
import {
  INPUT_CLS, LABEL_CLS, SECTION_CLS, SectionHeader, EVENT_SEVERITY_OPTIONS,
  MAPBOX_TOKEN, geocodeViaDirect,
} from './shared';

const EVENT_CATEGORY_META = {
  wildfire: { label: 'Wildfire', icon: Flame },
  hazmat:   { label: 'Hazmat',   icon: Biohazard },
  hazard:   { label: 'Hazard',   icon: AlertTriangle },
  flooding: { label: 'Flooding', icon: Waves },
};

function HazardEventCard({ event, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const meta = EVENT_CATEGORY_META[normalizeHazardCategory(event.category)] || EVENT_CATEGORY_META.hazard;
  const Icon = meta.icon;
  const color = HAZARD_CATEGORY_COLORS[normalizeHazardCategory(event.category)] || HAZARD_CATEGORY_COLORS.hazard;

  async function handleToggleStatus() {
    setBusy(true);
    setFeedback(null);
    try {
      await updateHazardEvent(event.id, { status: event.status === 'active' ? 'resolved' : 'active' });
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to update event.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setFeedback(null);
    try {
      await deleteHazardEvent(event.id);
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to delete event.' });
      setBusy(false);
    }
  }

  return (
    <div className="bg-sentinel-800 border border-sentinel-700 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <div className="p-1 rounded-md shrink-0" style={{ backgroundColor: `${color}22`, border: `1px solid ${color}55` }}>
              <Icon size={11} style={{ color }} />
            </div>
            <h3 className="font-bold text-white text-sm truncate">{event.title}</h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-sentinel-700 border-sentinel-600 text-sentinel-300 uppercase tracking-wider">
              {event.severity}
            </span>
            {event.status !== 'active' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-sentinel-700 border-sentinel-600 text-sentinel-300 uppercase tracking-wider">
                {event.status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sentinel-300 text-xs flex-wrap">
            <span>{meta.label}</span>
            <span className="text-sentinel-500">{new Date(event.created_at).toLocaleDateString()}</span>
          </div>
          {event.description && (
            <p className="text-sentinel-300 text-xs mt-1.5 line-clamp-2">{event.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleToggleStatus}
            disabled={busy}
            title={event.status === 'active' ? 'Mark resolved' : 'Mark active'}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-sentinel-300 border border-sentinel-600 hover:text-green-400 hover:border-green-800 transition-colors disabled:opacity-50"
          >
            <CheckCheck size={12} />
            <span className="hidden sm:inline">{event.status === 'active' ? 'Resolve' : 'Reactivate'}</span>
          </button>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              title="Delete event"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-sentinel-300 border border-sentinel-600 hover:text-red-400 hover:border-red-800 transition-colors disabled:opacity-50"
            >
              <Trash2 size={12} />
              <span className="hidden sm:inline">Delete</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-red-400">Sure?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {busy ? <RefreshCw size={11} className="animate-spin" /> : 'Yes'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-sentinel-300 hover:text-white transition-colors"
              >
                No
              </button>
            </div>
          )}
        </div>
      </div>

      {feedback && (
        <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg text-xs border bg-red-950/40 border-red-800/60 text-red-300">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}

export default function EventReportsTab({ events, userId, onRefresh }) {
  const [category, setCategory]       = useState('wildfire');
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity]       = useState('moderate');
  const [addressSearch, setAddressSearch] = useState('');
  const [suggestions, setSuggestions]     = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError]     = useState(null);
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const searchDebounceRef = useRef(null);

  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);
  const [success, setSuccess] = useState(null);

  function handleAddressChange(e) {
    const val = e.target.value;
    setAddressSearch(val);
    setSearchError(null);
    clearTimeout(searchDebounceRef.current);
    if (!val.trim() || val.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    searchDebounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  }

  async function fetchSuggestions(q) {
    setSearchLoading(true);
    setSearchError(null);
    let features = null;

    if (isSupabaseConfigured) {
      try {
        await acquireSlot();
        const { data, error: err } = await supabase.functions.invoke('mapbox-geocoding', {
          body: { query: q, country: 'us', autocomplete: true, limit: 5 },
        });
        if (!err && Array.isArray(data?.features)) features = data.features;
      } catch {
        // fall through to direct fallback below
      }
    }

    if (features === null && MAPBOX_TOKEN) {
      try {
        features = await geocodeViaDirect(q, { limit: 5, autocomplete: true });
      } catch (err) {
        console.error('Event address suggestion fallback error:', err);
      }
    }

    setSearchLoading(false);

    if (features === null) {
      setSearchError('Address search unavailable. Check your connection or enter a different query.');
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSuggestions(features);
    setShowSuggestions(features.length > 0);
  }

  function applySuggestion(feature) {
    const coords = feature.geometry?.coordinates;
    setAddressSearch(feature.properties?.full_address || feature.place_name || feature.properties?.name || '');
    setLng(Array.isArray(coords) ? Number(coords[0]) : null);
    setLat(Array.isArray(coords) ? Number(coords[1]) : null);
    setSuggestions([]);
    setShowSuggestions(false);
    setSearchError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!title.trim()) { setError('Title is required.'); return; }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError('Please search for a location and select one of the suggested results.');
      return;
    }

    setBusy(true);
    try {
      await submitHazardEvent({
        category,
        title: title.trim(),
        description: description.trim(),
        severity,
        latitude: lat,
        longitude: lng,
        userId,
      });

      setSuccess('Event submitted and is now live on the map.');
      setCategory('wildfire');
      setTitle('');
      setDescription('');
      setSeverity('moderate');
      setAddressSearch('');
      setLat(null);
      setLng(null);
      setSuggestions([]);
      setShowSuggestions(false);
      onRefresh();
    } catch (err) {
      setError(err?.message || 'Failed to submit event.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className={SECTION_CLS}>
        <SectionHeader icon={AlertCircle}>New Hazard Event</SectionHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={LABEL_CLS}>Category</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(EVENT_CATEGORY_META).map(([key, meta]) => {
                const Icon = meta.icon;
                const active = category === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(key)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors
                      ${active
                        ? 'bg-fire-600/20 border-fire-600/40 text-fire-400'
                        : 'border-sentinel-600 text-sentinel-300 hover:border-sentinel-400 hover:text-white'}`}
                  >
                    <Icon size={13} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>Title <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="e.g. Flash flooding on Route 9"
              className={INPUT_CLS}
            />
          </div>

          <div className="relative">
            <label className={LABEL_CLS}>Location <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={addressSearch}
              onChange={handleAddressChange}
              placeholder="Search for an address or place…"
              className={INPUT_CLS}
              autoComplete="off"
            />
            {searchLoading && <p className="text-xs text-sentinel-500 mt-1">Searching…</p>}
            {searchError && <p className="text-xs text-red-400 mt-1">{searchError}</p>}
            {Number.isFinite(lat) && Number.isFinite(lng) && (
              <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                <MapPin size={11} /> {lat.toFixed(4)}, {lng.toFixed(4)}
              </p>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-lg bg-sentinel-700 border border-sentinel-600 shadow-2xl">
                {suggestions.map((feature) => (
                  <li key={feature.id || feature.properties?.mapbox_id}>
                    <button
                      type="button"
                      onMouseDown={() => applySuggestion(feature)}
                      className="w-full text-left px-3 py-2 text-sm text-sentinel-200 hover:bg-sentinel-600 transition-colors"
                    >
                      {feature.properties?.full_address || feature.place_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className={LABEL_CLS}>Severity</label>
            <div className="relative">
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className={INPUT_CLS + ' appearance-none pr-8 cursor-pointer'}
              >
                {EVENT_SEVERITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sentinel-500 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>Description</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              placeholder="Describe what's happening, who's affected, and any immediate risks…"
              className={INPUT_CLS + ' resize-y min-h-[100px]'}
            />
            <div className="text-right text-xs text-sentinel-500 mt-1">{description.length} / 2000</div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-green-950/40 border border-green-800/60 text-green-300 text-xs">
              <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-fire-600 hover:bg-fire-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {busy ? <><RefreshCw size={13} className="animate-spin" /> Submitting…</> : <><Send size={13} /> Submit Event</>}
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-3">Your Hazard Events</h2>
        {events.length === 0 ? (
          <div className="text-sentinel-400 text-sm py-8 text-center">You haven&apos;t submitted any hazard events yet.</div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <HazardEventCard key={event.id} event={event} onRefresh={onRefresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
