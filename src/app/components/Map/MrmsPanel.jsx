/**
 * MrmsPanel.jsx
 * MRMS radar controls, shown in the bottom bar's pull-up sheet (DockSheet,
 * via MapDockSheet) under the "MRMS Radar" tab while the MRMS layer is on:
 * status and credit first, then product, playback through the last hour,
 * and opacity. (The status used to be a chip at the top of the map.)
 */

import { memo } from 'react';
import { useMrmsContext } from '../../context/MrmsContext';
import FrameScrubber from '../LayerControl/FrameScrubber';
import MrmsStatus from '../MapControls/MrmsStatus';

const ACCENT = '#22c55e';
const LABEL_CLS = 'text-[10px] font-semibold uppercase tracking-wider text-sentinel-400';

const MrmsPanel = memo(function MrmsPanel() {
  const mrms = useMrmsContext();
  if (!mrms?.active) return null;
  const {
    configured, manifest, product, setProduct, frames, frame, index, live,
    setFrame, goLive, playing, togglePlaying, opacity, setOpacity,
  } = mrms;
  const products = manifest ? Object.entries(manifest.products) : [];

  return (
    <div className="px-3 py-2.5 space-y-2.5">
      <MrmsStatus />
      {!configured ? (
        <div className="text-[11px] text-sentinel-300">MRMS radar isn't connected on this site yet. Check back soon.</div>
      ) : (
        <>
          <div className="space-y-1.5">
            <span className={LABEL_CLS}>Product</span>
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

          <div className="space-y-1.5">
            <span className={LABEL_CLS}>Last hour</span>
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
          </div>

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
        </>
      )}
    </div>
  );
});

export default MrmsPanel;
