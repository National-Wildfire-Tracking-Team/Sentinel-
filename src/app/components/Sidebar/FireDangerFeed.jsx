/**
 * FireDangerFeed.jsx
 * Wildfire sidebar "Fire Danger" tab: a plain-language national picture from
 * the NFDRS station run (cloud/fire-danger): headline numbers, the week ahead
 * by ERC band, states ranked by median ERC and the highest-ERC stations.
 * Clicking a state or station flies the map there and turns on the ERC
 * station layer. Bands are fixed cut points (ERC_BANDS), not official ratings.
 */

import { memo, useEffect, useState } from 'react';
import { Flame, Info, Loader2, Lock, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useViewport } from '../../context/ViewportContext';
import { usePlan } from '../../../shared/hooks/usePlan';
import {
  ERC_BANDS, FIRE_DANGER_URL, MANIFEST_REFRESH_MS, STATION_LAYER_KEYS, ercBand,
  fetchFireDangerManifest, fetchStations, markStaleStations, nationalOutlook,
} from '../../api/fireDanger/stations';

const STATES_SHOWN = 12;

const fmtDay = (date, opts) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
const round = (v) => (v == null ? '—' : Math.round(v));

function Stat({ value, unit = '', label }) {
  return (
    <div className="flex flex-col gap-0.5 px-2.5 py-2 rounded-lg bg-sentinel-800 border border-sentinel-700 min-w-0">
      <span className="text-lg font-bold text-white tabular-nums leading-tight">{value}{value !== '—' && unit}</span>
      <span className="text-[10px] text-sentinel-300 leading-tight">{label}</span>
    </div>
  );
}

function SectionTitle({ children }) {
  return <div className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sentinel-500">{children}</div>;
}

function BandChip({ erc }) {
  return (
    <span
      className="inline-block min-w-[2.2rem] px-1.5 py-0.5 rounded text-center text-xs font-bold text-white tabular-nums"
      style={{ backgroundColor: ERC_BANDS[ercBand(erc)].color }}
    >
      {Math.round(erc)}
    </span>
  );
}

/** One 100%-stacked column per forecast day; the share at Elevated+ on top. */
function WeekAhead({ days }) {
  const W = 280, H = 112, top = 16, bottom = 28;
  const step = W / days.length, barW = step * 0.68, plotH = H - top - bottom;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Share of stations in each ERC band for each forecast day">
      {days.map((d, i) => {
        const x = i * step + (step - barW) / 2;
        let acc = 0;
        return (
          <g key={d.date}>
            <title>
              {`${fmtDay(d.date, { weekday: 'long', month: 'short', day: 'numeric' })}\n`}
              {ERC_BANDS.map((b, j) => `${b.label}: ${d.bands[j]} stations`).reverse().join('\n')}
            </title>
            {d.bands.map((n, j) => {
              const h = (plotH * n) / d.n;
              const y = top + plotH - acc - h;
              acc += h;
              return <rect key={j} x={x} y={y} width={barW} height={h} fill={ERC_BANDS[j].color} />;
            })}
            <text x={x + barW / 2} y={top - 4} textAnchor="middle" className="fill-white text-[10px] font-semibold">{d.pctElevated}%</text>
            <text x={x + barW / 2} y={H - bottom + 12} textAnchor="middle" className="fill-sentinel-300 text-[9px]">{fmtDay(d.date, { weekday: 'short' })}</text>
            <text x={x + barW / 2} y={H - bottom + 23} textAnchor="middle" className="fill-sentinel-500 text-[9px]">{fmtDay(d.date, { day: 'numeric' })}</text>
          </g>
        );
      })}
    </svg>
  );
}

function useNationalOutlook(enabled) {
  const [st, setSt] = useState({ outlook: null, error: null, loading: false });
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!enabled || !FIRE_DANGER_URL) return undefined;
    let cancelled = false;
    const load = async () => {
      setSt((s) => ({ ...s, loading: true }));
      try {
        const manifest = await fetchFireDangerManifest();
        const fc = markStaleStations(await fetchStations(manifest), manifest.sources?.fems?.latestObservedDate);
        if (!cancelled) setSt({ outlook: nationalOutlook(fc), error: null, loading: false });
      } catch (error) {
        if (cancelled) return;
        console.warn('[FireDangerFeed]', error.message);
        // Keep the last good run on screen; its observed date shows its age.
        setSt((s) => ({ ...s, error, loading: false }));
      }
    };
    load();
    const id = setInterval(load, MANIFEST_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [enabled, reloadKey]);
  return { ...st, retry: () => setReloadKey((k) => k + 1) };
}

