/**
 * ReporterDashboardPage.jsx
 * Full-featured reporter dashboard — add, update, and delete wildfire incidents.
 * Route: /reporter-dashboard  (not linked in public nav — accessed by direct URL)
 *
 * Tabs:
 *  1. Add Incident   — multi-section incident submission form
 *  2. My Incidents   — manage (edit / update / delete) own submissions
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import {
  Flame, Search, MapPin, ChevronDown, FileText, ImageIcon,
  Upload, X, LogOut, AlertCircle, CheckCircle2, Send, User,
  PlusCircle, Pencil, Trash2, RefreshCw, ChevronUp, Clock,
  Activity, Settings, ArrowLeft, Shield, Loader2, Globe,
  AlertTriangle as TriangleAlert, Eye, EyeOff,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../api/supabaseClient';
import { acquireSlot } from '../utils/mapboxRateLimiter';
import {
  appendFireReportUpdate,
  updateFireReport,
  deleteFireReport,
  submitFireReport,
  useFireReports,
} from '../hooks/useFireReports';
import { insertReporterUpdate } from '../hooks/useIncidentUpdates';
import { fetchIncidents } from '../api/inciweb';
import {
  useReporterEvacZones,
  createReporterEvacZone,
  updateReporterEvacZone,
  liftReporterEvacZone,
  deleteReporterEvacZone,
} from '../hooks/useReporterEvacZones';
import EvacZoneDrawer from '../components/Map/EvacZoneDrawer';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

/**
 * Direct Mapbox v5 geocoding — used as a fallback when the Supabase edge
 * function is unavailable or returns an error.  Requires VITE_MAPBOX_TOKEN.
 */
async function geocodeViaDirect(query, { limit = 5, types = '', autocomplete = true } = {}) {
  if (!MAPBOX_TOKEN) throw new Error('Mapbox token not configured');
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    country: 'us',
    limit: String(limit),
    autocomplete: String(autocomplete),
  });
  if (types) params.set('types', types);
  const encoded = encodeURIComponent(query.trim());
  const resp = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?${params}`
  );
  if (!resp.ok) throw new Error(`Geocoding failed (${resp.status})`);
  const json = await resp.json();
  // Normalise v5 features to look like v6 so the rest of the code is unchanged.
  return (json?.features || []).map((f) => ({
    id: f.id,
    place_name: f.place_name,
    geometry: f.geometry,
    properties: {
      mapbox_id: f.id,
      full_address: f.place_name,
      address_line1: f.address
        ? `${f.address} ${f.text || ''}`.trim()
        : (f.text || ''),
      name: f.text || '',
      context: buildV5Context(f.context || []),
    },
  }));
}

function buildV5Context(contextArr) {
  const ctx = {};
  for (const item of contextArr) {
    if (item.id?.startsWith('place'))     ctx.place      = { name: item.text };
    if (item.id?.startsWith('locality'))  ctx.locality   = { name: item.text };
    if (item.id?.startsWith('district'))  ctx.district   = { name: item.text };
    if (item.id?.startsWith('region'))    ctx.region     = { name: item.text };
    if (item.id?.startsWith('postcode'))  ctx.postcode   = { name: item.text };
  }
  return ctx;
}

/* ── Static data ── */

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
];

const US_COUNTIES = [
  'Adams','Allen','Apache','Atlantic','Bexar','Boulder','Broward','Butte',
  'Canyon','Charlotte','Chelan','Cherokee','Clark','Clay','Cochise','Coconino',
  'Collin','Columbia','Cook','Dallas','Davidson','Davis','Deschutes','Douglas',
  'Duval','El Dorado','El Paso','Elko','Escambia','Fairfax','Flagler',
  'Flathead','Fresno','Garfield','Grant','Guilford','Hamilton','Harris',
  'Hillsborough','Hood River','Humboldt','Idaho','Jackson','Jefferson',
  'Josephine','Kootenai','Lake','Lane','Larimer','Lee','Lincoln','Linn',
  'Los Angeles','Maricopa','Marion','Mecklenburg','Miami-Dade','Mohave',
  'Monroe','Montgomery','Multnomah','Navajo','New Hanover','Okanogan','Orange',
  'Palm Beach','Pima','Pinal','Pinellas','Placer','Polk','Riverside',
  'Sacramento','Salt Lake','San Bernardino','San Diego','San Francisco',
  'San Joaquin','Santa Barbara','Santa Clara','Sarasota','Shasta','Siskiyou',
  'Snohomish','Spokane','Summit','Tarrant','Travis','Trinity','Tulare','Tulsa',
  'Utah','Ventura','Wake','Wasco','Washington','Washoe','Whatcom',
  'Yakima','Yavapai','Yolo','Yuma',
].sort();

const INCIDENT_STATUS_OPTIONS = ['active', 'contained', 'controlled', 'out'];

/* ── Shared style tokens ── */
const INPUT_CLS =
  'w-full px-3 py-2.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-white ' +
  'placeholder-[#484f58] focus:outline-none focus:border-[#0096ff] ' +
  'focus:ring-1 focus:ring-[#0096ff]/20 transition-colors text-sm';

const LABEL_CLS =
  'block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5';

const SECTION_CLS =
  'bg-[#0d1117] border border-[#21262d] rounded-xl p-6';

/* ── Searchable county dropdown ── */
function CountySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');

  useEffect(() => { setQuery(value || ''); }, [value]);

  const filtered = query.trim().length >= 1
    ? US_COUNTIES.filter((c) => c.toLowerCase().includes(query.toLowerCase()))
    : US_COUNTIES;

  function select(county) {
    onChange(county);
    setQuery(county);
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484f58] pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search county…"
          className={INPUT_CLS + ' pl-8 pr-7'}
        />
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#484f58] pointer-events-none" />
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto rounded-lg bg-[#161b22] border border-[#30363d] shadow-2xl">
          {filtered.slice(0, 40).map((county) => (
            <li key={county}>
              <button
                type="button"
                onMouseDown={() => select(county)}
                className="w-full text-left px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] transition-colors"
              >
                {county}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionHeader({ icon: Icon, iconColor = 'text-[#0096ff]', children }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <Icon size={15} className={iconColor} />
      <h2 className="text-white font-semibold text-sm uppercase tracking-wider">{children}</h2>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    active:     'bg-red-500/15 border-red-500/30 text-red-400',
    contained:  'bg-yellow-500/15 border-yellow-500/30 text-yellow-400',
    controlled: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
    out:        'bg-green-500/15 border-green-500/30 text-green-400',
    approved:   'bg-green-500/15 border-green-500/30 text-green-400',
    pending:    'bg-yellow-500/15 border-yellow-500/30 text-yellow-400',
    rejected:   'bg-red-500/15 border-red-500/30 text-red-400',
  };
  const cls = map[status] || 'bg-[#21262d] border-[#30363d] text-[#8b949e]';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls} uppercase tracking-wider`}>
      {status}
    </span>
  );
}

