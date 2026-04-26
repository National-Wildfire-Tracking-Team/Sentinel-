/**
 * SPCWeatherTabOutlookControls.jsx
 * Single map overlay for the weather tab: choose convective vs. fire-weather
 * SPC outlooks, then the same type/day UI as the standalone selectors.
 */

import { memo } from 'react';
import SPCOutlookSelector from './SPCOutlookSelector';
import FireWeatherOutlookSelector from './FireWeatherOutlookSelector';

const SPCWeatherTabOutlookControls = memo(function SPCWeatherTabOutlookControls({
  mode,
  onModeChange,
  // Convective
  spcOutlookType,
  onSpcOutlookTypeChange,
  spcActiveDay,
  onSpcActiveDayChange,
  spcLoading,
  spcValidTime,
  // Fire weather
  fireWxOutlookType,
  onFireWxOutlookTypeChange,
  fireWxActiveDay,
  onFireWxActiveDayChange,
  fireWxLoading,
  fireWxValidTime,
}) {
  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex flex-col items-stretch gap-1.5 animate-fade-in"
      style={{ maxWidth: 'calc(100vw - 1rem)' }}
    >
      <div className="flex items-center justify-center gap-1 px-1">
        <span className="text-[9px] font-bold text-sentinel-500 uppercase tracking-widest hidden sm:inline mr-0.5">
          Outlook
        </span>
        <button
          type="button"
          onClick={() => onModeChange('convective')}
          className={`
            px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wide transition-all
            ${mode === 'convective'
              ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-500/50 shadow-sm'
              : 'text-sentinel-400 hover:text-sentinel-100 bg-sentinel-800/50 hover:bg-sentinel-800'
            }`}
          aria-pressed={mode === 'convective'}
        >
          Convective
        </button>
        <button
          type="button"
          onClick={() => onModeChange('fireWx')}
          className={`
            px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wide transition-all
            ${mode === 'fireWx'
              ? 'bg-orange-500/25 text-orange-200 ring-1 ring-orange-500/50 shadow-sm'
              : 'text-sentinel-400 hover:text-sentinel-100 bg-sentinel-800/50 hover:bg-sentinel-800'
            }`}
          aria-pressed={mode === 'fireWx'}
        >
          Fire weather
        </button>
      </div>
      {mode === 'convective' ? (
        <SPCOutlookSelector
          inline
          outlookType={spcOutlookType}
          onOutlookTypeChange={onSpcOutlookTypeChange}
          activeDay={spcActiveDay}
          onActiveDayChange={onSpcActiveDayChange}
          loading={spcLoading}
          validTime={spcValidTime}
        />
      ) : (
        <FireWeatherOutlookSelector
          inline
          outlookType={fireWxOutlookType}
          onOutlookTypeChange={onFireWxOutlookTypeChange}
          activeDay={fireWxActiveDay}
          onActiveDayChange={onFireWxActiveDayChange}
          loading={fireWxLoading}
          validTime={fireWxValidTime}
        />
      )}
    </div>
  );
});

export default SPCWeatherTabOutlookControls;
