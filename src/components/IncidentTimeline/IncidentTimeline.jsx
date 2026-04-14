/**
 * IncidentTimeline.jsx
 * Live update feed for an incident. Displays reporter and automated updates
 * in reverse-chronological order with realtime subscription via Supabase.
 */

import { useState } from 'react';
import {
  MessageSquare, Bot, Send, Pencil, Trash2, Check, X, Loader2,
} from 'lucide-react';
import { useIncidentUpdates } from '../../hooks/useIncidentUpdates';
import { useAuth } from '../../context/AuthContext';
import { formatRelativeTime, formatDateTime } from '../../utils/formatUtils';

// ─── Single update card ──────────────────────────────────────────────────────

function UpdateCard({ update, currentUserId, onEdit, onDelete }) {
  const isOwn = currentUserId && update.user_id === currentUserId;
  const isAutomated = update.source_type === 'automated';

  return (
    <div className="relative pl-6 pb-4 group">
      {/* Timeline connector line */}
      <div className="absolute left-[9px] top-5 bottom-0 w-px bg-sentinel-700 group-last:hidden" />

      {/* Timeline dot */}
      <div
        className={`absolute left-0 top-1.5 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center
          ${isAutomated
            ? 'border-blue-500/60 bg-blue-500/20'
            : 'border-fire-500/60 bg-fire-500/20'
          }`}
      >
        {isAutomated
          ? <Bot size={9} className="text-blue-400" />
          : <MessageSquare size={9} className="text-fire-400" />
        }
      </div>

      {/* Card body */}
      <div className="bg-sentinel-800/60 border border-sentinel-700 rounded-lg p-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-sentinel-200 truncate block">
              {update.source_name}
            </span>
            <span className={`text-[10px] font-medium ${isAutomated ? 'text-blue-400' : 'text-fire-400'}`}>
              {isAutomated ? 'Automated' : 'Reporter'}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-sentinel-500" title={formatDateTime(update.created_at)}>
              {formatRelativeTime(update.created_at)}
            </span>
            {isOwn && (
              <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
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

        {/* Content */}
        <p className="text-xs text-sentinel-300 leading-relaxed mt-1.5 whitespace-pre-wrap">
          {update.content}
        </p>
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

export default function IncidentTimeline({ incidentId, allowPost = false }) {
  const { updates, loading, error, addUpdate, editUpdate, deleteUpdate } = useIncidentUpdates(incidentId);
  const { user, profile, isAuthenticated } = useAuth();
  const [editing, setEditing] = useState(null);

  const canPost = allowPost && isAuthenticated;

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

  if (!incidentId) return null;

  return (
    <div className="mt-4">
      <div className="text-[10px] font-bold text-sentinel-500 uppercase tracking-widest mb-3">
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

      {/* Empty state */}
      {!loading && !error && updates.length === 0 && (
        <div className="text-center py-6">
          <MessageSquare size={20} className="mx-auto text-sentinel-600 mb-2" />
          <p className="text-xs text-sentinel-500">No updates yet.</p>
          {canPost && (
            <p className="text-[10px] text-sentinel-600 mt-1">
              Be the first to post an update for this incident.
            </p>
          )}
        </div>
      )}

      {/* Update feed */}
      {!loading && updates.length > 0 && (
        <div>
          {updates.map((u) =>
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
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
