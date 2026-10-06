/**
 * ExternalIncidentsTab.jsx
 * Lists active wildfires sourced from IRWIN/WFIGS and CAL FIRE (merged the
 * same way the live map does — IRWIN wins on a name match) and lets a
 * reporter post a structured update to any of them. There's no local row to
 * field-edit for an externally-sourced incident, so "edit/update" here means
 * appending a timeline entry via the same source-agnostic incident_updates
 * mechanism used for owned incidents.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, RefreshCw, MapPin, Activity, AlertCircle, CheckCircle2, Send, Globe, Siren,
} from 'lucide-react';

import { fetchIncidents } from '../../api/inciweb';
import { fetchCalFireGeoJsonList, normalizeCalFireIncidents } from '../../api/calFire';
import { mergeIrwinAndCalFireIncidents } from '../../utils/mergeIncidents';
import { insertReporterUpdate } from '../../hooks/useIncidentUpdates';
import { useImageAttachments } from '../../hooks/useImageAttachments';
import { uploadIncidentPhotos } from '../../api/incidentPhotos';
import PhotoPickerButton from '../../components/PhotoAttachments/PhotoPickerButton';
import { POSTABLE_UPDATE_TYPES, UPDATE_TYPE_LABELS } from '../../components/FireDetailPanel/incidentDetailModel';
import IncidentEvacShelterEditor from './IncidentEvacShelterEditor';
import { INPUT_CLS, LABEL_CLS, SECTION_CLS } from './shared';

/**
 * Merge IRWIN/WFIGS + CAL FIRE incidents with the same rule and inputs as the
 * live map (CAL FIRE wins a name match; inactive CAL FIRE incidents
 * included), so a reporter's updates, evacuations and shelters land on the
 * same incident id the map opens. The other source's id rides along as an
 * alias.
 */
async function loadMergedExternalIncidents() {
  const [irwinIncidents, calFireGeoJSON] = await Promise.all([
    fetchIncidents({ minAcres: 0.1 }),
    fetchCalFireGeoJsonList({ includeInactive: true }).catch(() => ({ type: 'FeatureCollection', features: [] })),
  ]);
  // Same 30-day staleness cut as the live map's incident feed (LiveTrackerPage).
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return mergeIrwinAndCalFireIncidents(irwinIncidents, normalizeCalFireIncidents(calFireGeoJSON))
    .filter((inc) => {
      const t = new Date(inc.updated).getTime();
      return !Number.isFinite(t) || t > cutoff;
    });
}

