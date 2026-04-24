/**
 * SPCOutlookSelector.jsx
 * Compact map overlay for controlling SPC outlook display options:
 *   - Outlook type dropdown (Categorical / Tornado Prob. / Hail Prob. / Wind Prob.)
 *   - Day selector pills (Day 1 / Day 2 / Day 3)
 *
 * Only rendered when the SPC Outlooks layer is active on the weather tab.
 */

import { memo } from 'react';
import { OUTLOOK_TYPES } from '../../api/spcOutlooks';

const DAYS = [
  { key: 'day1', label: 'Day 1' },
  { key: 'day2', label: 'Day 2' },
  { key: 'day3', label: 'Day 3' },
];

const SPCOutlookSelector = memo(function SPCOutlookSelector({
  outlookType,
  onOutlookTypeChange,
  activeDays,
  onActiveDaysChange,
}) {
  // Which types are available depends on nothing – show all; days auto-filter
  const availableTypes = OUTLOOK_TYPES;

  function toggleDay(dayKey) {
    if (activeDays.includes(dayKey)) {
      // Must keep at least one day selected
      if (activeDays.length === 1) return;
      onActiveDaysChange(activeDays.filter(d => d !== dayKey));
    } else {
      onActiveDaysChange([...activeDays, dayKey].sort());
    }
  }

  // When the type changes, reset to only the days that support it
  function handleTypeChange(e) {
    const newType = e.target.value;
    const typeDef = OUTLOOK_TYPES.find(t => t.key === newType);
    const supportedDays = typeDef ? typeDef.days : ['day1', 'day2', 'day3'];
    // Keep the intersection of currently-selected days and supported days,
    // defaulting to all supported if nothing overlaps
    const kept = activeDays.filter(d => supportedDays.includes(d));
    onActiveDaysChange(kept.length > 0 ? kept : supportedDays.slice(0, 1));
    onOutlookTypeChange(newType);
  }

  // Days available for the current type
  const currentTypeDef = OUTLOOK_TYPES.find(t => t.key === outlookType);
  const supportedDays = currentTypeDef ? currentTypeDef.days : DAYS.map(d => d.key);

  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2
                 bg-sentinel-900/95 backdrop-blur-sm border border-sentinel-700
                 rounded-xl shadow-2xl px-3 py-2 pointer-events-auto animate-fade-in"
      style={{ maxWidth: 'calc(100vw - 2rem)' }}
    >
      {/* Type dropdown */}
      <div className="relative flex items-center">
        <select
          value={outlookType}
          onChange={handleTypeChange}
          className="appearance-none bg-sentinel-800 border border-sentinel-600 text-white
                     text-xs font-medium rounded-lg pl-2.5 pr-7 py-1.5
                     focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer
                     hover:bg-sentinel-700 transition-colors"
          aria-label="Outlook type"
        >
          {availableTypes.map(t => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        {/* Custom chevron */}
        <svg
          className="pointer-events-none absolute right-2 text-sentinel-300"
          width="10" height="10" viewBox="0 0 10 10" fill="none"
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-sentinel-700 shrink-0" />

      {/* Day pills */}
      <div className="flex items-center gap-1">
        {DAYS.map(({ key, label }) => {
          const supported = supportedDays.includes(key);
          const active = supported && activeDays.includes(key);
          return (
            <button
              key={key}
              type="button"
              disabled={!supported}
              onClick={() => supported && toggleDay(key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all
                ${!supported
                  ? 'text-sentinel-600 cursor-not-allowed'
                  : active
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-sentinel-200 hover:bg-sentinel-700 hover:text-white'
                }`}
              aria-pressed={active}
              title={!supported ? `${label} not available for this outlook type` : label}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
});
export default SPCOutlookSelector;