const FireDangerFeed = memo(function FireDangerFeed({ enabled = true }) {
  const { layers, setLayer } = useApp();
  const { setViewport } = useViewport();
  const { hasFireDangerAccess } = usePlan();
  const { outlook, error, loading, retry } = useNationalOutlook(enabled && hasFireDangerAccess);
  const [allStates, setAllStates] = useState(false);

  const showOnMap = ([longitude, latitude], zoom) => {
    if (!STATION_LAYER_KEYS.some((k) => layers[k])) STATION_LAYER_KEYS.forEach((k) => setLayer(k, k === 'fdErc'));
    setViewport({ longitude, latitude, zoom });
  };

  if (!hasFireDangerAccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6 text-sentinel-400">
        <Lock size={22} className="text-sentinel-600" />
        <p className="text-sm">Fire Danger &amp; Fuels is included with Sentinel Plus and Pro</p>
      </div>
    );
  }

  if (!FIRE_DANGER_URL) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6 text-sentinel-400">
        <Flame size={24} className="text-sentinel-600" />
        <p className="text-sm">Fire danger stations aren't set up for this build yet</p>
      </div>
    );
  }

  if (!outlook) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6 text-sentinel-400 text-sm">
        {error && !loading ? (
          <>
            <p>Couldn't load fire danger stations.</p>
            <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-200">
              <RefreshCw size={12} /> Try again
            </button>
          </>
        ) : (
          <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading fire danger stations…</span>
        )}
      </div>
    );
  }

  const states = allStates ? outlook.states : outlook.states.slice(0, STATES_SHOWN);
  const maxErc = Math.max(80, ...outlook.states.map((s) => s.medianErc));

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
      <p className="px-1 text-xs text-sentinel-300 leading-snug">
        How dry fuels are at {outlook.stations.toLocaleString('en-US')} fire weather stations
        {outlook.observedDate && <>, observed {fmtDay(outlook.observedDate, { month: 'short', day: 'numeric' })}</>}.
        Higher ERC means fires would burn hotter and be harder to control.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Stat value={round(outlook.medianErc)} label="Typical ERC nationwide (median)" />
        <Stat value={outlook.pctElevated ?? '—'} unit="%" label="of stations Elevated or higher (ERC 40+)" />
        <Stat value={outlook.pctDrying ?? '—'} unit="%" label="drier than a week ago (ERC up 5+)" />
        <Stat value={round(outlook.medianFm100)} unit="%" label="Typical 100-hour fuel moisture (lower is drier)" />
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[10px] text-sentinel-300">
        {ERC_BANDS.map((b, i) => (
          <span key={b.label} className="inline-flex items-center gap-1">
            <i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: b.color }} />
            {b.label} {ERC_BANDS[i + 1] ? `${b.min}–${ERC_BANDS[i + 1].min - 1}` : `${b.min}+`}
          </span>
        ))}
      </div>

      {outlook.days.length > 0 && (
        <div>
          <SectionTitle>The week ahead</SectionTitle>
          <div className="rounded-xl border border-sentinel-700 bg-sentinel-800/60 p-2.5">
            <WeekAhead days={outlook.days} />
            <p className="mt-1 text-[10px] text-sentinel-400 leading-snug">Stations in each band per forecast day. The number on top is the share at Elevated or higher.</p>
          </div>
        </div>
      )}

      <div>
        <SectionTitle>Driest states (median ERC)</SectionTitle>
        <div className="space-y-0.5">
          {states.map((s) => (
            <button
              key={s.state}
              type="button"
              onClick={() => showOnMap(s.center, 5.5)}
              title={`${s.stations} stations · ${s.pctElevated}% at Elevated or higher`}
              className="w-full flex items-center gap-2 px-1 py-1 rounded hover:bg-sentinel-800 transition-colors text-left"
            >
              <span className="w-6 text-xs font-semibold text-white">{s.state}</span>
              <span className="flex-1 h-3 rounded-sm bg-sentinel-800 overflow-hidden">
                <span
                  className="block h-full rounded-sm"
                  style={{ width: `${(100 * s.medianErc) / maxErc}%`, backgroundColor: ERC_BANDS[ercBand(s.medianErc)].color }}
                />
              </span>
              <span className="w-7 text-right text-xs font-semibold text-white tabular-nums">{Math.round(s.medianErc)}</span>
              <span className="w-8 text-right text-[10px] text-sentinel-500 tabular-nums">{s.stations} st</span>
            </button>
          ))}
        </div>
        {outlook.states.length > STATES_SHOWN && (
          <button type="button" onClick={() => setAllStates((v) => !v)} className="mt-1 px-1 text-[11px] text-sky-300 hover:text-sky-200">
            {allStates ? 'Show fewer' : `Show all ${outlook.states.length} states`}
          </button>
        )}
      </div>

      <div>
        <SectionTitle>Highest-reading stations</SectionTitle>
        <div className="space-y-1">
          {outlook.top.map((p) => {
            const peak = Math.max(...(p.forecastErc ?? []).filter((v) => v != null));
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => showOnMap(p.coordinates, 9)}
                className="w-full flex items-center gap-2 rounded-lg border border-sentinel-700 bg-sentinel-800/60 hover:bg-sentinel-800 hover:border-sentinel-600 transition-colors px-2.5 py-1.5 text-left"
              >
                <BandChip erc={p.erc} />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold text-white truncate">{p.name}, {p.state}</span>
                  <span className="block text-[10px] text-sentinel-400">
                    {p.ercChange7d != null && <>{p.ercChange7d > 0 ? '+' : ''}{Math.round(p.ercChange7d)} in 7 days · </>}
                    {p.fm100 != null && <>100-h {Math.round(p.fm100)}% · </>}
                    {Number.isFinite(peak) ? `peak ${Math.round(peak)} this week` : 'no forecast'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 rounded-lg border border-amber-700/40 bg-amber-900/15 p-2.5 text-[10px] text-sentinel-300 leading-snug">
        <Info size={12} className="shrink-0 mt-0.5 text-amber-300" />
        <p>
          NFDRS 2016 values (fuel model Y) from the USDA Forest Service FEMS, at each station only. The bands are fixed cut points
          for comparing stations nationwide, not your area's official fire danger rating. For warnings, follow Red Flag Warnings
          and local fire restrictions.
        </p>
      </div>
    </div>
  );
});

export default FireDangerFeed;
