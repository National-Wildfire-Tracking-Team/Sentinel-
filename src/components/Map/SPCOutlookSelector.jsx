/**
 * SPCOutlookSelector.jsx
 * Polished map overlay for controlling SPC outlook display.
 *   - Hazard type tab bar (Categorical / Tornado / Hail / Wind / Severe)
 *   - Exclusive day pill selector (Day 1 / Day 2 / Day 3)
 *   - Loading spinner + valid-time label
 */

import { memo } from 'react';
import { OUTLOOK_TYPES, LAYER_ID_MAP } from '../../api/spcOutlooks';

// Icon paths (inline SVG) keyed by outlook type
const TYPE_ICONS = {
  categorical: (
    // Shield / risk levels icon
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5L2 4v4c0 3 2.5 5.5 6 6.5 3.5-1 6-3.5 6-6.5V4L8 1.5z" />
    </svg>
  ),
  tornado: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h12" /><path d="M3 6h9" /><path d="M5 9h5" /><path d="M7 12h2" /><path d="M8 14v1" />
    </svg>
  ),
  hail: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="7" cy="11" r="1" fill="currentColor" stroke="none" />
      <path d="M3 9a4 4 0 0 1 4-7 4 4 0 0 1 4 4 3 3 0 0 1-3 3H4a2 2 0 0 1-1-0" />
    </svg>
  ),
  wind: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5h7a2 2 0 0 0 0-4" /><path d="M2 9h10a2 2 0 0 1 0 4" /><path d="M2 12h7" />
    </svg>
  ),
  severe: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2l1.5 4H14l-3.7 2.7 1.4 4.3L8 10.4l-3.7 2.6 1.4-4.3L2 6h4.5L8 2z" />
    </svg>
  ),
};

// Accent colors per type for the active state
const TYPE_COLORS = {
  categorical: { bg: 'bg-sky-600',    ring: 'ring-sky-500/40',    text: 'text-sky-300'    },
  tornado:     { bg: 'bg-red-600',     ring: 'ring-red-500/40',     text: 'text-red-300'    },
  hail:        { bg: 'bg-blue-600',    ring: 'ring-blue-500/40',    text: 'text-blue-300'   },
  wind:        { bg: 'bg-amber-500',   ring: 'ring-amber-400/40',   text: 'text-amber-300'  },
  severe:      { bg: 'bg-purple-600',  ring: 'ring-purple-500/40',  text: 'text-purple-300' },
};

const TYPE_DESCRIPTIONS = {
  categorical: 'Categorical risk levels (TSTM → HIGH)',
  tornado:     'Tornado probability (%) for Day 1–2',
  hail:        'Significant hail probability (%) for Day 1–2',
  wind:        'Damaging wind probability (%) for Day 1–2',
  severe:      'Combined severe probability (%) for Day 3',
};

const DAYS = [
  { key: 'day1', label: 'Day 1', short: '1' },
  { key: 'day2', label: 'Day 2', short: '2' },
  { key: 'day3', label: 'Day 3', short: '3' },
];

function Spinner() {
  return (
    <svg
      className="animate-spin text-sky-400 shrink-0"
      width="12" height="12" viewBox="0 0 24 24" fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const SPCOutlookSelector = memo(function SPCOutlookSelector({
  outlookType,
  onOutlookTypeChange,
  activeDay,
  onActiveDayChange,
  loading = false,
  validTime = null,
}) {
  const currentTypeDef = OUTLOOK_TYPES.find(t => t.key === outlookType);
  const supportedDays  = currentTypeDef ? currentTypeDef.days : DAYS.map(d => d.key);
  const colors = TYPE_COLORS[outlookType] || TYPE_COLORS.categorical;

  function handleTypeChange(newType) {
    if (newType === outlookType) return;
    const typeDef = OUTLOOK_TYPES.find(t => t.key === newType);
    const supported = typeDef ? typeDef.days : ['day1', 'day2', 'day3'];
    // Keep same day if supported, else pick first available
    const nextDay = supported.includes(activeDay) ? activeDay : supported[0];
    onActiveDayChange(nextDay);
    onOutlookTypeChange(newType);
  }

  // Format NOAA valid time string (YYYYMMDDHHMM → "Apr 24 · 16:30 UTC")
  const validLabel = validTime
    ? (() => {
        const s = String(validTime);
        if (s.length !== 12) return null;
        const d = new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}Z`);
        if (isNaN(d)) return null;
        return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }) + ' UTC';
      })()
    : null;

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto animate-fade-in"
      style={{ maxWidth: 'calc(100vw - 1rem)' }}
    >
      <div className="bg-sentinel-900/96 backdrop-blur-md border border-sentinel-700/80 rounded-2xl shadow-2xl overflow-hidden">

        {/* ── Type tab bar ── */}
        <div className="flex items-stretch border-b border-sentinel-700/60">
          {OUTLOOK_TYPES.map(type => {
            const isActive = outlookType === type.key;
            const c = TYPE_COLORS[type.key];
            return (
              <button
                key={type.key}
                type="button"
                onClick={() => handleTypeChange(type.key)}
                title={TYPE_DESCRIPTIONS[type.key]}
                className={`
                  flex-1 flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] font-bold
                  uppercase tracking-wide transition-all relative
                  ${isActive
                    ? `${c.text} bg-sentinel-800/70`
                    : 'text-sentinel-400 hover:text-sentinel-100 hover:bg-sentinel-800/40'
                  }
                `}
                aria-pressed={isActive}
              >
                {/* Active underline indicator */}
                {isActive && (
                  <span className={`absolute bottom-0 left-2 right-2 h-0.5 rounded-full ${c.bg} opacity-90`} />
                )}
                <span className={isActive ? c.text : 'text-sentinel-500'}>{TYPE_ICONS[type.key]}</span>
                <span className="hidden sm:block leading-none">{type.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Day pills + status row ── */}
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Label */}
          <span className="text-[10px] font-semibold text-sentinel-400 uppercase tracking-widest shrink-0 hidden xs:block">
            Day
          </span>

          {/* Day buttons */}
          <div className="flex items-center gap-1">
            {DAYS.map(({ key, label }) => {
              const supported = supportedDays.includes(key);
              const isActive  = supported && key === activeDay;
              const c = colors;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!supported}
                  onClick={() => supported && onActiveDayChange(key)}
                  className={`
                    px-3 py-1 rounded-lg text-xs font-semibold transition-all
                    ${!supported
                      ? 'text-sentinel-700 cursor-not-allowed'
                      : isActive
                        ? `${c.bg} text-white shadow-sm ring-1 ${c.ring}`
                        : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700'
                    }
                  `}
                  aria-pressed={isActive}
                  title={!supported ? `Not available for this outlook type` : label}
                >
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{key.replace('day','D')}</span>
                </button>
              );
            })}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Loading / valid time */}
          {loading ? (
            <div className="flex items-center gap-1.5 text-[10px] text-sentinel-400">
              <Spinner />
              <span className="hidden sm:inline">Loading…</span>
            </div>
          ) : validLabel ? (
            <span className="text-[10px] text-sentinel-500 whitespace-nowrap hidden sm:block" title="SPC issue time (UTC)">
              {validLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
});
export default SPCOutlookSelector;
