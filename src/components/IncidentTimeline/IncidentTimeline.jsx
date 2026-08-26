/**
 * IncidentTimeline.jsx
 * Live update feed for an incident. Displays reporter and automated updates
 * in reverse-chronological order with realtime subscription via Supabase.
 */

import { useState, useMemo } from 'react';
import {
  MessageSquare, Bot, Send, Pencil, Trash2, Check, X, Loader2,
} from 'lucide-react';
import { useIncidentUpdates } from '../../hooks/useIncidentUpdates';
import { useImageAttachments } from '../../hooks/useImageAttachments';
import { uploadIncidentPhotos } from '../../api/incidentPhotos';
import { useAuth } from '../../context/AuthContext';
import { sanitizePhotoUrls } from '../../utils/safeUrl';
import PhotoPickerButton from '../PhotoAttachments/PhotoPickerButton';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Short, all-caps badge label for the update's source (e.g. "CAL FIRE"). */
function sourceBadgeLabel(sourceName) {
  const name = (sourceName || '').trim();
  if (!name) return 'UPDATE';
  if (/cal\s*fire/i.test(name)) return 'CAL FIRE';
  return name.toUpperCase();
}

/** "Data Updated" for field-diff automated content, "Status Update" otherwise. */
function updateTitle(update) {
  if (update.source_type !== 'automated') return 'Field Report';
  return update.content?.includes('→') ? 'Data Updated' : 'Status Update';
}

/** Multi-line diff content ("Acres: ...\nContainment: ...") joins with " · ". */
function updateDescription(update) {
  const lines = (update.content || '').split('\n').filter(Boolean);
  return lines.length > 1 ? lines.join(' · ') : (update.content || '');
}

