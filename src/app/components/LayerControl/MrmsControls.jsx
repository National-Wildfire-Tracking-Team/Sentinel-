/**
 * MrmsControls.jsx
 * Inline controls under the MRMS row in the layer panel (the same pattern as
 * the WPC day selector): product, playback through the last hour, and opacity.
 */

import { memo } from 'react';
import { useApp } from '../../context/AppContext';
import { useMrmsContext } from '../../context/MrmsContext';
import FrameScrubber from './FrameScrubber';

const ACCENT = '#22c55e';

const MrmsControls = memo(function MrmsControls() {
  const { layers } = useApp();
  const mrms = useMrmsContext();
  if (!layers.mrms || !mrms) return null;
  const { manifest, product, setProduct, frames, frame, index, live, setFrame, goLive, playing, togglePlaying, opacity, setOpacity } = mrms;
  const products = manifest ? Object.entries(manifest.products) : [];

  return (
    <div className="px-2.5 py-2.5 bg-sentinel-800/70 border-t border-sentinel-700 space-y-2.5">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-sentinel-300 mb-1.5">Product</div>
        {products.length ? (
          <div className="grid grid-cols-2 gap-1" role="group" aria-label="MRMS product">
            {products.map(([id, p]) => {
              const active = id === product;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  title={p.description}
                  onClick={() => setProduct(id)}
                  className={`min-h-8 rounded-md px-1.5 py-1 text-[10px] font-semibold leading-tight transition-all border ${
                    active
                      ? 'text-white shadow-lg border-transparent'
                      : 'bg-sentinel-900 text-sentinel-300 border-sentinel-600 hover:bg-sentinel-700 hover:text-white hover:border-sentinel-500'}`}
                  style={active ? { backgroundColor: ACCENT } : undefined}
                >
                  {p.label}
                  {p.status !== 'ok' && <span className="block text-[9px] font-normal opacity-80">{p.status === 'stale' ? 'delayed' : 'unavailable'}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-[10px] text-sentinel-400">Loading products…</div>
        )}
      </div>

      <FrameScrubber
        frames={frames}
        index={index}
        frame={frame}
        live={live}
        playing={playing}
        onTogglePlaying={togglePlaying}
        onSeek={setFrame}
        onLive={goLive}
        playLabel="Play the last hour of radar"
        pauseLabel="Pause radar animation"
        sliderLabel="Radar time"
        sliderClass="accent-green-500"
        liveClass="bg-green-600"
      />

      <label className="flex items-center gap-2 text-[10px] text-sentinel-300">
        <span className="font-semibold uppercase tracking-wider">Opacity</span>
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-green-500"
        />
        <span className="w-8 text-right tabular-nums">{Math.round(opacity * 100)}%</span>
      </label>
    </div>
  );
});

export default MrmsControls;
