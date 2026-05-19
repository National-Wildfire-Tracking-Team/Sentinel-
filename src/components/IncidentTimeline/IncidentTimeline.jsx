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
import { useAuth } from '../../context/AuthContext';

/** Coerce DB/API values so .trim() / .split never throw (e.g. numeric JSON fields). */
function safeText(value) {
  if (value == null) return '';
  return String(value);
}

function formatUpdateCardTimestamp(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
      + ' '
      + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function badgeLabelForUpdate(update, dataSource) {
  const isAutomated = update.source_type === 'automated';
  const name = safeText(update.source_name).trim();
  const fallback = safeText(dataSource).trim();
  if (!isAutomated) {
    return name ? name.toUpperCase().slice(0, 18) : 'NWTT';
  }
  const src = name || fallback;
  if (/cal\s*fire/i.test(src)) return 'CAL FIRE';
  if (/irwin|nifc/i.test(src)) return 'IRWIN';
  if (/inciweb/i.test(src)) return 'INCIWEB';
  return src ? src.toUpperCase().slice(0, 14) : 'OFFICIAL';
}

function officialFeedLinkLabel(sourceLabel) {
  const s = safeText(sourceLabel).trim();
  if (/cal\s*fire|fire\.ca\.gov/i.test(s)) return { href: 'https://www.fire.ca.gov/', text: 'CAL FIRE (fire.ca.gov)' };
  if (/inciweb/i.test(s)) return { href: 'https://inciweb.nwcg.gov/', text: s.includes('http') ? s : 'InciWeb' };
  if (/irwin|nifc/i.test(s)) return { href: 'https://www.nifc.gov/fire-information/nifc-large-fire', text: 'NIFC / IRWIN' };
  return { href: null, text: s || 'official sources' };
}

// ─── Single update card ──────────────────────────────────────────────────────

function UpdateCard({ update, currentUserId, onEdit, onDelete, dataSource }) {
  const isOwn = currentUserId && update.user_id === currentUserId;
  const isAutomated = update.source_type === 'automated';
  const contentStr = safeText(update.content);
  const lines = contentStr.split('\n').filter(Boolean);
  const badge = badgeLabelForUpdate(update, dataSource);
  const ts = formatUpdateCardTimestamp(update.created_at);

  return (
    <div
      className={`rounded-lg overflow-hidden group mb-2 last:mb-0 border
        ${isAutomated
          ? 'border-red-950/90 bg-sentinel-800/85'
          : 'border-amber-900/70 bg-sentinel-800/85'}`}
    >
      {/* Top: source pill | timestamp + edit */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-sentinel-700/50">
        <span
          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide truncate max-w-[58%]
            ${isAutomated
              ? 'bg-red-600 text-white'
              : 'bg-amber-700/90 text-amber-50 border border-amber-600/50'}`}
        >
          {badge}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {isOwn && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity mr-0.5">
              <button
                type="button"
                onClick={() => onEdit(update)}
                className="p-0.5 text-sentinel-500 hover:text-sentinel-200 transition-colors"
                title="Edit update"
              >
                <Pencil size={10} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(update.id)}
                className="p-0.5 text-sentinel-500 hover:text-red-400 transition-colors"
                title="Delete update"
              >
                <Trash2 size={10} />
              </button>
            </div>
          )}
          <span className="text-sentinel-400 text-[10px] tabular-nums">{ts}</span>
        </div>
      </div>

      <div className="px-3 py-2.5">
        <p className="text-white text-xs font-bold mb-1.5">
          {isAutomated ? 'Data Updated' : (
            <span className="inline-flex items-center gap-1">
              Reporter Update
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-amber-400 shrink-0" aria-hidden>
                <path d="M8 0l1.9 2.5L13 1.5l.5 3.2L16 6.4l-1.5 2.6 1.5 2.6-2.5 1.7-.5 3.2-3.1-1-1.9 2.5L6.1 16l-1.9-2.5-3.1 1-.5-3.2L0 9.6l1.5-2.6L0 4.4l2.5-1.7.5-3.2 3.1 1z" />
              </svg>
            </span>
          )}
        </p>
        <div className="space-y-0.5">
          {lines.length > 0 ? (
            lines.map((line, i) => (
              <p key={i} className="text-sentinel-100 text-xs leading-snug">{line}</p>
            ))
          ) : contentStr ? (
            <p className="text-sentinel-100 text-xs leading-snug whitespace-pre-wrap">{contentStr}</p>
          ) : (
            <p className="text-sentinel-500 text-xs italic">No details</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Compose box ─────────────────────────────────────────────────────────────

function ComposeBox({ onSubmit, disabled }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setText('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
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
        disabled={!text.trim() || disabled || submitting}
        className="p-2 bg-fire-600/80 hover:bg-fire-600 text-white rounded-lg
                   transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        title="Post update (Ctrl+Enter)"
      >
        {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
      </button>
    </form>
  );
}

// ─── Edit modal (inline) ─────────────────────────────────────────────────────

function EditBox({ update, onSave, onCancel }) {
  const [text, setText] = useState(() => safeText(update.content));
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

  const handleAdd = async (content) => {
    const sourceName = profile?.email?.split('@')[0] || 'Reporter';
    await addUpdate({ content, sourceName, userId: user.id });
  };

  const handleEdit = async (updateId, newContent) => {
    await editUpdate(updateId, newContent);
  };

  const handleDelete = async (updateId) => {
    await deleteUpdate(updateId);
  };

  const legacyTrimmed = safeText(legacyInitialSubmission).trim();

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
      updates
        .filter((u) => u.source_type === 'automated')
        .map((u) => safeText(u.source_name).trim())
        .filter(Boolean),
    )];
    return names.length > 0 ? names.join(', ') : safeText(dataSource);
  })();

  if (!incidentId) return null;

  return (
    <div className="mt-1">
      <div className="text-[10px] font-bold text-sentinel-500 uppercase tracking-widest mb-2">
        Live Updates
      </div>

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

      {/* Automated-only notice — navy card, bot icon, primary source link */}
      {automatedOnly && (() => {
        const { href, text } = officialFeedLinkLabel(automatedSourceLabel);
        return (
          <div className="mb-4 p-3.5 rounded-xl bg-[#0c1524] border border-sky-500/30 flex items-start gap-3 shadow-inner">
            <Bot size={18} className="text-sky-400 shrink-0 mt-0.5" aria-hidden />
            <p className="text-[12px] text-sentinel-300 leading-relaxed">
              All updates for this incident are automated and provided by:{' '}
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-sky-400 hover:text-sky-300 underline-offset-2 hover:underline"
                >
                  {text}
                </a>
              ) : (
                <span className="font-semibold text-sky-400">{text}</span>
              )}
              . NWTT reporters are not monitoring this incident at this time.
            </p>
          </div>
        );
      })()}

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
        <div className="space-y-0">
          {displayUpdates.map((u) =>
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
                currentUserId={user?.id}
                onEdit={setEditing}
                onDelete={handleDelete}
                dataSource={dataSource}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