/* ── Incident card for My Incidents tab ── */
function IncidentCard({
  report,
  profile,
  userId,
  onRefresh,
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState('view'); // 'view' | 'edit' | 'update' | 'confirm-delete'

  /* Edit state */
  const [editTitle, setEditTitle]       = useState(report.title);
  const [editDescription, setEditDescription] = useState(report.description || '');
  const [editStatus, setEditStatus]     = useState(
    INCIDENT_STATUS_OPTIONS.includes(report.incident_status) ? report.incident_status : 'active'
  );
  const [editBusy, setEditBusy]         = useState(false);
  const [editFeedback, setEditFeedback] = useState(null);

  /* Update (append notes) state */
  const [updateAcreage, setUpdateAcreage] = useState('');
  const [updateNotes, setUpdateNotes]     = useState('');
  const [updateBusy, setUpdateBusy]       = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState(null);

  /* Delete state */
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  async function handleEditSave() {
    if (!editTitle.trim()) {
      setEditFeedback({ type: 'error', message: 'Incident title is required.' });
      return;
    }
    setEditBusy(true);
    setEditFeedback(null);
    try {
      await updateFireReport(report.id, {
        title: editTitle.trim(),
        description: editDescription,
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
    if (!updateAcreage.toString().trim() && !updateNotes.trim()) {
      setUpdateFeedback({ type: 'error', message: 'Enter acreage or notes before posting.' });
      return;
    }
    setUpdateBusy(true);
    setUpdateFeedback(null);
    try {
      await appendFireReportUpdate({
        id: report.id,
        description: report.description || '',
        acreage: updateAcreage,
        notes: updateNotes,
      });

      const parts = [];
      if (updateAcreage.toString().trim()) parts.push(`Acreage: ${updateAcreage.toString().trim()}`);
      if (updateNotes.trim()) parts.push(updateNotes.trim());

      await insertReporterUpdate({
        incidentId: report.id,
        content: parts.join('\n'),
        sourceName: profile?.email?.split('@')[0] || 'Reporter',
        userId,
      });

      setUpdateAcreage('');
      setUpdateNotes('');
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
          <div className="flex items-center gap-3 text-[#8b949e] text-xs">
            <span className="flex items-center gap-1"><Clock size={11} /> {formattedDate}</span>
            {report.latitude && report.longitude && (
              <span className="flex items-center gap-1">
                <MapPin size={11} />
                {Number(report.latitude).toFixed(4)}, {Number(report.longitude).toFixed(4)}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => { setMode(mode === 'update' ? 'view' : 'update'); setExpanded(true); setEditFeedback(null); setUpdateFeedback(null); }}
            title="Post Update"
            className={`p-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5
              ${mode === 'update' ? 'bg-[#0096ff]/20 text-[#0096ff] border border-[#0096ff]/30' : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'}`}
          >
            <Activity size={14} />
            <span className="hidden sm:inline">Update</span>
          </button>
          <button
            onClick={() => { setMode(mode === 'edit' ? 'view' : 'edit'); setExpanded(true); setEditTitle(report.title); setEditDescription(report.description || ''); setEditFeedback(null); setUpdateFeedback(null); }}
            title="Edit Incident"
            className={`p-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5
              ${mode === 'edit' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'}`}
          >
            <Pencil size={14} />
            <span className="hidden sm:inline">Edit</span>
          </button>
          <button
            onClick={() => { setMode('confirm-delete'); setExpanded(true); }}
            title="Delete Incident"
            className="p-2 rounded-lg text-[#8b949e] hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-2 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expandable body */}
      {expanded && (
        <div className="mt-5 border-t border-[#21262d] pt-5 space-y-5">

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
              <p className="text-sm text-[#8b949e] whitespace-pre-wrap leading-relaxed">
                {report.description || <span className="italic text-[#484f58]">No description provided.</span>}
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
                <div className="text-right text-xs text-[#484f58] mt-1">{editDescription.length} / 8000</div>
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
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-[#8b949e] border border-[#30363d] hover:text-white hover:border-[#484f58] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEditSave}
                  disabled={editBusy}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-[#0096ff] hover:bg-[#0080db] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
                <label className={LABEL_CLS}>Operational Update</label>
                <textarea
                  rows={4}
                  value={updateNotes}
                  onChange={(e) => setUpdateNotes(e.target.value)}
                  maxLength={2000}
                  placeholder="Describe containment progress, structure threats, evacuations, road closures, weather changes…"
                  className={INPUT_CLS + ' resize-y min-h-[100px]'}
                />
                <div className="text-right text-xs text-[#484f58] mt-1">{updateNotes.length} / 2000</div>
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
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-[#8b949e] border border-[#30363d] hover:text-white hover:border-[#484f58] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePostUpdate}
                  disabled={updateBusy}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-[#0096ff] hover:bg-[#0080db] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
                  <p className="text-[#8b949e] text-xs mt-0.5">
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
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-[#8b949e] border border-[#30363d] hover:text-white hover:border-[#484f58] transition-colors"
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

/* ── External incident update panel ── */

/**
 * Lets a reporter post an update (acreage / notes) to an external incident
 * sourced from IRWIN / WFIGS. The update lands in `incident_updates` keyed
 * by the IRWIN UniqueFireIdentifier so the IncidentTimeline on the live map
 * picks it up immediately.
 */
function ExternalIncidentUpdatePanel({ incident, profile, userId, onDone }) {
  const [acreage, setAcreage] = useState('');
  const [notes, setNotes]     = useState('');
  const [busy, setBusy]       = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function handlePost() {
    if (!acreage.toString().trim() && !notes.trim()) {
      setFeedback({ type: 'error', message: 'Enter acreage or notes before posting.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const parts = [];
      if (acreage.toString().trim()) parts.push(`Acreage: ${acreage.toString().trim()}`);
      if (notes.trim()) parts.push(notes.trim());

      await insertReporterUpdate({
        incidentId: incident.id,
        content: parts.join('\n'),
        sourceName: profile?.email?.split('@')[0] || 'Reporter',
        userId,
      });

      setAcreage('');
      setNotes('');
      setFeedback({ type: 'success', message: 'Update posted to live timeline.' });
      setTimeout(() => { setFeedback(null); onDone?.(); }, 1800);
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to post update.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-[#21262d] pt-4 space-y-3">
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
        <div className="text-right text-xs text-[#484f58] mt-0.5">{notes.length} / 2000</div>
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
          className="flex-1 py-2 rounded-lg text-sm font-medium text-[#8b949e] border border-[#30363d] hover:text-white hover:border-[#484f58] transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handlePost}
          disabled={busy}
          className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-[#0096ff] hover:bg-[#0080db] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {busy ? <><RefreshCw size={13} className="animate-spin" /> Posting…</> : <><Send size={13} /> Post Update</>}
        </button>
      </div>
    </div>
  );
}

function ExternalIncidentCard({ incident, profile, userId }) {
  const [expanded, setExpanded] = useState(false);

  const acres = incident.acres != null
    ? Number(incident.acres).toLocaleString('en-US', { maximumFractionDigits: 1 })
    : '—';
  const containment = Number(incident.contained) || 0;
  const stateLabel = incident.state ? incident.state.replace('US-', '') : '';

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
          <div className="flex items-center gap-3 text-[#8b949e] text-xs flex-wrap">
            {(incident.county || stateLabel) && (
              <span className="flex items-center gap-1">
                <MapPin size={11} />
                {[incident.county && `${incident.county} County`, stateLabel].filter(Boolean).join(', ')}
              </span>
            )}
            <span>{acres} ac · {containment}% contained</span>
            <span className="text-[#484f58] text-[10px] uppercase tracking-wider">IRWIN / WFIGS</span>
          </div>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className={`p-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0
            ${expanded
              ? 'bg-[#0096ff]/20 text-[#0096ff] border border-[#0096ff]/30'
              : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'}`}
        >
          <Activity size={14} />
          <span className="hidden sm:inline">Post Update</span>
        </button>
      </div>

      {expanded && (
        <ExternalIncidentUpdatePanel
          incident={incident}
          profile={profile}
          userId={userId}
          onDone={() => setExpanded(false)}
        />
      )}
    </div>
  );
}

/* ── Evac zone card ── */
const ZONE_TYPE_COLORS = {
  'Evacuation Order':   { bg: 'bg-red-500/15',    border: 'border-red-500/30',    text: 'text-red-400' },
  'Evacuation Warning': { bg: 'bg-orange-500/15', border: 'border-orange-500/30', text: 'text-orange-400' },
  'Evacuation Watch':   { bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', text: 'text-yellow-400' },
};

function EvacZoneCard({ zone, onRefresh }) {
  const [busy, setBusy]         = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const colors = ZONE_TYPE_COLORS[zone.zone_type] || ZONE_TYPE_COLORS['Evacuation Order'];

  async function handleLift() {
    setBusy(true);
    setFeedback(null);
    try {
      await liftReporterEvacZone(zone.id);
      setFeedback({ type: 'success', message: 'Zone lifted. It will no longer appear on the map.' });
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to lift zone.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setFeedback(null);
    try {
      await deleteReporterEvacZone(zone.id);
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to delete zone.' });
      setBusy(false);
    }
  }

  const polygonCount = (() => {
    const g = zone.geometry;
    if (!g) return 0;
    if (g.type === 'Polygon') return 1;
    if (g.type === 'MultiPolygon') return g.coordinates?.length ?? 1;
    return 1;
  })();

  return (
    <div className={`bg-[#0d1117] border ${colors.border} rounded-xl p-4`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-bold text-white text-sm truncate">{zone.title}</h3>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${colors.bg} ${colors.border} ${colors.text} uppercase tracking-wider`}>
              {zone.zone_type}
            </span>
            {zone.status !== 'active' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-[#21262d] border-[#30363d] text-[#8b949e] uppercase tracking-wider">
                {zone.status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[#8b949e] text-xs flex-wrap">
            {zone.incident_name && (
              <span className="flex items-center gap-1">
                <Flame size={10} className="text-orange-400" />
                {zone.incident_name}
              </span>
            )}
            {(zone.county || zone.state) && (
              <span className="flex items-center gap-1">
                <MapPin size={10} />
                {[zone.county && `${zone.county} County`, zone.state].filter(Boolean).join(', ')}
              </span>
            )}
            <span>{polygonCount} polygon{polygonCount !== 1 ? 's' : ''}</span>
            <span className="text-[#484f58]">{new Date(zone.created_at).toLocaleDateString()}</span>
          </div>
          {zone.description && (
            <p className="text-[#8b949e] text-xs mt-1.5 line-clamp-2">{zone.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {zone.status === 'active' && (
            <button
              type="button"
              onClick={handleLift}
              disabled={busy}
              title="Lift zone (deactivate)"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#8b949e] border border-[#30363d] hover:text-orange-400 hover:border-orange-800 transition-colors disabled:opacity-50"
            >
              <EyeOff size={12} />
              <span className="hidden sm:inline">Lift</span>
            </button>
          )}
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              title="Delete zone"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#8b949e] border border-[#30363d] hover:text-red-400 hover:border-red-800 transition-colors disabled:opacity-50"
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
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#8b949e] border border-[#30363d] hover:text-white transition-colors"
              >
                No
              </button>
            </div>
          )}
        </div>
      </div>

      {feedback && (
        <div className={`flex items-start gap-2 mt-2 p-2.5 rounded-lg text-xs border ${
          feedback.type === 'error'
            ? 'bg-red-950/40 border-red-800/60 text-red-300'
            : 'bg-green-950/40 border-green-800/60 text-green-300'
        }`}>
          {feedback.type === 'error'
            ? <AlertCircle size={12} className="shrink-0 mt-0.5" />
            : <CheckCircle2 size={12} className="shrink-0 mt-0.5" />}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main page
══════════════════════════════════════════════════════════ */

export default function ReporterDashboardPage() {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('add');

  /* ── Evac Zones tab state ── */
  const { zones: myEvacZones, loading: evacZonesLoading, refresh: refreshEvacZones } = useReporterEvacZones('all');
  const myOwnEvacZones = useMemo(
    () => (myEvacZones || []).filter((z) => z.user_id === user?.id),
    [myEvacZones, user?.id],
  );
  const [showDrawer, setShowDrawer]         = useState(false);
  const [evacSaving, setEvacSaving]         = useState(false);
  const [evacSaveError, setEvacSaveError]   = useState(null);
  const [evacSuccess, setEvacSuccess]       = useState(null);

  /* ── Add Incident form state ── */
  const [addressSearch, setAddressSearch] = useState('');
  const [isIntersection, setIsIntersection] = useState(false);
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [county, setCounty] = useState('');
  const [usState, setUsState] = useState('');
  const [zip, setZip] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [reportLat, setReportLat] = useState(null);
  const [reportLng, setReportLng] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const searchDebounceRef = useRef(null);

  const [incidentName, setIncidentName] = useState('');
  const [incidentNotes, setIncidentNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [images, setImages] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  /* ── My Incidents tab state ── */
  const { reports: allReports, loading: reportsLoading, refresh: refreshReports } = useFireReports('all');

  const myIncidents = useMemo(
    () => allReports.filter((r) => r.user_id === user?.id && r.status !== 'rejected'),
    [allReports, user?.id],
  );

  /* ── External Incidents tab state ── */
  const [externalIncidents, setExternalIncidents] = useState([]);
  const [externalLoading, setExternalLoading]     = useState(false);
  const [externalError, setExternalError]         = useState(null);
  const [externalSearch, setExternalSearch]       = useState('');

  const filteredExternal = useMemo(() => {
    const q = externalSearch.trim().toLowerCase();
    if (!q) return externalIncidents;
    return externalIncidents.filter(
      (inc) =>
        inc.name.toLowerCase().includes(q) ||
        (inc.state || '').toLowerCase().includes(q) ||
        (inc.county || '').toLowerCase().includes(q),
    );
  }, [externalIncidents, externalSearch]);

  async function loadExternalIncidents() {
    setExternalLoading(true);
    setExternalError(null);
    try {
      const data = await fetchIncidents({ minAcres: 0.1 });
      setExternalIncidents(data.sort((a, b) => (b.acres || 0) - (a.acres || 0)));
    } catch (err) {
      setExternalError(err?.message || 'Failed to load incidents.');
    } finally {
      setExternalLoading(false);
    }
  }

  /* ── Auth guards ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#010409] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#0096ff] border-t-transparent animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/reporter-login" state={{ from: '/reporter-dashboard' }} replace />;
  }

  if (profile?.role && profile.role !== 'reporter' && profile.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  /* ── Image helpers ── */
  function handleFiles(files) {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setImages((prev) => [
      ...prev,
      ...imageFiles.map((file) => ({ file, preview: URL.createObjectURL(file), name: file.name })),
    ]);
  }

  function removeImage(idx) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  /* ── Address autofill ── */
  function handleAddressSearchChange(e) {
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

    // Primary: Supabase edge function (keeps Mapbox token server-side)
    if (isSupabaseConfigured) {
      try {
        await acquireSlot();
        const { data, error: err } = await supabase.functions.invoke('mapbox-geocoding', {
          body: { query: q, country: 'us', autocomplete: true, limit: 5, types: 'address' },
        });
        if (!err && Array.isArray(data?.features)) {
          features = data.features;
        }
      } catch {
        // fall through to direct fallback below
      }
    }

    // Fallback: direct Mapbox v5 REST call using VITE_MAPBOX_TOKEN
    if (features === null && MAPBOX_TOKEN) {
      try {
        features = await geocodeViaDirect(q, { limit: 5, types: 'address', autocomplete: true });
      } catch (err) {
        console.error('Address suggestion fallback error:', err);
      }
    }

    setSearchLoading(false);

    if (features === null) {
      // Both paths failed — show a user-visible hint
      setSearchError('Address search unavailable. Check your connection or enter the address manually.');
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSuggestions(features);
    setShowSuggestions(features.length > 0);
  }

  function applySuggestion(feature) {
    const props = feature.properties || {};
    const ctx = props.context || {};
    const coords = feature.geometry?.coordinates;
    setAddress1(props.address_line1 || props.name || '');
    setCity(ctx.place?.name || ctx.locality?.name || '');
    setCounty((ctx.district?.name || '').replace(/\s+county$/i, '').trim());
    setUsState(ctx.region?.name || '');
    setZip(ctx.postcode?.name || '');
    setAddressSearch(props.full_address || feature.place_name || props.name || '');
    setReportLng(Array.isArray(coords) ? Number(coords[0]) : null);
    setReportLat(Array.isArray(coords) ? Number(coords[1]) : null);
    setSuggestions([]);
    setShowSuggestions(false);
    setSearchError(null);
  }

  async function geocodeAddressForReport() {
    const query = [address1, city, usState, zip].filter(Boolean).join(', ');
    if (!query) return { latitude: null, longitude: null };

    // Primary: edge function
    if (isSupabaseConfigured) {
      try {
        await acquireSlot();
        const { data, error: err } = await supabase.functions.invoke('mapbox-geocoding', {
          body: { query, country: 'us', autocomplete: false, limit: 1 },
        });
        if (!err) {
          const first = data?.features?.[0];
          if (Array.isArray(first?.geometry?.coordinates)) {
            return {
              latitude: Number(first.geometry.coordinates[1]),
              longitude: Number(first.geometry.coordinates[0]),
            };
          }
        }
      } catch {
        // fall through
      }
    }

    // Fallback: direct v5
    if (MAPBOX_TOKEN) {
      try {
        const features = await geocodeViaDirect(query, { limit: 1, autocomplete: false });
        const first = features?.[0];
        if (Array.isArray(first?.geometry?.coordinates)) {
          return {
            latitude: Number(first.geometry.coordinates[1]),
            longitude: Number(first.geometry.coordinates[0]),
          };
        }
      } catch {
        // both paths failed
      }
    }

    return { latitude: null, longitude: null };
  }

  /* ── Submit new incident ── */
  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!incidentName.trim()) { setError('Incident name is required.'); return; }
    if (!incidentNotes.trim()) { setError('Incident notes are required.'); return; }
    if (!address1.trim() || !city.trim() || !usState || !zip.trim() || !jurisdiction.trim()) {
      setError('Please complete all required (*) address fields.');
      return;
    }

    setBusy(true);
    try {
      let latitude = Number.isFinite(reportLat) ? reportLat : null;
      let longitude = Number.isFinite(reportLng) ? reportLng : null;

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        const geocoded = await geocodeAddressForReport();
        latitude = geocoded.latitude;
        longitude = geocoded.longitude;
      }
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setError('Unable to locate this address on the map. Please select a suggested address result.');
        return;
      }

      const locationLine =
        [address1, address2].filter(Boolean).join(', ') +
        `, ${city}` +
        (county ? `, ${county} County` : '') +
        `, ${usState} ${zip}`;

      const description = [
        `ADDRESS: ${locationLine}`,
        `JURISDICTION: ${jurisdiction}`,
        isIntersection ? 'INTERSECTION SEARCH: Yes' : null,
        `\nINCIDENT NOTES:\n${incidentNotes}`,
        internalNotes.trim() ? `\nINTERNAL NOTES:\n${internalNotes}` : null,
      ].filter(Boolean).join('\n');

      await submitFireReport({
        title: incidentName.trim(),
        description,
        latitude,
        longitude,
        userId: user.id,
      });

      setSuccess('Incident submitted and is now live on the map.');

      /* Reset form */
      setAddressSearch(''); setIsIntersection(false);
      setAddress1(''); setAddress2(''); setCity(''); setCounty('');
      setUsState(''); setZip(''); setJurisdiction('');
      setReportLat(null); setReportLng(null);
      setSuggestions([]); setShowSuggestions(false);
      setIncidentName(''); setIncidentNotes(''); setInternalNotes('');
      images.forEach((img) => URL.revokeObjectURL(img.preview));
      setImages([]);
      refreshReports();
    } catch (err) {
      setError(err?.message || 'Failed to submit incident.');
    } finally {
      setBusy(false);
    }
  }

  /* ── Render ── */
  return (
    <div className="min-h-screen bg-[#010409] flex flex-col">

      {/* ── Top bar ── */}
      <header className="bg-[#0d1117] border-b border-[#21262d] px-5 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0096ff]/10 border border-[#0096ff]/25 flex items-center justify-center">
            <Flame size={15} className="text-[#0096ff]" />
          </div>
          <span className="text-white font-bold text-sm tracking-tight">Sentinel</span>
          <span className="text-[#30363d] text-sm">|</span>
          <span className="text-[#8b949e] text-sm">Reporter Dashboard</span>
          <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#0096ff]/10 border border-[#0096ff]/20">
            <Shield size={10} className="text-[#0096ff]" />
            <span className="text-[#0096ff] text-[10px] font-semibold uppercase tracking-wider">Restricted</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#8b949e]">
            <User size={12} />
            <span className="max-w-[180px] truncate">{profile?.email || user.email}</span>
          </div>
          <Link
            to="/account"
            className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-white transition-colors"
            title="Account Settings"
          >
            <Settings size={13} />
            <span className="hidden sm:inline">Account</span>
          </Link>
          <button
            onClick={async () => { await signOut(); navigate('/'); }}
            className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-white transition-colors"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* ── Content area ── */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8">

        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">
            {activeTab === 'add' ? 'Add New Incident'
              : activeTab === 'manage' ? 'My Incidents'
              : activeTab === 'evaczones' ? 'Evacuation Zones'
              : 'External Incidents'}
          </h1>
          <p className="text-[#8b949e] text-sm mt-1">
            {activeTab === 'add'
              ? 'Submit a new wildfire incident. Complete all required (*) fields and click Submit.'
              : activeTab === 'manage'
              ? 'View, edit, post updates, or delete your submitted incidents.'
              : activeTab === 'evaczones'
              ? 'Draw and publish evacuation zone polygons directly on the live map.'
              : 'Post reporter updates to active IRWIN / WFIGS incidents from other sources.'}
          </p>
        </div>

        {/* ── Tab bar ── */}
        <div
          role="tablist"
          aria-label="Reporter dashboard sections"
          className="flex gap-1 p-1 mb-8 rounded-xl bg-[#0d1117] border border-[#21262d] w-fit"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'add'}
            onClick={() => setActiveTab('add')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors
              ${activeTab === 'add'
                ? 'bg-[#0096ff] text-white shadow'
                : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'}`}
          >
            <PlusCircle size={13} />
            Add Incident
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'manage'}
            onClick={() => { setActiveTab('manage'); refreshReports(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors
              ${activeTab === 'manage'
                ? 'bg-[#0096ff] text-white shadow'
                : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'}`}
          >
            <Activity size={13} />
            My Incidents
            {myIncidents.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                {myIncidents.length}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'external'}
            onClick={() => {
              setActiveTab('external');
              if (externalIncidents.length === 0) loadExternalIncidents();
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors
              ${activeTab === 'external'
                ? 'bg-[#0096ff] text-white shadow'
                : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'}`}
          >
            <Globe size={13} />
            <span className="hidden sm:inline">External Incidents</span>
            <span className="sm:hidden">External</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'evaczones'}
            onClick={() => { setActiveTab('evaczones'); refreshEvacZones(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors
              ${activeTab === 'evaczones'
                ? 'bg-red-600 text-white shadow'
                : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'}`}
          >
            <TriangleAlert size={13} />
            <span className="hidden sm:inline">Evac Zones</span>
            <span className="sm:hidden">Evac</span>
            {myOwnEvacZones.filter((z) => z.status === 'active').length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                {myOwnEvacZones.filter((z) => z.status === 'active').length}
              </span>
            )}
          </button>
        </div>

        {/* ════════════════ TAB 1: ADD INCIDENT ════════════════ */}
        {activeTab === 'add' && (
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Address */}
            <div className={SECTION_CLS}>
              <SectionHeader icon={MapPin}>Location</SectionHeader>

              {/* Address search */}
              <div className="relative mb-4">
                <div className="relative">
                  {searchLoading
                    ? <Loader2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0096ff] pointer-events-none animate-spin" />
                    : <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#484f58] pointer-events-none" />
                  }
                  <input
                    type="text"
                    value={addressSearch}
                    onChange={handleAddressSearchChange}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    placeholder="Search address to auto-fill fields below…"
                    autoComplete="off"
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-[#161b22] border border-[#30363d]
                               text-white placeholder-[#484f58] focus:outline-none focus:border-[#0096ff]
                               focus:ring-1 focus:ring-[#0096ff]/20 transition-colors text-sm"
                  />
                </div>
                {searchError && (
                  <p className="mt-1.5 text-xs text-amber-400 flex items-center gap-1">
                    <AlertCircle size={12} className="shrink-0" />
                    {searchError}
                  </p>
                )}
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="absolute z-30 mt-1 w-full rounded-lg bg-[#161b22] border border-[#30363d] shadow-2xl overflow-hidden">
                    {suggestions.map((feature, idx) => (
                      <li key={feature.properties?.mapbox_id || feature.id || idx}>
                        <button
                          type="button"
                          onMouseDown={() => applySuggestion(feature)}
                          className="w-full text-left px-4 py-2.5 text-sm text-[#c9d1d9] hover:bg-[#21262d] transition-colors flex items-start gap-2.5"
                        >
                          <MapPin size={13} className="text-[#0096ff] shrink-0 mt-0.5" />
                          <span className="truncate">{feature.properties?.full_address || feature.place_name || feature.text}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none mb-5">
                <input
                  type="checkbox"
                  checked={isIntersection}
                  onChange={(e) => setIsIntersection(e.target.checked)}
                  className="w-4 h-4 rounded border-[#30363d] bg-[#0d1117] accent-[#0096ff] cursor-pointer"
                />
                <span className="text-sm text-[#c9d1d9]">Intersection Search</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLS}>Address Line 1 <span className="text-red-400">*</span></label>
                  <input type="text" required value={address1} onChange={(e) => setAddress1(e.target.value)} placeholder="123 Main Street" className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>Address Line 2</label>
                  <input type="text" value={address2} onChange={(e) => setAddress2(e.target.value)} placeholder="Apt, Suite, Unit (optional)" className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>City <span className="text-red-400">*</span></label>
                  <input type="text" required value={city} onChange={(e) => setCity(e.target.value)} placeholder="City name" className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>County</label>
                  <CountySelect value={county} onChange={setCounty} />
                </div>
                <div>
                  <label className={LABEL_CLS}>State <span className="text-red-400">*</span></label>
                  <select required value={usState} onChange={(e) => setUsState(e.target.value)} className={INPUT_CLS + ' cursor-pointer'}>
                    <option value="">Select state…</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>ZIP Code <span className="text-red-400">*</span></label>
                  <input type="text" required value={zip} onChange={(e) => setZip(e.target.value)} placeholder="e.g. 95602" maxLength={10} className={INPUT_CLS} />
                </div>
                <div className="sm:col-span-2">
                  <label className={LABEL_CLS}>Jurisdiction <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    required
                    value={jurisdiction}
                    onChange={(e) => setJurisdiction(e.target.value)}
                    placeholder="e.g. Placer County Fire, USFS Region 5, CAL FIRE"
                    className={INPUT_CLS}
                  />
                </div>
              </div>
            </div>

            {/* Incident Details */}
            <div className={SECTION_CLS}>
              <SectionHeader icon={Flame} iconColor="text-orange-400">Incident Details</SectionHeader>
              <div>
                <label className={LABEL_CLS}>Incident Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  value={incidentName}
                  onChange={(e) => setIncidentName(e.target.value)}
                  placeholder="e.g. Caldor Fire, River Fire, Tahoe Fire"
                  maxLength={120}
                  className={INPUT_CLS}
                />
              </div>
            </div>

            {/* Notes */}
            <div className={SECTION_CLS}>
              <SectionHeader icon={FileText}>Notes</SectionHeader>
              <div>
                <label className={LABEL_CLS}>Incident Notes <span className="text-red-400">*</span></label>
                <textarea
                  required
                  rows={7}
                  value={incidentNotes}
                  onChange={(e) => setIncidentNotes(e.target.value)}
                  placeholder="Describe the incident: what you observed, when, landmarks, road names, wind direction, estimated fire size, activity level, structures threatened…"
                  maxLength={5000}
                  className={INPUT_CLS + ' resize-y min-h-[140px]'}
                />
                <div className="text-right text-xs text-[#484f58] mt-1">{incidentNotes.length} / 5000</div>
              </div>
              <div className="mt-4">
                <label className={LABEL_CLS}>Internal Notes</label>
                <textarea
                  rows={4}
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Internal use only — not visible on the public map"
                  maxLength={2000}
                  className={INPUT_CLS + ' resize-y min-h-[100px]'}
                />
                <div className="text-right text-xs text-[#484f58] mt-1">{internalNotes.length} / 2000</div>
              </div>
            </div>

            {/* Image Attachments */}
            <div className={SECTION_CLS}>
              <SectionHeader icon={ImageIcon}>Image Attachments</SectionHeader>
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                  ${dragging
                    ? 'border-[#0096ff] bg-[#0096ff]/5 scale-[1.01]'
                    : 'border-[#30363d] hover:border-[#484f58] hover:bg-[#161b22]'}`}
              >
                <Upload size={28} className="mx-auto text-[#484f58] mb-3" />
                <p className="text-[#c9d1d9] text-sm font-medium">
                  Drag &amp; drop images here, or <span className="text-[#0096ff]">browse files</span>
                </p>
                <p className="text-[#484f58] text-xs mt-1">PNG, JPG, GIF, WEBP supported</p>
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)} className="hidden" />
              </div>
              {images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-4">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative group rounded-lg overflow-hidden border border-[#30363d] bg-[#161b22]">
                      <img src={img.preview} alt={img.name} className="w-full h-24 object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                          className="p-1.5 rounded-full bg-red-600 text-white hover:bg-red-500 transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </div>
                      <div className="px-2 py-1 text-[10px] text-[#484f58] truncate bg-[#0d1117]">{img.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Feedback */}
            {error && (
              <div className="flex items-start gap-2 p-4 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-sm">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 p-4 rounded-lg bg-green-950/40 border border-green-800/60 text-green-300 text-sm">
                <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-3 pt-2 pb-8">
              <button
                type="button"
                onClick={() => navigate('/sentinel')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-[#8b949e] border border-[#30363d] hover:border-[#484f58] hover:text-white transition-colors"
              >
                <ArrowLeft size={14} />
                View Live Map
              </button>
              <button
                type="submit"
                disabled={busy || !isSupabaseConfigured}
                className="flex items-center gap-2 px-8 py-2.5 rounded-lg font-bold text-sm text-white bg-[#0096ff] hover:bg-[#0080db] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {busy ? (
                  <><RefreshCw size={15} className="animate-spin" /> Submitting…</>
                ) : (
                  <><Send size={15} /> Submit Incident</>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ════════════════ TAB 3: EXTERNAL INCIDENTS ════════════════ */}
        {activeTab === 'external' && (
          <div className="space-y-4">
            {/* Search + refresh bar */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484f58] pointer-events-none" />
                <input
                  type="text"
                  value={externalSearch}
                  onChange={(e) => setExternalSearch(e.target.value)}
                  placeholder="Filter by fire name, state, or county…"
                  className={INPUT_CLS + ' pl-9'}
                />
              </div>
              <button
                type="button"
                onClick={loadExternalIncidents}
                disabled={externalLoading}
                className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-white transition-colors disabled:opacity-50 shrink-0"
              >
                <RefreshCw size={13} className={externalLoading ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#0096ff]/8 border border-[#0096ff]/20">
              <Globe size={14} className="text-[#0096ff] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#8b949e] leading-relaxed">
                These incidents are sourced from the IRWIN / WFIGS national wildfire database.
                Use <strong className="text-[#c9d1d9]">Post Update</strong> to attach reporter
                intelligence to any incident — updates appear immediately on the live map timeline.
              </p>
            </div>

            {/* Loading */}
            {externalLoading && (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 rounded-full border-2 border-[#0096ff] border-t-transparent animate-spin" />
              </div>
            )}

            {/* Error */}
            {externalError && !externalLoading && (
              <div className="flex items-start gap-2 p-4 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-sm">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{externalError}</span>
              </div>
            )}

            {/* Empty */}
            {!externalLoading && !externalError && filteredExternal.length === 0 && (
              <div className="text-center py-20 bg-[#0d1117] border border-[#21262d] rounded-xl">
                <Globe size={36} className="mx-auto text-[#30363d] mb-3" />
                <p className="text-[#8b949e] text-sm font-medium">
                  {externalSearch ? 'No incidents match your search.' : 'No active incidents found.'}
                </p>
                {!externalSearch && (
                  <button
                    type="button"
                    onClick={loadExternalIncidents}
                    className="mt-5 px-5 py-2 rounded-lg text-sm font-medium text-white bg-[#0096ff] hover:bg-[#0080db] transition-colors"
                  >
                    Load Incidents
                  </button>
                )}
              </div>
            )}

            {/* Incident list */}
            {!externalLoading && filteredExternal.length > 0 && (
              <>
                <p className="text-[#8b949e] text-xs">
                  {filteredExternal.length} incident{filteredExternal.length !== 1 ? 's' : ''}
                  {externalSearch ? ' matching filter' : ''}
                </p>
                {filteredExternal.map((inc) => (
                  <ExternalIncidentCard
                    key={inc.id}
                    incident={inc}
                    profile={profile}
                    userId={user.id}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* ════════════════ TAB 4: EVAC ZONES ════════════════ */}
        {activeTab === 'evaczones' && (
          <div className="space-y-5">

            {/* Info banner */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-950/30 border border-red-800/40">
              <TriangleAlert size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#8b949e] leading-relaxed">
                Draw evacuation zone polygons that appear instantly on the public Sentinel map.
                Choose the zone type (Order / Warning / Watch), draw one or more polygons,
                fill in the details, and click <strong className="text-[#c9d1d9]">Publish Zone</strong>.
                You can lift or delete zones at any time from the list below.
              </p>
            </div>

            {/* Draw new zone button / drawer */}
            {!showDrawer ? (
              <button
                type="button"
                onClick={() => { setEvacSuccess(null); setEvacSaveError(null); setShowDrawer(true); }}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors border border-red-500/40"
              >
                <TriangleAlert size={15} />
                Draw New Evacuation Zone
              </button>
            ) : (
              <div className="bg-[#0d1117] border border-[#21262d] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-semibold text-sm">New Evacuation Zone</h3>
                  <button
                    type="button"
                    onClick={() => setShowDrawer(false)}
                    className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                <EvacZoneDrawer
                  saving={evacSaving}
                  saveError={evacSaveError}
                  onCancel={() => setShowDrawer(false)}
                  onSave={async (zoneData) => {
                    setEvacSaving(true);
                    setEvacSaveError(null);
                    try {
                      await createReporterEvacZone({ userId: user.id, ...zoneData });
                      setShowDrawer(false);
                      setEvacSuccess('Evacuation zone published and live on the map.');
                      refreshEvacZones();
                    } catch (err) {
                      setEvacSaveError(err?.message || 'Failed to publish zone.');
                    } finally {
                      setEvacSaving(false);
                    }
                  }}
                />
              </div>
            )}

            {/* Success feedback */}
            {evacSuccess && (
              <div className="flex items-start gap-2 p-3 rounded-lg text-xs border bg-green-950/40 border-green-800/60 text-green-300">
                <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
                <span>{evacSuccess}</span>
              </div>
            )}

            {/* My zones list */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[#8b949e] text-sm">
                  {evacZonesLoading
                    ? 'Loading zones…'
                    : `${myOwnEvacZones.length} zone${myOwnEvacZones.length !== 1 ? 's' : ''}`}
                </p>
                <button
                  type="button"
                  onClick={refreshEvacZones}
                  disabled={evacZonesLoading}
                  className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-white transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={13} className={evacZonesLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {evacZonesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-7 h-7 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
                </div>
              ) : myOwnEvacZones.length === 0 ? (
                <div className="text-center py-16 bg-[#0d1117] border border-[#21262d] rounded-xl">
                  <TriangleAlert size={32} className="mx-auto text-[#30363d] mb-3" />
                  <p className="text-[#8b949e] text-sm font-medium">No evacuation zones yet</p>
                  <p className="text-[#484f58] text-xs mt-1">Click the button above to draw your first evacuation zone.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myOwnEvacZones.map((zone) => (
                    <EvacZoneCard
                      key={zone.id}
                      zone={zone}
                      onRefresh={refreshEvacZones}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════ TAB 2: MY INCIDENTS ════════════════ */}
        {activeTab === 'manage' && (
          <div className="space-y-4">

            {/* Refresh control */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-[#8b949e] text-sm">
                {reportsLoading
                  ? 'Loading incidents…'
                  : `${myIncidents.length} incident${myIncidents.length !== 1 ? 's' : ''} found`}
              </p>
              <button
                type="button"
                onClick={refreshReports}
                disabled={reportsLoading}
                className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshCw size={13} className={reportsLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {reportsLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 rounded-full border-2 border-[#0096ff] border-t-transparent animate-spin" />
              </div>
            ) : myIncidents.length === 0 ? (
              <div className="text-center py-20 bg-[#0d1117] border border-[#21262d] rounded-xl">
                <Flame size={36} className="mx-auto text-[#30363d] mb-3" />
                <p className="text-[#8b949e] text-sm font-medium">No incidents submitted yet</p>
                <p className="text-[#484f58] text-xs mt-1">Switch to the Add Incident tab to submit your first report.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('add')}
                  className="mt-5 px-5 py-2 rounded-lg text-sm font-medium text-white bg-[#0096ff] hover:bg-[#0080db] transition-colors"
                >
                  Add First Incident
                </button>
              </div>
            ) : (
              myIncidents.map((report) => (
                <IncidentCard
                  key={report.id}
                  report={report}
                  profile={profile}
                  userId={user.id}
                  onRefresh={refreshReports}
                />
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
}
