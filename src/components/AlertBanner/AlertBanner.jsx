/**
 * AlertBanner.jsx
 * Scrolling banner that shows active Red Flag Warnings.
 * Auto-hides when there are no active alerts.
 */

import { useState } from 'react';
import { AlertTriangle, X, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { alertTypeToColor } from '../../utils/colorUtils';

export default function AlertBanner({ dismissed, onDismiss }) {
  const { alerts, selectFire } = useApp();
  const [activeIndex, setActiveIndex] = useState(0);

  // Only show Red Flag Warnings in the banner
  const rfwAlerts = alerts.filter(a => a.type === 'Red Flag Warning');

  if (dismissed || rfwAlerts.length === 0) return null;

  const current = rfwAlerts[activeIndex] || rfwAlerts[0];

  const next = () => setActiveIndex(i => (i + 1) % rfwAlerts.length);

  return (
    <div className="relative z-30 flex items-center gap-2 px-3 py-2
                    bg-red-950/90 backdrop-blur-sm border-b border-red-800/60
                    text-red-200 text-sm shrink-0 min-h-[40px]">
      {/* Icon */}
      <AlertTriangle size={15} className="text-red-400 shrink-0 animate-pulse" />

      {/* Alert type badge */}
      <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-red-400 hidden sm:inline">
        Red Flag Warning
      </span>

      {/* Divider */}
      <span className="hidden sm:inline text-red-700">·</span>

      {/* Alert text – tappable to open detail panel */}
      <button
        onClick={() => selectFire({ ...current, type: 'weather-alert', eventType: current.type })}
        className="flex-1 truncate text-xs font-medium text-red-200 text-left hover:text-white transition-colors cursor-pointer"
      >
        {current.headline}
      </button>

      {/* Pagination if multiple alerts */}
      {rfwAlerts.length > 1 && (
        <button
          onClick={next}
          className="shrink-0 flex items-center gap-1 text-xs text-red-400 hover:text-red-200 transition-colors"
        >
          <span>{activeIndex + 1}/{rfwAlerts.length}</span>
          <ChevronRight size={13} />
        </button>
      )}

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="shrink-0 p-0.5 text-red-500 hover:text-red-200 transition-colors"
        aria-label="Dismiss alert banner"
      >
        <X size={14} />
      </button>
    </div>
  );
}
