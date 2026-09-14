/**
 * RadarTimeline.jsx
 * Compact radar history/playback control bar. Purely presentational — it
 * has no idea whether it's driving MRMS or NEXRAD, no Supabase access, and
 * no decoding/rasterization logic. All data and behavior are supplied by the
 * caller (see useRadarHistory.js), exactly the props listed below, so this
 * component stays reusable across radar layers even though only Composite
 * Radar wires it up today.
 *
 * Styling reuses Sentinel's existing floating-card conventions (also used by
 * RadarSitePanel.jsx, docked above the same bottom bar): cyan for live/active
 * accents, amber for the historical/stale state — paired with literal text
 * ("LIVE"/"HISTORICAL"), never color alone.
 */

import { memo, forwardRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Play, Pause, Radio } from 'lucide-react';

function formatDateTime(sourceTime) {
  if (!sourceTime) return '—';
  const d = new Date(sourceTime);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} ${time}`;
}

const RadarTimeline = memo(forwardRef(function RadarTimeline({
  frames = [],
  selectedTimestamp,
  isPlaying,
  error,
  onSelectFrame,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  bottomBarWidth,
  bottomBarHeight,
  topAttached = false,
}, ref) {
  const selectedIndex = useMemo(() => {
    const idx = frames.findIndex((f) => f.sourceTime === selectedTimestamp);
    return idx === -1 ? Math.max(0, frames.length - 1) : idx;
  }, [frames, selectedTimestamp]);

  if (frames.length === 0) return null;

  // Not enough history yet for a scrubber (right after Composite Radar is
  // first enabled / shortly after Phase 3 deploys) — a minimal live pill
  // instead of a broken-looking single-tick scrubber.
  if (frames.length < 2) {
    return (
      <div
        className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2
                      bg-white/90 dark:bg-black/90 backdrop-blur-sm border border-sentinel-200 dark:border-zinc-700
                      rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/60 px-3 py-1.5"
      >
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-500">
          <Radio size={11} />
          Live
        </span>
        <span className="text-[10px] text-sentinel-500 dark:text-zinc-400">
          Building Composite Radar history…
        </span>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Composite Radar timeline"
      className={`absolute bottom-20 left-1/2 -translate-x-1/2 z-20 w-[min(34rem,calc(100vw-2rem))]
                    bg-white/90 dark:bg-black/90 backdrop-blur-sm border border-sentinel-200 dark:border-zinc-700
                    shadow-2xl shadow-black/10 dark:shadow-black/60 px-2.5 py-1.5 ${
                      // Squared off and borderless on top when the NEXRAD site popup is
                      // docked directly above — otherwise this is the topmost element in
                      // the stack, so it keeps the rounded "growing out of the bar" cap.
                      topAttached ? 'rounded-none border-t-0' : 'rounded-t-2xl'
                    }`}
      style={{
        width: bottomBarWidth ? `${bottomBarWidth}px` : undefined,
        bottom: bottomBarHeight ? `${bottomBarHeight + 16}px` : undefined,
      }}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onPrevious}
          disabled={selectedIndex <= 0}
          aria-label="Previous radar frame"
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-sentinel-600 dark:text-zinc-300
                        hover:bg-sentinel-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} />
        </button>

        <button
          type="button"
          onClick={isPlaying ? onPause : onPlay}
          aria-label={isPlaying ? 'Pause radar animation' : 'Play radar animation'}
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-sentinel-100 dark:bg-zinc-800
                        text-sentinel-700 dark:text-zinc-200 hover:bg-sentinel-200 dark:hover:bg-zinc-700"
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={selectedIndex >= frames.length - 1}
          aria-label="Next radar frame"
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-sentinel-600 dark:text-zinc-300
                        hover:bg-sentinel-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={16} />
        </button>

        <div className="flex-1 min-w-0 px-1">
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            step={1}
            value={selectedIndex}
            onChange={(e) => onSelectFrame?.(frames[Number(e.target.value)]?.sourceTime)}
            className="w-full accent-cyan-500 touch-manipulation"
            aria-label="Composite Radar timeline — select historical frame"
          />
          <div className="text-center text-[10px] font-mono text-sentinel-500 dark:text-zinc-400 -mt-1">
            {formatDateTime(selectedTimestamp)}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-1 text-[10px] text-red-400 bg-red-900/20 border border-red-800 rounded px-1.5 py-1">
          {error}
        </div>
      )}
    </div>
  );
}));

export default RadarTimeline;
