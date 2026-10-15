/**
 * FrameScrubber.jsx
 * Play/pause, a time slider and a Live button for a layer's recent frames,
 * shared by the MRMS radar controls and the satellite panel so every looping
 * layer on the live map is driven the same way. Optional ‹ › buttons step
 * one frame at a time.
 *
 * Accent classes are passed in whole (Tailwind only ships classes it sees
 * written out), e.g. sliderClass="accent-green-500" liveClass="bg-green-600".
 */

import { memo } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Radio } from 'lucide-react';
import { withClock } from '../../utils/formatUtils';
import { useTimeFormat } from '../../hooks/useTimeFormat';

function clock(iso) {
  return iso ? new Date(iso).toLocaleTimeString([], withClock({ hour: 'numeric', minute: '2-digit' })) : '—';
}

const STEP_CLASS = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sentinel-300 hover:bg-sentinel-700 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent';

const FrameScrubber = memo(function FrameScrubber({
  frames,
  index,
  frame,
  live,
  playing,
  onTogglePlaying,
  onSeek,
  onLive,
  onStep,
  playLabel,
  pauseLabel,
  sliderLabel,
  sliderClass,
  liveClass,
}) {
  useTimeFormat();
  if (!frames.length) return null;
  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onTogglePlaying}
          disabled={frames.length < 2}
          aria-label={playing ? pauseLabel : playLabel}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-sentinel-900 hover:bg-sentinel-100 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          {playing ? <Pause size={13} aria-hidden /> : <Play size={13} className="ml-0.5" aria-hidden />}
        </button>
        {onStep && (
          <button type="button" onClick={() => onStep(-1)} disabled={index <= 0} aria-label="Previous frame" className={STEP_CLASS}>
            <ChevronLeft size={14} aria-hidden />
          </button>
        )}
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          step={1}
          value={index}
          onChange={(e) => onSeek(frames[Number(e.target.value)].id)}
          aria-label={sliderLabel}
          aria-valuetext={clock(frame?.time)}
          className={`h-1.5 min-w-0 flex-1 cursor-pointer ${sliderClass}`}
        />
        {onStep && (
          <button type="button" onClick={() => onStep(1)} disabled={index >= frames.length - 1} aria-label="Next frame" className={STEP_CLASS}>
            <ChevronRight size={14} aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={onLive}
          aria-pressed={live}
          className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
            live ? `${liveClass} text-white` : 'text-sentinel-300 hover:bg-sentinel-700'}`}
        >
          <Radio size={10} aria-hidden />
          Live
        </button>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-sentinel-400 tabular-nums">
        <span>{clock(frames[0].time)}</span>
        <span className="text-sentinel-200">{clock(frame?.time)}</span>
        <span>{clock(frames[frames.length - 1].time)}</span>
      </div>
    </div>
  );
});

export default FrameScrubber;
