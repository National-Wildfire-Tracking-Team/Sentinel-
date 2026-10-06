/**
 * ManageIncidentsTab.jsx
 * Lists every reporter-submitted incident (not just the current user's own —
 * any reporter/admin can collaboratively edit or delete any incident, backed
 * by the "reports update/delete any reporter" RLS policies) and lets the
 * viewer edit, post an operational update, or delete it.
 */

import { useState, useRef } from 'react';
import {
  MapPin, ChevronDown, ChevronUp, Clock, Activity, Pencil, Trash2,
  RefreshCw, Send, AlertCircle, CheckCircle2, User, Search, Loader2, RotateCcw, Siren,
} from 'lucide-react';

import {
  appendFireReportUpdate,
  updateFireReport,
  deleteFireReport,
} from '../../hooks/useFireReports';
import { insertReporterUpdate } from '../../hooks/useIncidentUpdates';
import { useImageAttachments } from '../../hooks/useImageAttachments';
import { uploadIncidentPhotos } from '../../api/incidentPhotos';
import { acquireSlot } from '../../utils/mapboxRateLimiter';
import PhotoPickerButton from '../../components/PhotoAttachments/PhotoPickerButton';
import IncidentLocationPicker from '../../components/Map/IncidentLocationPicker';
import { POSTABLE_UPDATE_TYPES, UPDATE_TYPE_LABELS } from '../../components/FireDetailPanel/incidentDetailModel';
import IncidentEvacShelterEditor from './IncidentEvacShelterEditor';
import {
  INPUT_CLS, LABEL_CLS, SECTION_CLS, StatusBadge, MAPBOX_TOKEN, geocodeViaDirect,
  reverseGeocodeViaDirect,
} from './shared';
import {
  extractAddressFromDescription, stripAddressFromDescription, replaceAddressInDescription,
  isValidCoordinate, formatCoordinates, hasLocationChanged,
} from './incidentLocation';

/* Address search via the edge function, falling back to direct Mapbox.
 * Returns an array of features, or null when both are unavailable. */
async function searchAddresses(query, { limit = 5, autocomplete = true } = {}) {
  try {
    const { supabase, isSupabaseConfigured } =
      await import('../../../shared/api/supabaseClient');

    if (isSupabaseConfigured) {
      await acquireSlot();
      const { data, error } = await supabase.functions.invoke('mapbox-geocoding', {
        body: { query, country: 'us', autocomplete, limit, types: 'address' },
      });
      if (!error && Array.isArray(data?.features)) return data.features;
    }
  } catch {
    // Edge function unavailable — fall through to the direct Mapbox call.
  }

  if (MAPBOX_TOKEN) {
    try {
      await acquireSlot();
      return await geocodeViaDirect(query, { limit, types: 'address', autocomplete });
    } catch (err) {
      console.error('Edit address search error:', err);
    }
  }
  return null;
}

function featureToLocation(feature) {
  const coords = feature?.geometry?.coordinates;
  return {
    address: feature?.properties?.full_address || feature?.place_name || feature?.properties?.name || '',
    longitude: Array.isArray(coords) ? Number(coords[0]) : null,
    latitude: Array.isArray(coords) ? Number(coords[1]) : null,
  };
}

function toCoordinate(value) {
  return value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
    ? null
    : Number(value);
}

