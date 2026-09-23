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
  RefreshCw, Send, AlertCircle, CheckCircle2, User, Search, Loader2,
} from 'lucide-react';

import {
  appendFireReportUpdate,
  updateFireReport,
  deleteFireReport,
} from '../../hooks/useFireReports';
import { insertReporterUpdate } from '../../hooks/useIncidentUpdates';
import { useImageAttachments } from '../../hooks/useImageAttachments';
import { uploadIncidentPhotos } from '../../api/incidentPhotos';
import PhotoPickerButton from '../../components/PhotoAttachments/PhotoPickerButton';
import {
  INPUT_CLS, LABEL_CLS, SECTION_CLS, StatusBadge, MAPBOX_TOKEN, geocodeViaDirect,
} from './shared';

const ADDRESS_LINE = /^ADDRESS:\s*(.+)$/m;

function extractAddressFromDescription(description) {
  const match = String(description || '').match(ADDRESS_LINE);

  return match ? match[1].trim() : '';
}

function replaceAddressInDescription(description, address) {
  const text = String(description || '');
  const line = `ADDRESS: ${String(address || '').trim()}`;

  return ADDRESS_LINE.test(text)
    ? text.replace(ADDRESS_LINE, () => line)
    : [line, text].filter(Boolean).join('\n');
}

function IncidentCard({ report, profile, userId, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState('view'); // 'view' | 'edit' | 'update' | 'confirm-delete'

  const isOwn = report.user_id === userId;

  /* Edit state */
  const [editTitle, setEditTitle]       = useState(report.title);
  const [editDescription, setEditDescription] = useState(report.description || '');
  const [editBusy, setEditBusy]         = useState(false);
  const [editFeedback, setEditFeedback] = useState(null);

  /* Edit address state */
  const [editAddress, setEditAddress] = useState('');
  const [editLatitude, setEditLatitude] = useState(
    Number.isFinite(Number(report.latitude)) ? Number(report.latitude) : null
    );
  const [editLongitude, setEditLongitude] = useState(
    Number.isFinite(Number(report.longitude)) ? Number(report.longitude) : null
    );

  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);
  const [addressSearchError, setAddressSearchError] = useState(null);
  const addressDebounceRef = useRef(null);

  /* Update (append notes) state */
  const [updateAcreage, setUpdateAcreage] = useState('');
  const [updateContainment, setUpdateContainment] = useState('');
  const [updateNotes, setUpdateNotes]     = useState('');
  const [updateBusy, setUpdateBusy]       = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState(null);
  const updatePhotos = useImageAttachments();

  /* Delete state */
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function handleEditAddressChange(e) {
    const value = e.target.value;

    setEditAddress(value);
    setAddressSearchError(null);

    setEditLatitude(null);
    setEditLongitude(null);

    clearTimeout(addressDebounceRef.current);

    if (!value.trim() || value.trim().length < 3) {
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

    let features = null;

    try {
      const { supabase, isSupabaseConfigured } =
        await import('../../../shared/api/supabaseClient');

      if (isSupabaseConfigured) {
        const { data, error } = await supabase.functions.invoke(
          'mapbox-geocoding',
          {
            body: {
              query,
              country: 'us',
              autocomplete: true,
              limit: 5,
              types: 'address',
            },
          }
        );

        if (!error && Array.isArray(data?.features)) {
          features = data.features;
        }
      }
    } catch {
      // Edge function unavailable — fall through to the direct Mapbox call.
    }

    if (features === null && MAPBOX_TOKEN) {
      try {
        features = await geocodeViaDirect(query, {
          limit: 5,
          types: 'address',
          autocomplete: true,
        });
      } catch (err) {
        console.error('Edit address search error:', err);
      }
    }

    setAddressSearchLoading(false);

    if (features === null) {
      setAddressSearchError(
        'Address search unavailable. Check your connection or try again.'
      );
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }

    setAddressSuggestions(features);
    setShowAddressSuggestions(features.length > 0);
  }

  function applyEditAddressSuggestions(feature) {
    const coords = feature.geometry?.coordinates;

    const fullAddress = 
      feature.properties?.full_address ||
      feature.place_name ||
      feature.properties?.name ||
      ``;

    const longitude = Array.isArray(coords)
      ? Number(coords[0])
      : null;

    const latitude = Array.isArray(coords)
      ? Number(coords[1])
      : null;

    setEditAddress(fullAddress);
    setEditLatitude(
      Number.isFinite(latitude) ? latitude : null
    );
    setEditLongitude(
      Number.isFinite(longitude) ? longitude : null
    );

    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    setAddressSearchError(null);
  }
    
  async function handleEditSave() {
    if (!editTitle.trim()) {
      setEditFeedback({ type: 'error', message: 'Incident title is required.' });
      return;
    }

    if (
      !Number.isFinite(editLatitude) ||
      !Number.isFinite(editLongitude)
    ) {
      setEditFeedback({
        type: 'error',
        message: 'Please search for and select a valid address.',
      });
      return;
    }

    if (!editAddress.trim()) {
      setEditFeedback({
        type: 'error',
        message: 'Incident address is required.',
      });
      return;
    }
        
    setEditBusy(true);
    setEditFeedback(null);
    
    try {
      const updatedDescription = replaceAddressInDescription(
        editDescription,
        editAddress
      );
      
      await updateFireReport(report.id, {
        title: editTitle.trim(),
        description: editDescription,
        latitude: editLatitude,
        longitude: editLongitude,
      });
      
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
      });

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
            onClick={() => { 
              setMode(mode === 'edit' ? 'view' : 'edit'); 
              setExpanded(true); 
              
              setEditTitle(report.title); 
              setEditDescription(report.description || ''); 
              
              setEditAddress(extractAddressFromDescription(report.description || '')); 
              
              setEditLatitude(Number.isFinite(Number(report.latitude)) ? Number(report.latitude) : null);
                            
              setEditLongitude(Number.isFinite(Number(report.longitude)) ? Number(report.longitude) : null);

              setAddressSuggestions([]);
              setShowAddressSuggestions(false);
              setAddressSearchError(null);
                               
              setEditFeedback(null); 
              setUpdateFeedback(null); }}
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
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-fire-600 hover:bg-fire-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-fire-600 hover:bg-fire-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {updateBusy ? <><RefreshCw size={13} className="animate-spin" /> Posting…</> : <><Send size={13} /> Post Update</>}
                </button>
              </div>
            </div>
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
