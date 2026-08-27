/**
 * ProximityAlertStack.jsx
 * Dismissible toast stack for new weather alerts or fire incidents that
 * have appeared near one of the user's saved zip codes.
 */

import { AlertTriangle, Flame, X } from 'lucide-react';

export default function ProximityAlertStack({ events, onDismiss }) {
  if (!events?.length) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none">
      {events.map((evt) => {
        const Icon = evt.kind === 'incident' ? Flame : AlertTriangle;
        return (
          <div
            key={evt.key}
            className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-sentinel-600
                       bg-sentinel-900/95 backdrop-blur-sm shadow-2xl px-3.5 py-3 animate-fade-in"
          >
            <Icon
              size={16}
              className={`shrink-0 mt-0.5 ${evt.kind === 'incident' ? 'text-fire-400' : 'text-amber-400'}`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{evt.locationName}</p>
              <p className="text-xs text-sentinel-300 mt-0.5 leading-snug">{evt.title}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(evt.key)}
              className="p-1 rounded text-sentinel-400 hover:text-white hover:bg-sentinel-700 transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
