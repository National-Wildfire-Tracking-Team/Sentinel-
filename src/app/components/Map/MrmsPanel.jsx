/**
 * MrmsPanel.jsx
 * MRMS radar controls that pop up from the bottom bar while the MRMS layer is
 * on, the same way the satellite controls do: product, playback through the
 * last hour, and opacity.
 *
 * Docked flush above MapBottomBar and matched to its width. The page decides
 * when it shows (it shares the dock with other layers' controls); "Hide
 * controls" hides the controls, not the radar, and MrmsShowControlsPill brings
 * them back.
 */

import { memo, forwardRef } from 'react';
import { EyeOff, Loader2, Radar, SlidersHorizontal } from 'lucide-react';
import { useMrmsContext } from '../../context/MrmsContext';
import FrameScrubber from '../LayerControl/FrameScrubber';

const ACCENT = '#22c55e';
const LABEL_CLS = 'text-[10px] font-semibold uppercase tracking-wider text-sentinel-400';

/** Rival layers with their own docked or floating controls (see satellitePanelOpenAfter). */
export const MRMS_DOCK_RIVALS = ['spcWeatherOutlooks', 'fireWeatherOutlooks', 'ndgdSmokeForecast', 'satellite'];

/** Whether the MRMS controls should be open after the layer toggles change from `prev` to `next`. */
export function mrmsPanelOpenAfter(prev, next, open) {
  const switchedOn = (key) => Boolean(next[key]) && !prev[key];
  if (!next.mrms) return false;
  if (switchedOn('mrms')) return true;
  if (MRMS_DOCK_RIVALS.some(switchedOn)) return false;
  return open;
}

const MrmsPanel = memo(forwardRef(function MrmsPanel({ open, onClose, bottomBarWidth, bottomBarHeight }, ref) {
  const mrms = useMrmsContext();
  if (!open || !mrms?.active) return null;
  const {
    configured, manifest, loading, product, setProduct, frames, frame, index, live,
    setFrame, goLive, playing, togglePlaying, opacity, setOpacity,
  } = mrms;
  const products = manifest ? Object.entries(manifest.products) : [];

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Radar controls"
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20
                 bg-sentinel-900 border border-sentinel-600 rounded-t-2xl shadow-2xl shadow-black/60 ring-1 ring-white/10
                 overflow-hidden animate-dock-rise"
      style={{
        width: bottomBarWidth ? `max(${bottomBarWidth}px, min(24rem, calc(100vw - 1rem)))` : 'min(24rem, calc(100vw - 1rem))',
        bottom: bottomBarHeight ? `${bottomBarHeight + 16}px` : undefined,
        maxWidth: 'calc(100vw - 1rem)',
      }}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 border-b border-sentinel-700">
        <Radar size={14} className="shrink-0 text-green-300" aria-hidden />
        <span className="flex-1 truncate text-xs font-semibold text-white">MRMS Radar</span>
        {/* Fixed slot, so the header doesn't shift as loading starts and stops. */}
        <span className="flex w-[13px] shrink-0 justify-center">
          {loading && <Loader2 size={13} className="animate-spin text-green-300" aria-label="Loading radar" />}
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Hide controls (radar stays on)"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-sentinel-600 bg-sentinel-900 px-2 py-0.5 text-[10px] font-semibold text-sentinel-200 transition-colors hover:bg-sentinel-700 hover:text-white active:scale-[0.97]"
        >
          <EyeOff size={11} aria-hidden /> Hide controls
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-2.5 max-h-[min(55vh,26rem)] overflow-y-auto">
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
    </div>
  );
}));

export default MrmsPanel;

/** Brings the radar controls back after "Hide controls" (the radar stays on). */
export const MrmsShowControlsPill = memo(function MrmsShowControlsPill({ open, onOpen, bottomOffset = 0 }) {
  const mrms = useMrmsContext();
  if (!mrms?.active || open) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="absolute left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1.5 rounded-full
                 border border-sentinel-600 bg-sentinel-900/90 backdrop-blur-sm px-3 py-1 text-[11px] font-semibold text-white
                 shadow-lg shadow-black/40 transition-[transform,background-color] hover:bg-sentinel-800 active:scale-[0.97] animate-fade-in"
      style={{ bottom: bottomOffset }}
    >
      <SlidersHorizontal size={12} className="text-green-300" aria-hidden />
      Show radar controls
    </button>
  );
});
