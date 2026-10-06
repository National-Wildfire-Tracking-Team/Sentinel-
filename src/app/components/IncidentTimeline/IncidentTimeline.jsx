/**
 * IncidentTimeline.jsx
 * Live update feed for an incident. Displays reporter and automated updates
 * in reverse-chronological order with realtime subscription via Supabase.
 * Updates that arrive live are briefly highlighted and tagged "New".
 */

import { useState, useMemo } from 'react';
import { BadgeCheck, Send, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react';
import { useIncidentUpdates } from '../../hooks/useIncidentUpdates';
import { useImageAttachments } from '../../hooks/useImageAttachments';
import { uploadIncidentPhotos } from '../../api/incidentPhotos';
import { useAuth } from '../../../shared/context/AuthContext';
import { formatClockTime } from '../../utils/formatUtils';
import {
  POSTABLE_UPDATE_TYPES, UPDATE_TYPE_LABELS, updateMessage, updateTypeLabel,
} from '../FireDetailPanel/incidentDetailModel';
import PhotoPickerButton from '../PhotoAttachments/PhotoPickerButton';

// ─── Single update entry ─────────────────────────────────────────────────────

function UpdateEntry({ update, fresh, padX, currentUserId, onEdit, onDelete }) {
  const isOwn = currentUserId && update.user_id === currentUserId;
  const isAutomated = update.source_type === 'automated';
  const photos = Array.isArray(update.photo_urls) ? update.photo_urls : [];

  return (
    <article
      className={`group py-4 border-b border-sentinel-700 transition-colors duration-1000 ${padX}
        ${fresh ? 'bg-[rgba(255,90,0,0.08)]' : 'bg-transparent'}`}
    >
      <div className="flex items-center gap-1.5 text-[13px] leading-5">
        <time dateTime={update.created_at} className="text-sentinel-200 tabular-nums">
          {formatClockTime(update.created_at)}
        </time>
        <span className="text-sentinel-200" aria-hidden>·</span>
        <span className="text-white font-semibold">{updateTypeLabel(update)}</span>
        {fresh && (
          <span className="ml-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fire-400">New</span>
        )}
        {isOwn && (
          <div className="ml-auto -my-3 -mr-3 flex opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => onEdit(update)}
              className="w-11 h-11 inline-flex items-center justify-center text-sentinel-200 hover:text-white"
              aria-label="Edit update"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(update.id)}
              className="w-11 h-11 inline-flex items-center justify-center text-sentinel-200 hover:text-red-400"
              aria-label="Delete update"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {update.content && (
        <p className="mt-1.5 text-[15px] leading-[1.55] text-sentinel-100 whitespace-pre-wrap break-words">
          {updateMessage(update)}
        </p>
      )}

      {photos[0] && (
        <a href={photos[0]} target="_blank" rel="noopener noreferrer" className="block mt-3">
          <img
            src={photos[0]}
            alt="Photo attached to this update"
            loading="lazy"
            className="w-full max-h-80 object-cover rounded-lg border border-sentinel-700"
          />
        </a>
      )}
      {photos.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-x-3">
          {photos.slice(1).map((url, i) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center min-h-[44px] text-xs text-sentinel-200 hover:text-white"
            >
              Photo {i + 2}
            </a>
          ))}
        </div>
      )}

      <p className="mt-2 flex items-center gap-1 text-xs text-sentinel-200">
        <span className="text-sentinel-100 font-medium">{update.source_name || 'Reporter'}</span>
        {isAutomated ? (
          <span>· Automated feed</span>
        ) : (
          <>
            <BadgeCheck size={13} className="text-sentinel-100" aria-label="Verified reporter" />
            <span>NWTT Reporter</span>
          </>
        )}
      </p>
    </article>
  );
}

// ─── Compose box ─────────────────────────────────────────────────────────────

function ComposeBox({ onSubmit, disabled }) {
  const [text, setText] = useState('');
  const [updateType, setUpdateType] = useState('field_report');
  const [submitting, setSubmitting] = useState(false);
  const photos = useImageAttachments();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && photos.images.length === 0) || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ content: trimmed, updateType, files: photos.images.map((img) => img.file) });
      setText('');
      photos.reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <select
        value={updateType}
        onChange={(e) => setUpdateType(e.target.value)}
        disabled={disabled || submitting}
        aria-label="Update type"
        className="w-full min-h-[44px] bg-sentinel-900 border border-sentinel-500 rounded-lg px-3
                   text-sm text-slate-100 focus:outline-none focus:border-fire-600"
      >
        {POSTABLE_UPDATE_TYPES.map((t) => (
          <option key={t} value={t}>{UPDATE_TYPE_LABELS[t]}</option>
        ))}
      </select>
      <div className="flex gap-2 items-end">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Post an update..."
          disabled={disabled || submitting}
          rows={2}
          className="flex-1 bg-sentinel-900 border border-sentinel-500 rounded-lg px-3 py-2
                     text-sm text-slate-100 placeholder:text-sentinel-300
                     focus:outline-none focus:border-fire-600 resize-none disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e);
          }}
        />
        <button
          type="submit"
          disabled={(!text.trim() && photos.images.length === 0) || disabled || submitting}
          className="w-11 h-11 inline-flex items-center justify-center bg-fire-600 hover:bg-fire-500
                     text-sentinel-900 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          aria-label="Post update"
          title="Post update (Ctrl+Enter)"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
      <PhotoPickerButton {...photos} label="Add Photos" />
    </form>
  );
}

