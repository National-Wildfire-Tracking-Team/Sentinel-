/**
 * FireWeatherOutlookSelector.jsx
 * Map overlay for controlling the SPC Fire Weather Outlook display.
 *   - Outlook type tabs (Wind & RH / Dry Lightning)
 *   - Day pill selector (Day 1 – Day 8)
 *
 * Docked flush above MapBottomBar and matched to its width — mirrors
 * SPCOutlookSelector.jsx / RadarTimeline.jsx / RadarSitePanel.jsx so every
 * bottom-bar control grows out of the same bar instead of floating
 * independently.
 */

import { memo, forwardRef } from 'react';
import { FIRE_WX_OUTLOOK_TYPES, FIRE_WX_DAYS, FIRE_WX_LAYER_ID_MAP } from '../../api/spcFireWeatherOutlooks';

const TYPE_ICONS = {
  winds_low_humidity: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5h7a2 2 0 0 0 0-4" /><path d="M2 9h10a2 2 0 0 1 0 4" /><path d="M2 12h7" />
    </svg>
  ),
  dry_thunderstorm: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2L4 9h5l-2 5 7-8H9l2-4z" />
    </svg>
  ),
};

const TYPE_COLORS = {
  winds_low_humidity: { bg: 'bg-orange-600',  ring: 'ring-orange-500/40',  text: 'text-orange-300'  },
  dry_thunderstorm:   { bg: 'bg-sky-600',     ring: 'ring-sky-500/40',     text: 'text-sky-300'     },
};

const TYPE_DESCRIPTIONS = {
  winds_low_humidity: 'Elevated/Critical/Extreme risk from wind and low relative humidity',
  dry_thunderstorm:   'Isolated/Scattered dry thunderstorm risk (lightning with little rain)',
};

const FireWeatherOutlookSelector = memo(forwardRef(function FireWeatherOutlookSelector({
  outlookType,
  onOutlookTypeChange,
  activeDay,
  onActiveDayChange,
  bottomBarWidth,
  bottomBarHeight,
}, ref) {
  const colors = TYPE_COLORS[outlookType] || TYPE_COLORS.winds_low_humidity;

  function handleTypeChange(newType) {
    if (newType === outlookType) return;
    onOutlookTypeChange(newType);
  }

  function handleDayChange(dayKey) {
    if (!FIRE_WX_LAYER_ID_MAP[dayKey]?.[outlookType]) return;
    onActiveDayChange(dayKey);
  }

  function DayButton({ dayKey, label }) {
    const supported = Boolean(FIRE_WX_LAYER_ID_MAP[dayKey]?.[outlookType]);
    const isActive  = supported && dayKey === activeDay;
    return (
      <button
        type="button"
        disabled={!supported}
        onClick={() => handleDayChange(dayKey)}
        className={`
          px-2 py-1 rounded-lg text-xs font-semibold transition-all
          ${!supported
            ? 'text-sentinel-600 cursor-not-allowed'
            : isActive
              ? `${colors.bg} text-white shadow-sm ring-1 ${colors.ring}`
              : 'text-sentinel-100 hover:text-white hover:bg-sentinel-700'
          }
        `}
        aria-pressed={isActive}
        title={!supported ? 'Not available for this outlook type' : label}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      ref={ref}
      role="group"
      aria-label="SPC Fire Weather Outlook selector"
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 w-[min(34rem,calc(100vw-2rem))]
                    bg-sentinel-900 border border-sentinel-600 rounded-t-2xl shadow-2xl shadow-black/60 ring-1 ring-white/10
                    overflow-hidden"
      style={{
        width: bottomBarWidth ? `${bottomBarWidth}px` : undefined,
        bottom: bottomBarHeight ? `${bottomBarHeight + 16}px` : undefined,
        maxWidth: 'calc(100vw - 1rem)',
      }}
    >
      {/* Capped so a short viewport never pushes this above the header —
          content scrolls internally instead of growing the popup taller. */}
      <div className="max-h-[45vh] overflow-y-auto">
        {/* ── Type tab bar ── */}
        <div className="flex items-stretch border-b border-sentinel-700">
          {FIRE_WX_OUTLOOK_TYPES.map(type => {
            const isActive = outlookType === type.key;
            const c = TYPE_COLORS[type.key];
            return (
              <button
                key={type.key}
                type="button"
                onClick={() => handleTypeChange(type.key)}
                title={TYPE_DESCRIPTIONS[type.key]}
                className={`
                  flex-1 flex flex-col items-center gap-0.5 px-4 py-2 text-[10px] font-bold
                  uppercase tracking-wide transition-all relative
                  ${isActive
                    ? `${c.text} bg-sentinel-800/90`
                    : 'text-sentinel-300 hover:text-sentinel-100 hover:bg-sentinel-800/70'
                  }
                `}
                aria-pressed={isActive}
              >
                {isActive && (
                  <span className={`absolute bottom-0 left-2 right-2 h-0.5 rounded-full ${c.bg} opacity-90`} />
                )}
                <span className={isActive ? c.text : 'text-sentinel-400'}>{TYPE_ICONS[type.key]}</span>
                <span className="leading-none">{type.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Day pills ── */}
        <div className="flex items-center gap-1 px-3 pt-2 pb-2">
          <span className="text-[10px] font-semibold text-sentinel-400 uppercase tracking-widest shrink-0 w-8">Day</span>
          <div className="flex items-center gap-1 flex-wrap">
            {FIRE_WX_DAYS.map(({ key, label }) => (
              <DayButton key={key} dayKey={key} label={label.replace('Day ', '')} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}));

export default FireWeatherOutlookSelector;
