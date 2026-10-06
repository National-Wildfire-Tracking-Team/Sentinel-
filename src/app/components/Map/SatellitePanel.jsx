/**
 * SatellitePanel.jsx
 * Compact satellite controls that pop up from the bottom bar (where the
 * Layers button lives) while the Satellite layer is on: satellite, region
 * and product pickers, what is shown and when, the recent-imagery loop,
 * opacity, and what's drawn over the imagery (NWS alerts, NHC storms and
 * areas of interest).
 *
 * Docked flush above MapBottomBar and matched to its width, like the SPC
 * outlook selector, so it grows out of the same bar as every other layer's
 * controls. The page decides when it shows (it shares the dock with other
 * layers' controls); "Hide controls" hides the controls, not the imagery, and
 * SatelliteShowControlsPill brings them back.
 */

import { memo, forwardRef } from 'react';
import { AlertTriangle, Crosshair, EyeOff, Loader2, RotateCw, Satellite, SlidersHorizontal, Wind, X } from 'lucide-react';
import { useSatelliteContext } from '../../context/SatelliteContext';
import {
  LOOP_HOURS, PRODUCTS, PRODUCT_GROUPS, SATELLITES, productAvailability, regionsFor,
} from '../../api/goesSatellite';
import FrameScrubber from '../LayerControl/FrameScrubber';

const SELECT_CLS = 'min-w-0 flex-1 rounded-lg border border-sentinel-600 bg-sentinel-800 px-2 py-1 text-xs font-medium text-white '
  + 'focus:outline-none focus:border-violet-500/70 cursor-pointer';
const LABEL_CLS = 'text-[10px] font-semibold uppercase tracking-wider text-sentinel-400';

function HideControlsButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Hide controls (imagery stays on)"
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-sentinel-600 bg-sentinel-900 px-2 py-0.5 text-[10px] font-semibold text-sentinel-200 transition-colors hover:bg-sentinel-700 hover:text-white active:scale-[0.97]"
    >
      <EyeOff size={11} aria-hidden /> Hide controls
    </button>
  );
}

// One option value per satellite + scan sector, e.g. "goes-west:alaska".
const pairValue = (satelliteId, regionId) => `${satelliteId}:${regionId}`;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * What's drawn over the imagery. `alerts`: { on, count, onToggle } for the
 * NWS alerts layer; `tropical`: { storms, areas, bounds } from NHC. Either is
 * null when the current tab doesn't show it.
 */