function ExternalIncidentUpdatePanel({ incident, profile, userId, onDone }) {
  const [acreage, setAcreage] = useState('');
  const [notes, setNotes]     = useState('');
  const [updateType, setUpdateType] = useState('field_report');
  const [busy, setBusy]       = useState(false);
  const [feedback, setFeedback] = useState(null);
  const photos = useImageAttachments();

  async function handlePost() {
    const hasPhotos = photos.images.length > 0;
    if (!acreage.toString().trim() && !notes.trim() && !hasPhotos) {
      setFeedback({ type: 'error', message: 'Enter acreage, notes, or attach a photo before posting.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const parts = [];
      if (acreage.toString().trim()) parts.push(`Acreage: ${acreage.toString().trim()}`);
      if (notes.trim()) parts.push(notes.trim());

      const photoUrls = hasPhotos
        ? await uploadIncidentPhotos(photos.images.map((img) => img.file), { userId, incidentId: incident.id })
        : [];

      await insertReporterUpdate({
        incidentId: incident.id,
        content: parts.join('\n'),
        sourceName: profile?.email?.split('@')[0] || 'Reporter',
        userId,
        photoUrls,
        updateType,
      });

      setUpdateType('field_report');
      setAcreage('');
      setNotes('');
      photos.reset();
      setFeedback({ type: 'success', message: 'Update posted to live timeline.' });
      setTimeout(() => { setFeedback(null); onDone?.(); }, 1800);
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to post update.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-sentinel-700 pt-4 space-y-3">
      <div>
        <label className={LABEL_CLS}>Update Type</label>
        <select value={updateType} onChange={(e) => setUpdateType(e.target.value)} className={INPUT_CLS}>
          {POSTABLE_UPDATE_TYPES.map((t) => (
            <option key={t} value={t}>{UPDATE_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={LABEL_CLS}>Acreage</label>
        <input
          type="number"
          min="0"
          step="0.1"
          value={acreage}
          onChange={(e) => setAcreage(e.target.value)}
          placeholder="e.g. 2450"
          className={INPUT_CLS}
        />
      </div>
      <div>
        <label className={LABEL_CLS}>Update Notes</label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          placeholder="Containment progress, evacuations, road closures, weather changes…"
          className={INPUT_CLS + ' resize-y min-h-[80px]'}
        />
        <div className="text-right text-xs text-sentinel-500 mt-0.5">{notes.length} / 2000</div>
      </div>
      <div>
        <label className={LABEL_CLS}>Photos</label>
        <PhotoPickerButton {...photos} />
      </div>

      {feedback && (
        <div className={`flex items-start gap-2 p-3 rounded-lg text-xs border ${
          feedback.type === 'error'
            ? 'bg-red-950/40 border-red-800/60 text-red-300'
            : 'bg-green-950/40 border-green-800/60 text-green-300'
        }`}>
          {feedback.type === 'error'
            ? <AlertCircle size={13} className="shrink-0 mt-0.5" />
            : <CheckCircle2 size={13} className="shrink-0 mt-0.5" />}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 py-2 rounded-lg text-sm font-medium text-sentinel-300 border border-sentinel-600 hover:text-white hover:border-sentinel-400 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handlePost}
          disabled={busy}
          className="btn-glass-fire flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {busy ? <><RefreshCw size={13} className="animate-spin" /> Posting…</> : <><Send size={13} /> Post Update</>}
        </button>
      </div>
    </div>
  );
}

function ExternalIncidentCard({ incident, profile, userId }) {
  const [panel, setPanel] = useState(null); // null | 'update' | 'evac'
  const toggle = (next) => setPanel((p) => (p === next ? null : next));

  const acres = incident.acres != null
    ? Number(incident.acres).toLocaleString('en-US', { maximumFractionDigits: 1 })
    : '—';
  const containment = Number(incident.contained) || 0;
  const stateLabel = incident.state ? incident.state.replace('US-', '') : '';
  const sourceLabel = incident.source === 'CAL_FIRE' ? 'CAL FIRE' : 'IRWIN / WFIGS';

  return (
    <div className={`${SECTION_CLS} transition-all`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-bold text-white text-base truncate">{incident.name}</h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-red-500/15 border-red-500/30 text-red-400 uppercase tracking-wider">
              Active
            </span>
          </div>
          <div className="flex items-center gap-3 text-sentinel-300 text-xs flex-wrap">
            {(incident.county || stateLabel) && (
              <span className="flex items-center gap-1">
                <MapPin size={11} />
                {[incident.county && `${incident.county} County`, stateLabel].filter(Boolean).join(', ')}
              </span>
            )}
            <span>{acres} ac · {containment}% contained</span>
            <span className="text-sentinel-500 text-[10px] uppercase tracking-wider">{sourceLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => toggle('evac')}
            title="Evacuations & Shelters"
            className={`p-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5
              ${panel === 'evac'
                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700'}`}
          >
            <Siren size={14} />
            <span className="hidden sm:inline">Evac</span>
          </button>
          <button
            onClick={() => toggle('update')}
            className={`p-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5
              ${panel === 'update'
                ? 'bg-fire-600/20 text-fire-400 border border-fire-600/30'
                : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700'}`}
          >
            <Activity size={14} />
            <span className="hidden sm:inline">Post Update</span>
          </button>
        </div>
      </div>

      {panel === 'update' && (
        <ExternalIncidentUpdatePanel
          incident={incident}
          profile={profile}
          userId={userId}
          onDone={() => setPanel(null)}
        />
      )}
      {panel === 'evac' && (
        <div className="mt-4 border-t border-sentinel-700 pt-4">
          <IncidentEvacShelterEditor incidentId={incident.id} aliasIds={incident.aliasIds} profile={profile} userId={userId} />
        </div>
      )}
    </div>
  );
}

export default function ExternalIncidentsTab({ profile, userId }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setIncidents(await loadMergedExternalIncidents());
    } catch (err) {
      setError(err?.message || 'Failed to load incidents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return incidents;
    return incidents.filter(
      (inc) =>
        inc.name.toLowerCase().includes(q) ||
        (inc.state || '').toLowerCase().includes(q) ||
        (inc.county || '').toLowerCase().includes(q),
    );
  }, [incidents, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-fire-600/10 border border-fire-600/30 text-fire-200 text-xs">
        <Globe size={14} className="shrink-0" />
        <span>
          Active wildfires from IRWIN/WFIGS and CAL FIRE. Post an operational update to any incident —
          it appears instantly in that incident&apos;s live timeline on the map.
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-sentinel-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, state, or county…"
            className={INPUT_CLS + ' pl-8'}
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium text-sentinel-300 border border-sentinel-600 hover:text-white hover:border-sentinel-400 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-sentinel-300 text-sm py-12 text-center">Loading active wildfires…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sentinel-400 text-sm py-12 text-center">No active wildfires found.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((incident) => (
            <ExternalIncidentCard key={incident.id} incident={incident} profile={profile} userId={userId} />
          ))}
        </div>
      )}
    </div>
  );
}