function IncidentCard({ report, profile, userId, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState('view'); // 'view' | 'edit' | 'update' | 'evac' | 'confirm-delete'

  const isOwn = report.user_id === userId;

  /* Edit state */
  const [editTitle, setEditTitle]       = useState(report.title);
  const [editDescription, setEditDescription] = useState(report.description || '');
  const [editBusy, setEditBusy]         = useState(false);
  const [editFeedback, setEditFeedback] = useState(null);

  /* Edit location state. `locatedAddress` is the address text that matches
   * the current coordinates; when the field no longer matches it the typed
   * address hasn't been placed on the map yet. */
  const [editAddress, setEditAddress] = useState('');
  const [locatedAddress, setLocatedAddress] = useState('');
  const [editLatitude, setEditLatitude] = useState(toCoordinate(report.latitude));
  const [editLongitude, setEditLongitude] = useState(toCoordinate(report.longitude));
  const [pinMoved, setPinMoved] = useState(false);
  const [reverseLookupBusy, setReverseLookupBusy] = useState(false);
  const reverseLookupId = useRef(0);

  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);
  const [addressSearchError, setAddressSearchError] = useState(null);
  const addressDebounceRef = useRef(null);

  /* Update (append notes) state */
  const [updateAcreage, setUpdateAcreage] = useState('');
  const [updateContainment, setUpdateContainment] = useState('');
  const [updateNotes, setUpdateNotes]     = useState('');
  const [updateType, setUpdateType]       = useState('field_report');
  const [updateBusy, setUpdateBusy]       = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState(null);
  const updatePhotos = useImageAttachments();

  /* Delete state */
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const originalLocation = {
    latitude: toCoordinate(report.latitude),
    longitude: toCoordinate(report.longitude),
  };
  const addressUnplaced = editAddress.trim() !== '' && editAddress.trim() !== locatedAddress.trim();

  function startEdit() {
    const address = extractAddressFromDescription(report.description || '');

    setEditTitle(report.title);
    setEditDescription(stripAddressFromDescription(report.description || ''));
    resetLocation(address);
    setEditFeedback(null);
    setUpdateFeedback(null);
  }

  function resetLocation(address = extractAddressFromDescription(report.description || '')) {
    reverseLookupId.current += 1;
    clearTimeout(addressDebounceRef.current);
    setEditAddress(address);
    setLocatedAddress(address);
    setEditLatitude(originalLocation.latitude);
    setEditLongitude(originalLocation.longitude);
    setPinMoved(false);
    setReverseLookupBusy(false);
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    setAddressSearchError(null);
  }

  function handleEditAddressChange(e) {
    const value = e.target.value;

    setEditAddress(value);
    setAddressSearchError(null);
    clearTimeout(addressDebounceRef.current);

    if (value.trim().length < 3) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }

    addressDebounceRef.current = setTimeout(() => {
      fetchEditAddressSuggestions(value);
    }, 300);
  }

  async function fetchEditAddressSuggestions(query) {
    setAddressSearchLoading(true);
    setAddressSearchError(null);

    const features = await searchAddresses(query);

    setAddressSearchLoading(false);

    if (features === null) {
      setAddressSearchError('Address search unavailable. Check your connection or try again.');
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }

    setAddressSuggestions(features);
    setShowAddressSuggestions(features.length > 0);
  }

  function applyEditAddressSuggestion(feature) {
    const { address, latitude, longitude } = featureToLocation(feature);

    reverseLookupId.current += 1;
    setReverseLookupBusy(false);
    setEditAddress(address);
    setLocatedAddress(address);
    if (isValidCoordinate(latitude, longitude)) {
      setEditLatitude(latitude);
      setEditLongitude(longitude);
    }

    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    setAddressSearchError(null);
  }

  /* Pin dragged or map clicked: move the incident there and look up the
   * nearest address to fill the address field. */
  async function handlePinMove({ latitude, longitude }) {
    const lookupId = ++reverseLookupId.current;

    setEditLatitude(latitude);
    setEditLongitude(longitude);
    setPinMoved(true);
    setShowAddressSuggestions(false);
    setAddressSearchError(null);

    if (!MAPBOX_TOKEN) return;

    setReverseLookupBusy(true);
    try {
      await acquireSlot();
      const address = await reverseGeocodeViaDirect(latitude, longitude);
      if (lookupId !== reverseLookupId.current) return;
      if (address) {
        setEditAddress(address);
        setLocatedAddress(address);
      } else {
        setAddressSearchError('No address found at this spot. Type a description of the location, or leave the address as is.');
      }
    } catch (err) {
      if (lookupId !== reverseLookupId.current) return;
      console.error('Reverse geocoding error:', err);
      setAddressSearchError('Could not look up the address for this spot. You can type it in manually.');
    } finally {
      if (lookupId === reverseLookupId.current) setReverseLookupBusy(false);
    }
  }

  async function handleEditSave() {
    if (!editTitle.trim()) {
      setEditFeedback({ type: 'error', message: 'Incident title is required.' });
      return;
    }

    const address = editAddress.trim();
    let latitude = editLatitude;
    let longitude = editLongitude;

    setEditBusy(true);
    setEditFeedback(null);

    try {
      // A typed address that was never picked from the list or matched to
      // the pin: geocode it, unless the reporter has placed the pin by hand
      // (then the pin wins and the text is kept as the address label).
      if (addressUnplaced && !pinMoved) {
        const features = await searchAddresses(address, { limit: 1, autocomplete: false });
        const match = features?.[0] ? featureToLocation(features[0]) : null;
        if (!match || !isValidCoordinate(match.latitude, match.longitude)) {
          setEditFeedback({
            type: 'error',
            message: 'Could not find that address. Pick a suggestion from the list, or drop the pin on the map.',
          });
          return;
        }
        latitude = match.latitude;
        longitude = match.longitude;
        setEditLatitude(latitude);
        setEditLongitude(longitude);
        setLocatedAddress(address);
      }

      if (!isValidCoordinate(latitude, longitude)) {
        setEditFeedback({
          type: 'error',
          message: 'Set the incident location: search for an address or click the map.',
        });
        return;
      }

      const description = address
        ? replaceAddressInDescription(editDescription, address)
        : editDescription;

      await updateFireReport(report.id, {
        title: editTitle.trim(),
        description,
        latitude,
        longitude,
      });

      if (hasLocationChanged(originalLocation, { latitude, longitude })) {
        const where = address
          ? `${address} (${formatCoordinates(latitude, longitude)})`
          : formatCoordinates(latitude, longitude);
        try {
          await insertReporterUpdate({
            incidentId: report.id,
            content: `Incident location updated to ${where}.`,
            sourceName: profile?.email?.split('@')[0] || 'Reporter',
            userId,
            updateType: 'location',
          });
        } catch (err) {
          // The move itself saved; a missing timeline entry shouldn't fail it.
          console.warn('Failed to log location change:', err);
        }
      }

      setEditFeedback({ type: 'success', message: 'Incident updated successfully.' });
      setMode('view');
      onRefresh();
    } catch (err) {
      setEditFeedback({ type: 'error', message: err?.message || 'Failed to save changes.' });
    } finally {
      setEditBusy(false);
    }
  }

  async function handlePostUpdate() {
    const hasAcres = updateAcreage.toString().trim().length > 0;
    const hasContain = updateContainment.toString().trim().length > 0;
    const hasNotes = updateNotes.trim().length > 0;
    const hasPhotos = updatePhotos.images.length > 0;
    if (!hasAcres && !hasContain && !hasNotes && !hasPhotos) {
      setUpdateFeedback({ type: 'error', message: 'Enter acreage, containment, notes, or attach a photo before posting.' });
      return;
    }
    if (hasContain && !Number.isFinite(Number(updateContainment))) {
      setUpdateFeedback({ type: 'error', message: 'Containment must be a number between 0 and 100.' });
      return;
    }
    setUpdateBusy(true);
    setUpdateFeedback(null);
    try {
      await appendFireReportUpdate({
        id: report.id,
        description: report.description || '',
        acreage: updateAcreage,
        containment: hasContain ? updateContainment : undefined,
        notes: updateNotes,
      });

      const parts = [];
      if (hasAcres) parts.push(`Acreage: ${updateAcreage.toString().trim()}`);
      if (hasContain) {
        const c = Math.min(100, Math.max(0, Math.round(Number(updateContainment))));
        parts.push(`Containment: ${c}%`);
      }
      if (hasNotes) parts.push(updateNotes.trim());

      const photoUrls = hasPhotos
        ? await uploadIncidentPhotos(updatePhotos.images.map((img) => img.file), { userId, incidentId: report.id })
        : [];

      await insertReporterUpdate({
        incidentId: report.id,
        content: parts.join('\n'),
        sourceName: profile?.email?.split('@')[0] || 'Reporter',
        userId,
        photoUrls,
        updateType,
      });

      setUpdateType('field_report');
      setUpdateAcreage('');
      setUpdateContainment('');
      setUpdateNotes('');
      updatePhotos.reset();
      setUpdateFeedback({ type: 'success', message: 'Update posted successfully.' });
      setMode('view');
      onRefresh();
    } catch (err) {
      setUpdateFeedback({ type: 'error', message: err?.message || 'Failed to post update.' });
    } finally {
      setUpdateBusy(false);
    }
  }

  async function handleDelete() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteFireReport(report.id);
      onRefresh();
    } catch (err) {
      setDeleteBusy(false);
      setDeleteError(err?.message || 'Failed to delete incident.');
      setMode('view');
    }
  }

  const formattedDate = (() => {
    try {
      return new Date(report.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return report.created_at;
    }
  })();

  return (
    <div className={`${SECTION_CLS} transition-all`}>
      {/* Card header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-bold text-white text-base truncate">{report.title}</h3>
            <StatusBadge status={report.status} />
          </div>
          <div className="flex items-center gap-3 text-sentinel-300 text-xs flex-wrap">
            <span className="flex items-center gap-1"><Clock size={11} /> {formattedDate}</span>
            {report.latitude && report.longitude && (
              <span className="flex items-center gap-1">
                <MapPin size={11} />
                {Number(report.latitude).toFixed(4)}, {Number(report.longitude).toFixed(4)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <User size={11} />
              {isOwn ? 'You' : `Reporter ${report.user_id?.slice(0, 8)}…`}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => { setMode(mode === 'update' ? 'view' : 'update'); setExpanded(true); setEditFeedback(null); setUpdateFeedback(null); }}
            title="Post Update"
            className={`p-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5
              ${mode === 'update' ? 'bg-fire-600/20 text-fire-400 border border-fire-600/30' : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700'}`}
          >
            <Activity size={14} />
            <span className="hidden sm:inline">Update</span>
          </button>
          <button
            onClick={() => { setMode(mode === 'evac' ? 'view' : 'evac'); setExpanded(true); }}
            title="Evacuations & Shelters"
            className={`p-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5
              ${mode === 'evac' ? 'bg-red-500/15 text-red-400 border border-red-500/30' : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700'}`}
          >
            <Siren size={14} />
            <span className="hidden sm:inline">Evac</span>
          </button>
          <button
            onClick={() => {
              setMode(mode === 'edit' ? 'view' : 'edit');
              setExpanded(true);
              startEdit();
            }}
            title="Edit Incident"
            className={`p-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5
              ${mode === 'edit' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700'}`}
          >
            <Pencil size={14} />
            <span className="hidden sm:inline">Edit</span>
          </button>
          <button
            onClick={() => { setMode('confirm-delete'); setExpanded(true); }}
            title="Delete Incident"
            className="p-2 rounded-lg text-sentinel-300 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-2 rounded-lg text-sentinel-300 hover:text-white hover:bg-sentinel-700 transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expandable body */}
      {expanded && (
        <div className="mt-5 border-t border-sentinel-700 pt-5 space-y-5">

          {/* VIEW MODE — show description */}
          {mode === 'view' && (
            <div>
              {editFeedback?.type === 'success' && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-950/40 border border-green-800/60 text-green-300 text-xs mb-4">
                  <CheckCircle2 size={13} /> {editFeedback.message}
                </div>
              )}
              {updateFeedback?.type === 'success' && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-950/40 border border-green-800/60 text-green-300 text-xs mb-4">
                  <CheckCircle2 size={13} /> {updateFeedback.message}
                </div>
              )}
              <p className="text-sm text-sentinel-300 whitespace-pre-wrap leading-relaxed">
                {report.description || <span className="italic text-sentinel-500">No description provided.</span>}
              </p>
            </div>
          )}

          {/* EDIT MODE */}
          {mode === 'edit' && (
            <div className="space-y-4">
              <div>
                <label className={LABEL_CLS}>Incident Title <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. Caldor Fire"
                  className={INPUT_CLS}
                />
              </div>

              {/* Location — address search or drag the pin */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={LABEL_CLS.replace('mb-1.5', 'mb-0')}>Location</label>
                  {hasLocationChanged(originalLocation, { latitude: editLatitude, longitude: editLongitude }) && (
                    <button
                      type="button"
                      onClick={() => resetLocation()}
                      className="flex items-center gap-1 text-xs text-sentinel-400 hover:text-white transition-colors"
                    >
                      <RotateCcw size={11} /> Reset location
                    </button>
                  )}
                </div>
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-sentinel-500 pointer-events-none" />
                  <input
                    type="text"
                    value={editAddress}
                    onChange={handleEditAddressChange}
                    onFocus={() => addressSuggestions.length > 0 && setShowAddressSuggestions(true)}
                    onBlur={() => setShowAddressSuggestions(false)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setShowAddressSuggestions(false); }}
                    placeholder="Search for an address…"
                    autoComplete="off"
                    className={INPUT_CLS + ' pl-9 pr-9'}
                  />
                  {(addressSearchLoading || reverseLookupBusy) && (
                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-sentinel-400 animate-spin" />
                  )}
                  {showAddressSuggestions && addressSuggestions.length > 0 && (
                    <ul className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-auto rounded-lg bg-sentinel-800 border border-sentinel-600 shadow-xl">
                      {addressSuggestions.map((feature, i) => (
                        <li key={feature.id || feature.properties?.mapbox_id || i}>
                          <button
                            type="button"
                            // mousedown fires before the input's blur closes the list
                            onMouseDown={(e) => { e.preventDefault(); applyEditAddressSuggestion(feature); }}
                            className="w-full text-left px-3 py-2 text-sm text-sentinel-200 hover:bg-sentinel-700 hover:text-white flex items-start gap-2"
                          >
                            <MapPin size={13} className="shrink-0 mt-0.5 text-fire-500" />
                            <span>{featureToLocation(feature).address}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <IncidentLocationPicker
                  latitude={editLatitude}
                  longitude={editLongitude}
                  onChange={handlePinMove}
                />

                <div className="mt-2 space-y-1 text-xs">
                  {isValidCoordinate(editLatitude, editLongitude) && (
                    <div className="flex items-center gap-1 text-sentinel-400">
                      <MapPin size={11} /> {formatCoordinates(editLatitude, editLongitude)}
                    </div>
                  )}
                  {addressSearchError && (
                    <div className="text-yellow-400">{addressSearchError}</div>
                  )}
                  {addressUnplaced && !addressSearchLoading && !reverseLookupBusy && (
                    <div className="text-sentinel-400">
                      {pinMoved
                        ? 'This address will be saved as a label only. The pin stays where you placed it.'
                        : 'Pick a suggestion to move the pin. If you don’t, the address will be looked up when you save.'}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className={LABEL_CLS}>Description / Notes</label>
                <textarea
                  rows={8}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  maxLength={8000}
                  className={INPUT_CLS + ' resize-y min-h-[120px]'}
                />
                <div className="text-right text-xs text-sentinel-500 mt-1">{editDescription.length} / 8000</div>
              </div>

              {editFeedback && (
                <div className={`flex items-start gap-2 p-3 rounded-lg text-xs border ${
                  editFeedback.type === 'error'
                    ? 'bg-red-950/40 border-red-800/60 text-red-300'
                    : 'bg-green-950/40 border-green-800/60 text-green-300'
                }`}>
                  {editFeedback.type === 'error' ? <AlertCircle size={13} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={13} className="shrink-0 mt-0.5" />}
                  <span>{editFeedback.message}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setMode('view'); setEditFeedback(null); }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-sentinel-300 border border-sentinel-600 hover:text-white hover:border-sentinel-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEditSave}
                  disabled={editBusy}
                  className="btn-glass-fire flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {editBusy ? <><RefreshCw size={13} className="animate-spin" /> Saving…</> : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* UPDATE MODE — append acreage/notes */}
          {mode === 'update' && (
            <div className="space-y-4">
              <div>
                <label className={LABEL_CLS}>Update Type</label>
                <select value={updateType} onChange={(e) => setUpdateType(e.target.value)} className={INPUT_CLS}>
                  {POSTABLE_UPDATE_TYPES.map((t) => (
                    <option key={t} value={t}>{UPDATE_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-sentinel-500">
                  Fire Growth, Threat and Evacuation set the incident&apos;s current situation on the map.
                </p>
              </div>
              <div>
                <label className={LABEL_CLS}>Acreage</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={updateAcreage}
                  onChange={(e) => setUpdateAcreage(e.target.value)}
                  placeholder="e.g. 2450"
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Containment (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={updateContainment}
                  onChange={(e) => setUpdateContainment(e.target.value)}
                  placeholder="e.g. 0–100 (optional)"
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Operational Update</label>
                <textarea
                  rows={4}
                  value={updateNotes}
                  onChange={(e) => setUpdateNotes(e.target.value)}
                  maxLength={2000}
                  placeholder="Describe containment progress, structure threats, evacuations, road closures, weather changes…"
                  className={INPUT_CLS + ' resize-y min-h-[100px]'}
                />
                <div className="text-right text-xs text-sentinel-500 mt-1">{updateNotes.length} / 2000</div>
              </div>
              <div>
                <label className={LABEL_CLS}>Photos</label>
                <PhotoPickerButton {...updatePhotos} />
              </div>

              {updateFeedback && (
                <div className={`flex items-start gap-2 p-3 rounded-lg text-xs border ${
                  updateFeedback.type === 'error'
                    ? 'bg-red-950/40 border-red-800/60 text-red-300'
                    : 'bg-green-950/40 border-green-800/60 text-green-300'
                }`}>
                  {updateFeedback.type === 'error' ? <AlertCircle size={13} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={13} className="shrink-0 mt-0.5" />}
                  <span>{updateFeedback.message}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setMode('view'); setUpdateFeedback(null); }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-sentinel-300 border border-sentinel-600 hover:text-white hover:border-sentinel-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePostUpdate}
                  disabled={updateBusy}
                  className="btn-glass-fire flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {updateBusy ? <><RefreshCw size={13} className="animate-spin" /> Posting…</> : <><Send size={13} /> Post Update</>}
                </button>
              </div>
            </div>
          )}

          {/* EVACUATIONS & SHELTERS */}
          {mode === 'evac' && (
            <IncidentEvacShelterEditor incidentId={report.id} profile={profile} userId={userId} />
          )}

          {/* CONFIRM DELETE */}
          {mode === 'confirm-delete' && (
            <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                  <Trash2 size={16} className="text-red-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Delete this incident?</p>
                  <p className="text-sentinel-300 text-xs mt-0.5">
                    This will permanently remove <strong className="text-white">{report.title}</strong> and all associated data. This cannot be undone.
                  </p>
                </div>
              </div>

              {deleteError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs mb-3">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setMode('view'); setDeleteError(null); }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-sentinel-300 border border-sentinel-600 hover:text-white hover:border-sentinel-400 transition-colors"
                >
                  Keep Incident
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteBusy}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {deleteBusy ? <><RefreshCw size={13} className="animate-spin" /> Deleting…</> : 'Yes, Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ManageIncidentsTab({ reports, loading, profile, userId, onRefresh }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sentinel-300 text-sm">
          Any reporter can edit, update, or remove any incident below — changes are shared across the team.
        </p>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-sentinel-300 border border-sentinel-600 hover:text-white hover:border-sentinel-400 transition-colors"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-sentinel-300 text-sm py-12 text-center">Loading incidents…</div>
      ) : reports.length === 0 ? (
        <div className="text-sentinel-400 text-sm py-12 text-center">
          No incidents have been submitted yet.
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <IncidentCard
              key={report.id}
              report={report}
              profile={profile}
              userId={userId}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}
