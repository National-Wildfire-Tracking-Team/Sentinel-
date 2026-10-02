/**
 * ModelFieldTimeline.jsx
 * Steps the Models map through forecast valid times, and plays them as an
 * animation. Every step swaps the field frame (and wind) on the map; the
 * next frames are pre-fetched by the map layer, so playback doesn't stall.
 *
 * Docked flush above MapBottomBar and matched to its width, the same way
 * the SPC outlook selector docks on the Weather tab, so the scrubber and
 * the bar's layer pop-up read as one control area. The model and variable
 * are chosen in that pop-up, from the bar's Variables button.
 */

import { forwardRef, useEffect } from 'react';
import { Pause, Play } from 'lucide-react';
import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import { hourAt } from '../../api/modelFields';
import { localTime, nowIndex, zulu } from './modelTheme';

const JUMPS = [1, 3, 6, 12, 24, 48, 72, 120, 168, 240, 384];
const FRAME_MS = 650;

const ModelFieldTimeline = forwardRef(function ModelFieldTimeline({ bottomBarWidth, bottomBarHeight }, ref) {
  const wm = useWeatherModelsContext();
  const { timeline = [], validTime, setValidTime, playing, setPlaying, manifest, mode } = wm ?? {};

  useEffect(() => {
    if (!playing || timeline.length < 2) return undefined;
    const id = setInterval(() => {
      const i = timeline.indexOf(validTime);
      setValidTime(timeline[(i + 1) % timeline.length]);
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [playing, timeline, validTime, setValidTime]);

  if (!wm) return null;

  // Same frame as SPCOutlookSelector: flush on the bar's top edge, the bar's width.
  const frame = (children) => (
    <div
      ref={ref}
      role="group"
      aria-label="Model forecast time"
      className="dark absolute bottom-20 left-1/2 -translate-x-1/2 z-20 w-[min(34rem,calc(100vw-2rem))]
                 bg-sentinel-900 border border-sentinel-600 rounded-t-2xl shadow-2xl shadow-black/60 ring-1 ring-white/10
                 overflow-hidden text-white"
      style={{
        width: bottomBarWidth ? `${bottomBarWidth}px` : undefined,
        bottom: bottomBarHeight ? `${bottomBarHeight + 16}px` : undefined,
        maxWidth: 'calc(100vw - 1rem)',
      }}
    >
      {children}
    </div>
  );

  if (!timeline.length || !validTime) {
    return frame(
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={`min-w-0 flex-1 text-xs ${wm.manifestError ? 'text-red-300' : 'text-sentinel-300'}`}>
          {wm.manifestError ? `Model fields unavailable: ${wm.manifestError.message}` : 'Loading model runs…'}
        </span>
      </div>
    );
  }

  const index = timeline.indexOf(validTime);
  const entries = timeline.map((t) => ({ validTime: t }));
  const now = nowIndex(entries);
  const nowMs = Date.parse(timeline[now]);
  const jumps = [{ label: 'Now', i: now }, ...JUMPS
    .map((h) => ({ label: `+${h}h`, i: timeline.findIndex((t) => Date.parse(t) === nowMs + h * 3_600_000) }))
    .filter((j) => j.i !== -1)];
  const hourModels = mode === 'compare' ? ['hrrr', 'gfs'] : [mode];
  const max = timeline.length - 1;

  return frame(
    <>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-3 pt-2">
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? 'Pause forecast animation' : 'Play forecast animation'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sentinel-900 hover:bg-sentinel-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          {playing ? <Pause size={15} aria-hidden /> : <Play size={15} className="ml-0.5" aria-hidden />}
        </button>
        <div className="min-w-[8rem] flex-1 leading-tight">
          <div className="truncate text-sm font-semibold">{localTime(validTime, { month: 'short', day: 'numeric', minute: '2-digit' })}</div>
          <div className="truncate text-[10px] text-sentinel-300 tabular-nums">
            valid {zulu(validTime)} · {hourModels.map((m) => `${mode === 'compare' ? `${m.toUpperCase()} ` : ''}+${hourAt(manifest, m, validTime)} h`).join(' · ')}
          </div>
        </div>
      </div>
      <div className="px-3 pt-2">
        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-l bg-sentinel-500/60"
            style={{ width: `${(now / Math.max(1, max)) * 100}%` }} />
          <input
            type="range" min={0} max={max} step={1} value={index}
            onChange={(e) => { setPlaying(false); setValidTime(timeline[Number(e.target.value)]); }}
            aria-label="Forecast valid time"
            aria-valuetext={`${localTime(validTime)}, ${zulu(validTime)}`}
            className="relative h-1.5 w-full cursor-pointer accent-sky-400"
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[10px] text-sentinel-400 tabular-nums">
          <span>{localTime(timeline[0])}</span>
          <span>{localTime(timeline[max])}</span>
        </div>
      </div>
      <div className="mt-1.5 flex gap-1 overflow-x-auto border-t border-sentinel-700 px-2 py-1.5" role="group" aria-label="Jump to forecast time">
        {jumps.map((j) => (
          <button key={j.label} type="button" onClick={() => { setPlaying(false); setValidTime(timeline[j.i]); }}
            aria-pressed={j.i === index}
            className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${
              j.i === index ? 'bg-white text-sentinel-900' : 'text-sentinel-200 hover:bg-sentinel-700'}`}>
            {j.label}
          </button>
        ))}
      </div>
    </>
  );
});

export default ModelFieldTimeline;