// ─── Inline edit ─────────────────────────────────────────────────────────────

function EditBox({ update, padX, onSave, onCancel }) {
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
    <div className={`py-4 border-b border-sentinel-700 space-y-2 ${padX}`}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full bg-sentinel-900 border border-sentinel-500 rounded-lg px-3 py-2
                   text-sm text-slate-100 focus:outline-none focus:border-fire-600 resize-none"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center gap-1 min-h-[44px] px-3 text-sm text-sentinel-100 hover:text-white"
        >
          <X size={14} /> Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!text.trim() || saving}
          className="btn-glass-fire inline-flex items-center gap-1 min-h-[44px] px-4 text-sm font-semibold rounded-lg
                     disabled:opacity-40"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

/**
 * @param {string}  incidentId   Incident identifier used to query updates.
 * @param {object}  [feed]       Result of useIncidentUpdates(incidentId) when the
 *                               parent already subscribes (the incident detail
 *                               panel); otherwise this component subscribes itself.
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
 * @param {boolean} [bleed]      Entries span the container edge to edge with their
 *                               own horizontal padding (incident detail panel).
 * @param {boolean} [showHeading] Show the "Updates" heading (off inside tabs).
 */
export default function IncidentTimeline({
  incidentId,
  feed,
  allowPost = false,
  dataSource = 'NIFC / IRWIN',
  sourceVariant = 'fed',
  legacyInitialSubmission = '',
  legacySubmittedAt = null,
  bleed = false,
  showHeading = true,
}) {
  const ownFeed = useIncidentUpdates(feed ? null : incidentId);
  const { updates, loading, error, freshIds, addUpdate, editUpdate, deleteUpdate } = feed || ownFeed;
  const { user, profile, isAuthenticated, isReporter, isAdmin } = useAuth();
  const [editing, setEditing] = useState(null);
  const padX = bleed ? 'px-5' : '';

  // Reporters and admins can post to any incident timeline they can view.
  // Explicit allowPost prop also enables posting (e.g. from reporter dashboard).
  const canPost = isAuthenticated && (allowPost || isReporter || isAdmin);

  const handleAdd = async ({ content, files, updateType }) => {
    const sourceName = profile?.email?.split('@')[0] || 'Reporter';
    const photoUrls = files?.length
      ? await uploadIncidentPhotos(files, { userId: user.id, incidentId })
      : [];
    await addUpdate({ content, sourceName, userId: user.id, photoUrls, updateType });
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
            update_type: 'field_report',
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

  return (
    <div className={showHeading ? 'mt-4' : ''}>
      {showHeading && (
        <div className="text-[12px] font-semibold text-sentinel-200 uppercase tracking-[0.1em] mb-1">
          Updates
        </div>
      )}

      {canPost && (
        <div className={`py-4 border-b border-sentinel-700 ${padX}`}>
          <ComposeBox onSubmit={handleAdd} disabled={!incidentId} />
        </div>
      )}

      {automatedOnly && (
        <p className={`py-3 border-b border-sentinel-700 text-[13px] leading-relaxed text-sentinel-200 ${padX}`}>
          Updates for this incident come automatically from{' '}
          <span className="text-sentinel-100 font-medium">{automatedSourceLabel}</span>.
          NWTT reporters are not monitoring it right now.
        </p>
      )}

      {loading && (
        <div className={`flex items-center gap-2 py-6 text-sm text-sentinel-200 ${padX}`}>
          <Loader2 size={16} className="animate-spin" />
          Loading updates…
        </div>
      )}

      {error && !loading && (
        <p className={`py-4 text-sm text-red-400 ${padX}`}>
          Couldn&apos;t load updates. {error.message}
        </p>
      )}

      {!loading && !error && displayUpdates.length === 0 && (
        <p className={`py-6 text-sm text-sentinel-200 ${padX}`}>
          No updates yet.{canPost && ' Be the first to post one for this incident.'}
        </p>
      )}

      {!loading && displayUpdates.length > 0 && (
        <div>
          {displayUpdates.map((u) =>
            editing?.id === u.id ? (
              <EditBox
                key={u.id}
                update={u}
                padX={padX}
                onSave={editUpdate}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <UpdateEntry
                key={u.id}
                update={u}
                fresh={freshIds?.has(u.id)}
                padX={padX}
                currentUserId={user?.id}
                onEdit={setEditing}
                onDelete={deleteUpdate}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
