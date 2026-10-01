/**
 * ModelFieldTimeline.jsx
 * Steps the Models map through forecast valid times, and plays them as an
 * animation. Every step swaps the field frame (and wind) on the map; the
 * next frames are pre-fetched by the map layer, so playback doesn't stall.
 * Shown above the live map's bottom bar.
 */

import { useEffect } from 'react';
import { Pause, Play } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import { hourAt } from '../../api/modelFields';
import { localTime, nowIndex, zulu } from './modelTheme';

const JUMPS = [1, 3, 6, 12, 24, 48, 72, 120, 168, 240, 384];
const FRAME_MS = 650;

export default function ModelFieldTimeline({ bottomOffset = 80 }) {
  const wm = useWeatherModelsContext();
  const { sidebarOpen } = useApp();
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
  // Phones: leave the right edge for the map's zoom/compass buttons. Wider: centred on the visible map.
  const position = `absolute z-20 left-3 right-[3.75rem] sm:right-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[min(46rem,calc(100vw-10rem))] ${
    sidebarOpen ? 'sm:left-[calc(50%+10rem)] sm:w-[min(46rem,calc(100vw-22rem))]' : ''}`;

  if (!timeline.length || !validTime) {
    return (
      <div className={position} style={{ bottom: bottomOffset }}>
        <div className="rounded-xl border border-dashed border-sentinel-600 bg-sentinel-900/95 px-3 py-2 text-sm text-sentinel-200">
          {wm.manifestError ? `Model fields unavailable: ${wm.manifestError.message}` : 'Loading model runs…'}
        </div>
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

  return (
    <div className={position} style={{ bottom: bottomOffset }}>
      <div className="dark rounded-xl border border-sentinel-600 bg-sentinel-900/95 backdrop-blur-md shadow-2xl px-3 py-2 text-white">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? 'Pause forecast animation' : 'Play forecast animation'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sentinel-900 hover:bg-sentinel-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            {playing ? <Pause size={15} aria-hidden /> : <Play size={15} className="ml-0.5" aria-hidden />}
          </button>
          <div className="min-w-0 text-sm">
            <span className="font-semibold">{localTime(validTime, { month: 'short', day: 'numeric', minute: '2-digit' })}</span>
            <span className="ml-2 text-xs text-sentinel-300 tabular-nums">
              valid {zulu(validTime)} · {hourModels.map((m) => `${mode === 'compare' ? `${m.toUpperCase()} ` : ''}+${hourAt(manifest, m, validTime)} h`).join(' · ')}
            </span>
          </div>
          <div className="ml-auto flex flex-wrap gap-1" role="group" aria-label="Jump to forecast time">
            {jumps.map((j) => (
              <button key={j.label} type="button" onClick={() => { setPlaying(false); setValidTime(timeline[j.i]); }}
                aria-pressed={j.i === index}
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  j.i === index ? 'bg-white text-sentinel-900' : 'text-sentinel-200 hover:bg-sentinel-700'}`}>
                {j.label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative mt-1.5">
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
    </div>
  );
}
