/**
 * UpdatesFeed.jsx
 * Sidebar section showing recent incident updates (data changes + reporter posts)
 * across all active incidents, in reverse-chronological order.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Rss } from 'lucide-react';
import { useRecentUpdates } from '../../hooks/useRecentUpdates';

function formatTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function UpdateCard({ update }) {
  const isAutomated = update.source_type === 'automated';
  const label = update.incident_name || update.source_name || 'Incident';

  // Parse multi-line content into individual change lines
  const lines = (update.content || '').split('\n').filter(Boolean);

  return (
    <div className="rounded-lg border border-sentinel-700 bg-sentinel-800/70 overflow-hidden">
      {/* Card header: source badge + timestamp */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-sentinel-700/60">
        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-900/70 text-red-300 border border-red-800/50 truncate max-w-[55%]">
          {label}
        </span>
        <span className="text-sentinel-400 text-[10px] shrink-0 ml-1">
          {formatTimestamp(update.created_at)}
        </span>
      </div>

      {/* Card body */}
      <div className="px-3 py-2">
        <p className="text-white text-xs font-semibold mb-1">
          {isAutomated ? 'Data Updated' : 'Reporter Update'}
        </p>
        <div className="space-y-0.5">
          {lines.map((line, i) => (
            <p key={i} className="text-sentinel-200 text-xs">{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function UpdatesFeed() {
  const { updates, loading } = useRecentUpdates();
  const [collapsed, setCollapsed] = useState(false);

  if (!loading && updates.length === 0) return null;

  return (
    <div className="border-b border-sentinel-700 shrink-0">
      {/* Section header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-sentinel-800/50 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <Rss size={12} className="text-fire-400" />
          <span className="text-sentinel-100 text-xs font-semibold uppercase tracking-wider">
            Updates
          </span>
          {updates.length > 0 && (
            <span className="px-1.5 py-0.5 bg-fire-600/25 text-fire-400 text-[10px] font-bold rounded-full border border-fire-700/40">
              {updates.length}
            </span>
          )}
        </div>
        {collapsed
          ? <ChevronDown size={13} className="text-sentinel-400" />
          : <ChevronUp   size={13} className="text-sentinel-400" />}
      </button>

      {!collapsed && (
        <div className="px-2 pb-2 space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
          {loading && (
            <p className="text-sentinel-400 text-xs text-center py-3">Loading updates…</p>
          )}
          {updates.map(u => (
            <UpdateCard key={u.id} update={u} />
          ))}
        </div>
      )}
    </div>
  );
}
