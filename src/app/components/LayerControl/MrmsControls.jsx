/**
 * MrmsControls.jsx
 * Inline controls under the MRMS row in the layer panel (the same pattern as
 * the WPC day selector): product, playback through the last hour, and opacity.
 */

import { memo } from 'react';
import { Pause, Play, Radio } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useMrmsContext } from '../../context/MrmsContext';

const ACCENT = '#22c55e';

function clock(iso) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
}

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

      {frames.length > 0 && (
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlaying}
              disabled={frames.length < 2}
              aria-label={playing ? 'Pause radar animation' : 'Play the last hour of radar'}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-sentinel-900 hover:bg-sentinel-100 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              {playing ? <Pause size={13} aria-hidden /> : <Play size={13} className="ml-0.5" aria-hidden />}
            </button>
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              step={1}
              value={index}
              onChange={(e) => setFrame(frames[Number(e.target.value)].id)}
              aria-label="Radar time"
              aria-valuetext={clock(frame?.time)}
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-green-500"
            />
            <button
              type="button"
              onClick={goLive}
              aria-pressed={live}
              className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                live ? 'bg-green-600 text-white' : 'text-sentinel-300 hover:bg-sentinel-700'}`}
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
      )}

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
