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
 * layers' controls); the close button hides the controls, not the imagery.
 */

import { memo, forwardRef } from 'react';
import { AlertTriangle, Crosshair, Loader2, RotateCw, Satellite, Wind, X } from 'lucide-react';
import { useSatelliteContext } from '../../context/SatelliteContext';
import {
  LOOP_HOURS, PRODUCTS, PRODUCT_GROUPS, SATELLITES, formatScanTime, productAvailability,
} from '../../api/goesSatellite';
import FrameScrubber from '../LayerControl/FrameScrubber';

const SELECT_CLS = 'w-full min-w-0 rounded-lg border border-sentinel-600 bg-sentinel-800 px-2 py-1.5 text-xs text-white '
  + 'focus:outline-none focus:border-violet-500/70 cursor-pointer';
const LABEL_CLS = 'text-[10px] font-semibold uppercase tracking-wider text-sentinel-400';

function Field({ id, label, children }) {
  return (
    <div className="flex items-center gap-2 sm:block min-w-0">
      <label htmlFor={id} className={`${LABEL_CLS} w-16 shrink-0 sm:block sm:w-auto sm:mb-1`}>{label}</label>
      {children}
    </div>
  );
}

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
    selection, satellite, region, product, regions, setSatellite, setRegion, setProduct, notice, dismissNotice,
    source, imageTime, loading, error, retry, canLoop, loopHours, setLoopHours, frames, frame, index, live,
    playing, setFrame, goLive, togglePlaying, step, opacity, setOpacity, closePanel, focusBounds,
  } = sat;

  const sectors = regions.filter((r) => r.kind === 'sector');
  const areas = regions.filter((r) => r.kind === 'view');
  const scan = formatScanTime(imageTime);
  const productLabel = product ? `${product.label}${product.detail ? ` (${product.detail})` : ''}` : '';

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Satellite controls"
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20
                 bg-sentinel-900 border border-sentinel-600 rounded-t-2xl shadow-2xl shadow-black/60 ring-1 ring-white/10
                 overflow-hidden origin-bottom animate-slide-up-panel"
      style={{
        width: bottomBarWidth ? `max(${bottomBarWidth}px, min(24rem, calc(100vw - 1rem)))` : 'min(24rem, calc(100vw - 1rem))',
        bottom: bottomBarHeight ? `${bottomBarHeight + 16}px` : undefined,
        maxWidth: 'calc(100vw - 1rem)',
      }}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 border-b border-sentinel-700 bg-gradient-to-b from-violet-700/30 to-transparent">
        <Satellite size={14} className="shrink-0 text-violet-300" aria-hidden />
        <span className="text-[11px] font-bold uppercase tracking-wider text-white">Satellite</span>
        <span className="min-w-0 flex-1 truncate text-[10px] text-sentinel-300" title={source ? `${satellite.label} (${satellite.platform}) · ${region.label} · ${productLabel}` : undefined}>
          {satellite.label} · {region.label} · {product?.label}
        </span>
        <button
          type="button"
          onClick={closePanel}
          aria-label="Hide satellite controls"
          title="Hide controls (imagery stays on)"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sentinel-300 hover:bg-sentinel-700 hover:text-white"
        >
          <X size={13} aria-hidden />
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-2.5 max-h-[min(55vh,26rem)] overflow-y-auto">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2">
          <Field id="sat-satellite" label="Satellite">
            <select id="sat-satellite" className={SELECT_CLS} value={selection.satellite} onChange={(e) => setSatellite(e.target.value)}>
              {SATELLITES.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.platform})</option>)}
            </select>
          </Field>
          <Field id="sat-region" label="Region">
            <select id="sat-region" className={SELECT_CLS} value={selection.region} onChange={(e) => setRegion(e.target.value)}>
              <optgroup label="Scan sectors">
                {sectors.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </optgroup>
              <optgroup label="Zoom to">
                {areas.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </optgroup>
            </select>
          </Field>
          <Field id="sat-product" label="Band">
            <select id="sat-product" className={SELECT_CLS} value={selection.product} onChange={(e) => setProduct(e.target.value)}>
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
          </Field>
        </div>

        {notice && (
          <div className="flex items-start gap-1.5 rounded-lg border border-amber-700/60 bg-amber-950/60 px-2 py-1.5 text-[11px] text-amber-100" role="status">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
            <span className="flex-1">{notice}</span>
            <button type="button" onClick={dismissNotice} aria-label="Dismiss" className="shrink-0 text-amber-300 hover:text-white">
              <X size={12} aria-hidden />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[11px] min-h-5" role="status" aria-live="polite">
          {error ? (
            <>
              <AlertTriangle size={12} className="shrink-0 text-red-300" aria-hidden />
              <span className="flex-1 text-red-200">{error}</span>
              {source && (
                <button type="button" onClick={retry} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-800/80 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-red-700">
                  <RotateCw size={10} aria-hidden /> Retry
                </button>
              )}
            </>
          ) : (
            <>
              {loading && <Loader2 size={12} className="shrink-0 animate-spin text-violet-300" aria-label="Loading imagery" />}
              <span className="flex-1 truncate text-sentinel-200 tabular-nums">
                {live ? 'Latest' : 'Frame'}: {scan ?? (loading ? 'loading…' : 'scan time unavailable')}
              </span>
              <span className="shrink-0 text-[9px] text-sentinel-500">{source?.kind === 'iem' ? 'IEM' : source ? 'NASA GIBS' : ''}</span>
            </>
          )}
        </div>

        {canLoop ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={LABEL_CLS}>Recent loop</span>
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
          <div className="text-[10px] leading-snug text-sentinel-400">
            Latest scan only. Loops are available for True Color, Visible, Clean IR, Fire Temperature, Air Mass and Dust outside the mesoscale sectors.
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