function OverlaysRow({ alerts, tropical, onFocus }) {
  if (!alerts && !tropical) return null;
  const tropicalCount = tropical ? tropical.storms + tropical.areas : 0;
  return (
    <div className="space-y-1">
      <span className={LABEL_CLS}>On the imagery</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {alerts && (
          <button
            type="button"
            aria-pressed={alerts.on}
            onClick={alerts.onToggle}
            title={alerts.on ? 'Hide NWS alerts' : 'Show NWS alerts'}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all ${
              alerts.on
                ? 'bg-amber-500/20 text-amber-100 border-amber-500/60'
                : 'bg-sentinel-900 text-sentinel-400 border-sentinel-600 hover:bg-sentinel-700 hover:text-white'}`}
          >
            <AlertTriangle size={11} aria-hidden />
            NWS alerts{alerts.on ? ` · ${alerts.count}` : ''}
          </button>
        )}
        {tropical && (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/50 bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-100">
            <Wind size={11} aria-hidden />
            {tropicalCount
              ? [
                tropical.storms ? plural(tropical.storms, 'storm') : null,
                tropical.areas ? plural(tropical.areas, 'area') + ' of interest' : null,
              ].filter(Boolean).join(' · ')
              : 'No active tropical systems'}
          </span>
        )}
        {tropical?.bounds && tropicalCount > 0 && (
          <button
            type="button"
            onClick={() => onFocus(tropical.bounds)}
            className="inline-flex items-center gap-1 rounded-full border border-sentinel-600 bg-sentinel-800 px-2 py-0.5 text-[10px] font-semibold text-sentinel-200 hover:bg-sentinel-700 hover:text-white"
          >
            <Crosshair size={11} aria-hidden />
            Zoom to tropics
          </button>
        )}
      </div>
    </div>
  );
}

const SatellitePanel = memo(forwardRef(function SatellitePanel({ bottomBarWidth, bottomBarHeight, overlays }, ref) {
  const sat = useSatelliteContext();
  if (!sat?.panelOpen) return null;
  const {
    selection, region, setSatelliteRegion, setProduct, notice, dismissNotice,
    source, loading, error, retry, canLoop, loopHours, setLoopHours, frames, frame, index, live,
    playing, setFrame, goLive, togglePlaying, step, opacity, setOpacity, closePanel, focusBounds,
  } = sat;

  // Scan sectors only; a "zoom to" area still shows if a shared link opened on one.
  const regionChoices = (satelliteId) => regionsFor(satelliteId).filter(
    (r) => r.kind === 'sector' || (satelliteId === selection.satellite && r.id === region?.id),
  );
  const onPairChange = (value) => {
    const [satelliteId, regionId] = value.split(':');
    setSatelliteRegion(satelliteId, regionId);
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Satellite controls"
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20
                 bg-sentinel-900 border border-sentinel-600 rounded-t-2xl shadow-2xl shadow-black/60 ring-1 ring-white/10
                 overflow-hidden animate-dock-rise"
      style={{
        width: bottomBarWidth ? `max(${bottomBarWidth}px, min(24rem, calc(100vw - 1rem)))` : 'min(24rem, calc(100vw - 1rem))',
        bottom: bottomBarHeight ? `${bottomBarHeight + 16}px` : undefined,
        maxWidth: 'calc(100vw - 1rem)',
      }}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 border-b border-sentinel-700 bg-gradient-to-b from-violet-700/30 to-transparent">
        <Satellite size={14} className="shrink-0 text-violet-300" aria-hidden />
        <select
          aria-label="Satellite and region"
          className={SELECT_CLS}
          value={pairValue(selection.satellite, selection.region)}
          onChange={(e) => onPairChange(e.target.value)}
        >
          {SATELLITES.map((s) => (
            <optgroup key={s.id} label={`${s.label} (${s.platform})`}>
              {regionChoices(s.id).map((r) => (
                <option key={r.id} value={pairValue(s.id, r.id)}>{s.label} · {r.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select aria-label="Band" className={SELECT_CLS} value={selection.product} onChange={(e) => setProduct(e.target.value)}>
          {PRODUCT_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {PRODUCTS.filter((p) => p.group === group).map((p) => {
                const availability = productAvailability(p.id, selection.satellite, selection.region);
                return (
                  <option key={p.id} value={p.id} disabled={!availability.ok} title={availability.ok ? p.detail : availability.reason}>
                    {p.label}{p.detail?.startsWith('Band') ? ` · ${p.detail.split(' · ')[0]}` : ''}{availability.ok ? '' : ' (not available here)'}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>
        {/* Fixed slot, so the pickers don't shift as loading starts and stops. */}
        <span className="flex w-[13px] shrink-0 justify-center">
          {loading && !error && <Loader2 size={13} className="animate-spin text-violet-300" aria-label="Loading imagery" />}
        </span>
      </div>

      <div className="px-3 py-2.5 space-y-2.5 max-h-[min(55vh,26rem)] overflow-y-auto">
        {notice && (
          <div className="flex items-start gap-1.5 rounded-lg border border-amber-700/60 bg-amber-950/60 px-2 py-1.5 text-[11px] text-amber-100" role="status">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
            <span className="flex-1">{notice}</span>
            <button type="button" onClick={dismissNotice} aria-label="Dismiss" className="shrink-0 text-amber-300 hover:text-white">
              <X size={12} aria-hidden />
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-1.5 text-[11px]" role="status" aria-live="polite">
            <AlertTriangle size={12} className="shrink-0 text-red-300" aria-hidden />
            <span className="flex-1 text-red-200">{error}</span>
            {source && (
              <button type="button" onClick={retry} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-800/80 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-red-700">
                <RotateCw size={10} aria-hidden /> Retry
              </button>
            )}
          </div>
        )}

        {canLoop ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className={LABEL_CLS}>Recent loop</span>
              <HideControlsButton onClick={closePanel} />
              <div className="flex items-center gap-1" role="group" aria-label="Loop length">
                {LOOP_HOURS.map((h) => {
                  const active = h === loopHours;
                  return (
                    <button
                      key={h}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setLoopHours(h)}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold border transition-all ${
                        active ? 'bg-violet-600 text-white border-transparent' : 'bg-sentinel-900 text-sentinel-300 border-sentinel-600 hover:bg-sentinel-700 hover:text-white'}`}
                    >
                      {h}h
                    </button>
                  );
                })}
              </div>
            </div>
            {frames.length ? (
              <FrameScrubber
                frames={frames}
                index={index}
                frame={frame}
                live={live}
                playing={playing}
                onTogglePlaying={togglePlaying}
                onSeek={setFrame}
                onLive={goLive}
                onStep={step}
                playLabel={`Play the last ${loopHours} hour${loopHours > 1 ? 's' : ''} of satellite imagery`}
                pauseLabel="Pause satellite animation"
                sliderLabel="Satellite time"
                sliderClass="accent-violet-500"
                liveClass="bg-violet-600"
              />
            ) : (
              <div className="text-[10px] text-sentinel-400">{error ? 'Loop unavailable.' : 'Loading frames…'}</div>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <div className="flex-1 text-[10px] leading-snug text-sentinel-400">
              Latest scan only. Loops are available for True Color, Visible, Clean IR, Fire Temperature, Air Mass and Dust outside the mesoscale sectors.
            </div>
            <HideControlsButton onClick={closePanel} />
          </div>
        )}

        <OverlaysRow alerts={overlays?.alerts ?? null} tropical={overlays?.tropical ?? null} onFocus={focusBounds} />

        <label className="flex items-center gap-2 text-[10px] text-sentinel-300">
          <span className="font-semibold uppercase tracking-wider">Opacity</span>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-violet-500"
          />
          <span className="w-8 text-right tabular-nums">{Math.round(opacity * 100)}%</span>
        </label>
      </div>
    </div>
  );
}));

export default SatellitePanel;

/**
 * While the Satellite layer is on but its controls are hidden: a small pill
 * just above the bottom bar (and above whatever else is docked on it) that
 * brings them back.
 */
export const SatelliteShowControlsPill = memo(function SatelliteShowControlsPill({ bottomOffset = 0 }) {
  const sat = useSatelliteContext();
  if (!sat?.active || sat.panelOpen) return null;
  return (
    <button
      type="button"
      onClick={sat.openPanel}
      className="absolute left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1.5 rounded-full
                 border border-sentinel-600 bg-sentinel-900/90 backdrop-blur-sm px-3 py-1 text-[11px] font-semibold text-white
                 shadow-lg shadow-black/40 transition-[transform,background-color] hover:bg-sentinel-800 active:scale-[0.97] animate-fade-in"
      style={{ bottom: bottomOffset }}
    >
      <SlidersHorizontal size={12} className="text-violet-300" aria-hidden />
      Show controls
    </button>
  );
});
