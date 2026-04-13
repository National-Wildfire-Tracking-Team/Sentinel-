/**
 * IncidentFeed.jsx
 * Scrollable list of active wildfire incidents.
 */

import { useState } from 'react';
import { Search, SortDesc, Loader2, AlertCircle } from 'lucide-react';
import IncidentCard from './IncidentCard';
import { useApp } from '../../context/AppContext';

const SORT_OPTIONS = [
  { value: 'acres',    label: 'Size' },
  { value: 'updated',  label: 'Recent' },
  { value: 'contained', label: 'Containment' },
];

export default function IncidentFeed({ incidents, loading, error }) {
  const { selectedFire, feedFilter, setFeedFilter } = useApp();
  const [search, setSearch] = useState('');
  const [sort,   setSort]   = useState('acres');

  const cutoffMs = Date.now() - (72 * 60 * 60 * 1000); // 72 hours

  // Filter by search term
  const filtered = incidents.filter(inc => {
    const matchesSearch =
      inc.name.toLowerCase().includes(search.toLowerCase()) ||
      inc.state.toLowerCase().includes(search.toLowerCase()) ||
      inc.county.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (feedFilter === 'all') return true;

    const lastUpdatedMs = inc.updated ? new Date(inc.updated).getTime() : 0;
    const startedMs = inc.started ? new Date(inc.started).getTime() : 0;
    const mostRecentMs = Math.max(lastUpdatedMs, startedMs);
    const isOld = mostRecentMs > 0 && mostRecentMs < cutoffMs;
    const mostlyContained = (inc.contained ?? 0) >= 95;

    return !isOld && !mostlyContained;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'acres')     return b.acres - a.acres;
    if (sort === 'contained') return a.contained - b.contained;
    if (sort === 'updated')   return new Date(b.updated) - new Date(a.updated);
    return 0;
  });

  // Active vs controlled
  const active     = sorted.filter(i => i.status !== 'controlled');
  const controlled = sorted.filter(i => i.status === 'controlled');

  return (
    <div className="flex flex-col h-full">
      {/* Search + sort bar */}
      <div className="p-3 border-b border-sentinel-700 space-y-2 shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sentinel-200" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search fires…"
            className="w-full pl-8 pr-3 py-1.5 bg-sentinel-700 border border-sentinel-600
                       rounded-md text-sm text-white placeholder-sentinel-300
                       focus:outline-none focus:border-fire-600 focus:ring-1 focus:ring-fire-600/30
                       transition-colors"
          />
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-1">
          <SortDesc size={12} className="text-sentinel-200 shrink-0" />
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors
                ${sort === opt.value
                  ? 'bg-fire-600/25 text-fire-400 border border-fire-700/50'
                  : 'text-sentinel-200 hover:text-white'}`}
            >
              {opt.label}
            </button>
          ))}
          <span className="ml-auto text-sentinel-300 text-xs">{filtered.length} fires</span>
        </div>

        {/* Sidebar incident filter */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFeedFilter('all')}
            className={`flex-1 px-2 py-1 rounded text-xs font-medium border transition-colors
              ${feedFilter === 'all'
                ? 'bg-fire-600/25 text-fire-400 border-fire-700/50'
                : 'bg-sentinel-800 text-sentinel-100 border-sentinel-600 hover:text-white'}`}
          >
            All Fires
          </button>
          <button
            onClick={() => setFeedFilter('focused')}
            className={`flex-1 px-2 py-1 rounded text-xs font-medium border transition-colors
              ${feedFilter === 'focused'
                ? 'bg-fire-600/25 text-fire-400 border-fire-700/50'
                : 'bg-sentinel-800 text-sentinel-100 border-sentinel-600 hover:text-white'}`}
          >
            Hide Contained/Old Fires
          </button>
        </div>
      </div>

      {/* Feed body */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sentinel-200">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading incidents…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-red-300 text-sm">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>Could not load live data. Showing demo incidents.</span>
          </div>
        )}

        {!loading && active.length === 0 && (
          <div className="text-center py-8 text-sentinel-200 text-sm">
            No active incidents found
          </div>
        )}

        {/* Active fires */}
        {active.map(inc => (
          <IncidentCard
            key={inc.id}
            incident={inc}
            isSelected={selectedFire?.id === inc.id}
          />
        ))}

        {/* Separator */}
        {controlled.length > 0 && (
          <div className="py-2 px-1">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-sentinel-700" />
              <span className="text-sentinel-300 text-xs">Controlled</span>
              <div className="flex-1 h-px bg-sentinel-700" />
            </div>
          </div>
        )}

        {/* Controlled fires */}
        {controlled.map(inc => (
          <IncidentCard
            key={inc.id}
            incident={inc}
            isSelected={selectedFire?.id === inc.id}
          />
        ))}
      </div>
    </div>
  );
}