/** Splits a timestamp into stacked { date, time } strings for card headers. */
function splitTimestamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' };
  return {
    date: d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

// ─── Single update card ──────────────────────────────────────────────────────

function UpdateCard({ update, isLatest, currentUserId, onEdit, onDelete }) {
  const isOwn = currentUserId && update.user_id === currentUserId;
  const isAutomated = update.source_type === 'automated';
  const badge = sourceBadgeLabel(update.source_name);
  const { date, time } = splitTimestamp(update.created_at);
  const safePhotos = sanitizePhotoUrls(update.photo_urls);

  const badgeClasses = isAutomated
    ? 'bg-red-950/60 text-red-400 border-red-800/50'
    : 'bg-amber-950/40 text-amber-300 border-amber-800/40';

  return (
    <div className="rounded-xl border border-sentinel-700 bg-sentinel-800/40 p-3 group">
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badgeClasses}`}>
          {isAutomated ? <Bot size={10} /> : null}
          {badge}
        </span>
        <div className="flex items-start gap-1.5 shrink-0">
          <div className="text-right">
            <div className="text-[11px] text-sentinel-500 leading-tight">{date}</div>
            <div className="text-[11px] text-sentinel-500 leading-tight">{time}</div>
          </div>
          {isOwn && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(update)}
                className="p-0.5 text-sentinel-500 hover:text-sentinel-200 transition-colors"
                title="Edit update"
              >
                <Pencil size={10} />
              </button>
              <button
                onClick={() => onDelete(update.id)}
                className="p-0.5 text-sentinel-500 hover:text-red-400 transition-colors"
                title="Delete update"
              >
                <Trash2 size={10} />
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-white font-bold text-sm leading-tight mb-1">{updateTitle(update)}</p>
      <p className="text-sentinel-300 text-xs leading-relaxed whitespace-pre-wrap">
        {updateDescription(update)}
      </p>

      {safePhotos.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {safePhotos.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <img
                src={url}
                alt={`Attachment ${i + 1}`}
                className="w-14 h-14 object-cover rounded-md border border-sentinel-700 hover:opacity-80 transition-opacity"
              />
            </a>
          ))}
        </div>
      )}

      {isLatest && (
        <p className="text-sentinel-500 text-[11px] italic mt-2">Updated by: {badge}</p>
      )}
    </div>
  );
}

// ─── Compose box ─────────────────────────────────────────────────────────────

function ComposeBox({ onSubmit, disabled }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const photos = useImageAttachments();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && photos.images.length === 0) || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ content: trimmed, files: photos.images.map((img) => img.file) });
      setText('');
      photos.reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2 items-end">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Post an update..."
          disabled={disabled || submitting}
          rows={2}
          className="flex-1 bg-sentinel-800/80 border border-sentinel-700 rounded-lg px-3 py-2
                     text-xs text-sentinel-200 placeholder:text-sentinel-600
                     focus:outline-none focus:border-fire-500/50 focus:ring-1 focus:ring-fire-500/20
                     resize-none disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e);
          }}
        />
        <button
          type="submit"
          disabled={(!text.trim() && photos.images.length === 0) || disabled || submitting}
          className="p-2 bg-fire-600/80 hover:bg-fire-600 text-white rounded-lg
                     transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          title="Post update (Ctrl+Enter)"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
      <PhotoPickerButton {...photos} label="Add Photos" />
    </form>
  );
}

// ─── Edit modal (inline) ─────────────────────────────────────────────────────

function EditBox({ update, onSave, onCancel }) {
  const [text, setText] = useState(update.content);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave(update.id, trimmed);
      onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-sentinel-800/80 border border-fire-500/30 rounded-lg p-3 space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full bg-sentinel-900/60 border border-sentinel-700 rounded px-2 py-1.5
                   text-xs text-sentinel-200 focus:outline-none focus:border-fire-500/50
                   resize-none"
        autoFocus
      />
      <div className="flex justify-end gap-1.5">
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-sentinel-400
                     hover:text-sentinel-200 transition-colors"
        >
          <X size={10} /> Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!text.trim() || saving}
          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-fire-600/60
                     hover:bg-fire-600 text-white rounded transition-colors disabled:opacity-40"
        >
          {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

/**
 * @param {string}  incidentId   Incident identifier used to query updates.
 * @param {boolean} allowPost    Show the compose box (reporter portal only).
 * @param {string}  dataSource   Fallback source label shown in the automated-only
 *                               notice when there are no updates at all (e.g. "NIFC / IRWIN").
 * @param {'fed'|'community'} sourceVariant  When "community", do not show the
 *                               automated-feed notice (reporter-submitted incidents).
 * @param {string} [legacyInitialSubmission]  If the DB has no rows yet, show this
 *                               as a synthetic reporter update (older reports submitted
 *                               before the timeline was seeded).
 * @param {string} [legacySubmittedAt]       ISO timestamp for the synthetic update
 *                               (e.g. fire_reports.created_at).
 */
export default function IncidentTimeline({
  incidentId,
  allowPost = false,
  dataSource = 'NIFC / IRWIN',
  sourceVariant = 'fed',
  legacyInitialSubmission = '',
  legacySubmittedAt = null,
}) {
  const { updates, loading, error, addUpdate, editUpdate, deleteUpdate } = useIncidentUpdates(incidentId);
  const { user, profile, isAuthenticated, isReporter, isAdmin } = useAuth();
  const [editing, setEditing] = useState(null);

  // Reporters and admins can post to any incident timeline they can view.
  // Explicit allowPost prop also enables posting (e.g. from reporter dashboard).
  const canPost = isAuthenticated && (allowPost || isReporter || isAdmin);

  const handleAdd = async ({ content, files }) => {
    const sourceName = profile?.email?.split('@')[0] || 'Reporter';
    const photoUrls = files?.length
      ? await uploadIncidentPhotos(files, { userId: user.id, incidentId })
      : [];
    await addUpdate({ content, sourceName, userId: user.id, photoUrls });
  };

  const handleEdit = async (updateId, newContent) => {
    await editUpdate(updateId, newContent);
  };

  const handleDelete = async (updateId) => {
    await deleteUpdate(updateId);
  };

  const legacyTrimmed = (legacyInitialSubmission || '').trim();

  const displayUpdates = useMemo(() => {
    const synthetic =
      !loading && !error && updates.length === 0 && legacyTrimmed
        ? [{
            id: '__legacy_initial_submission__',
            incident_id: incidentId,
            content: legacyTrimmed,
            source_type: 'reporter',
            source_name: 'NWTT Reporter',
            user_id: null,
            created_at: legacySubmittedAt || new Date(0).toISOString(),
          }]
        : [];
    if (synthetic.length === 0) return updates;
    return [...updates, ...synthetic];
  }, [loading, error, updates, legacyTrimmed, legacySubmittedAt, incidentId]);

  // Determine whether any human reporter has posted to this incident.
  const hasReporterUpdates = displayUpdates.some((u) => u.source_type === 'reporter');
  const automatedOnly = !loading && !error && !hasReporterUpdates && sourceVariant !== 'community';

  // Build a readable source label from the automated update records themselves,
  // falling back to the dataSource prop when there are no updates yet.
  const automatedSourceLabel = (() => {
    const names = [...new Set(
      updates.filter((u) => u.source_type === 'automated').map((u) => u.source_name).filter(Boolean)
    )];
    return names.length > 0 ? names.join(', ') : dataSource;
  })();

  if (!incidentId) return null;

  const latest = displayUpdates[0];
  const { date: latestDate, time: latestTime } = latest
    ? splitTimestamp(latest.created_at)
    : { date: '', time: '' };

  return (
    <div className="mt-4">
      <div className="text-[10px] font-bold text-sentinel-500 uppercase tracking-widest mb-3">
        Updates
      </div>

      {/* Last-updated summary, mirrors the top card below */}
      {latest && !loading && (
        <div className="mb-3">
          <p className="text-white font-bold text-sm leading-tight">Last Updated</p>
          <p className="text-fire-300 font-bold text-sm leading-tight mb-1.5">
            {latestDate} {latestTime}
          </p>
          <p className="text-sentinel-300 text-sm leading-snug">{updateDescription(latest)}</p>
        </div>
      )}

      {/* Compose area (reporter portal only) */}
      {canPost && (
        <div className="mb-4">
          <ComposeBox onSubmit={handleAdd} disabled={!incidentId} />
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={16} className="animate-spin text-sentinel-500" />
          <span className="ml-2 text-xs text-sentinel-500">Loading updates...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="text-xs text-red-400/80 bg-red-950/30 border border-red-900/40 rounded-lg p-2 mb-3">
          Failed to load updates. {error.message}
        </div>
      )}

      {/* Automated-only notice — shown whenever there are no reporter updates */}
      {automatedOnly && (
        <div className="mb-4 p-3 rounded-lg bg-blue-950/30 border border-blue-800/40 flex items-start gap-2.5">
          <Bot size={14} className="text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-200/80 leading-relaxed">
            All updates for this incident are automated and provided by:{' '}
            <span className="font-semibold text-blue-300">{automatedSourceLabel}</span>.
            NWTT reporters are not monitoring this incident at this time.
          </p>
        </div>
      )}

      {/* Empty state (no updates at all) */}
      {!loading && !error && displayUpdates.length === 0 && (
        <div className="text-center py-4">
          <MessageSquare size={18} className="mx-auto text-sentinel-600 mb-2" />
          <p className="text-xs text-sentinel-500">No updates yet.</p>
          {canPost && (
            <p className="text-[10px] text-sentinel-600 mt-1">
              Be the first to post an update for this incident.
            </p>
          )}
        </div>
      )}

      {/* Update feed */}
      {!loading && displayUpdates.length > 0 && (
        <div className="space-y-3">
          {displayUpdates.map((u, i) =>
            editing?.id === u.id ? (
              <EditBox
                key={u.id}
                update={u}
                onSave={handleEdit}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <UpdateCard
                key={u.id}
                update={u}
                isLatest={i === 0}
                currentUserId={user?.id}
                onEdit={setEditing}
                onDelete={handleDelete}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
