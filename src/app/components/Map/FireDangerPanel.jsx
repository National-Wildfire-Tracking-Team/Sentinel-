/**
 * FireDangerPanel.jsx
 * Fire Danger & Fuels controls, shown in the bottom bar's pull-up sheet
 * (DockSheet, via MapDockSheet) while one of its layers is on: per-source
 * status (forecast date, retrieval time, partly issued / stale / error with
 * Retry), the source credit, and each layer's opacity. The map's own
 * attribution control is disabled, so the credit lives here.
 */

import { memo, useMemo } from 'react';
import { AlertTriangle, Flame, Layers, Loader2, MapPin, RotateCw } from 'lucide-react';
import { useViewport } from '../../context/ViewportContext';
import {
  DEAD_FM_FIELDS, LIVE_FM_FIELDS, STATION_FIELDS, STATIONS_SOURCE, STATIONS_SOURCE_URL, summarizeStations, viewportBounds,
} from '../../api/fireDanger/stations';
import { formatForecastDate, samplesStatus, stationStatus, wfpiStatus } from '../../api/fireDanger/status';
import { SAMPLES_SOURCE, SAMPLES_SOURCE_URL } from '../../api/fireDanger/fieldSamples';
import { WFPI_DAYS, WFPI_SOURCE, WFPI_SOURCE_URL } from '../../api/fireDanger/wfpi';
import { FIRE_DANGER_URL } from '../../api/fireDanger/stations';
import { useFireDangerContext } from '../../context/FireDangerContext';
import { SFP_SOURCE, SFP_SOURCE_URL } from '../../api/fireDanger/significantFirePotential';
import { LANDFIRE_SOURCE, LANDFIRE_SOURCE_URL } from '../../api/fireDanger/landfireFuels';
import { withClock } from '../../utils/formatUtils';
import { sfpStatus } from '../../api/fireDanger/status';
import { useTimeFormat } from '../../hooks/useTimeFormat';

const LABEL_CLS = 'text-[10px] font-semibold uppercase tracking-wider text-sentinel-400';

function StatusRow({ status, icon: Icon, onRetry }) {
  if (!status) return null;
  return (
    <div className="flex items-start gap-2 text-[11px]">
      {status.tone === 'loading' && <Loader2 size={13} className="mt-px shrink-0 animate-spin text-orange-300 motion-reduce:animate-none" aria-hidden />}
      {status.tone === 'info' && <Icon size={13} className="mt-px shrink-0 text-orange-300" aria-hidden />}
      {status.tone === 'error' && <AlertTriangle size={13} className="mt-px shrink-0 text-red-300" aria-hidden />}
      <span className={`min-w-0 flex-1 leading-snug ${status.tone === 'error' ? 'text-red-200' : 'text-sentinel-200'}`}>{status.text}</span>
      {status.retry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-800/80 px-2 py-0.5 text-[10px] font-semibold text-white transition-transform duration-100 hover:bg-red-700 active:scale-95"
        >
          <RotateCw size={10} aria-hidden /> Retry
        </button>
      )}
    </div>
  );
}

function OpacitySlider({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-2 text-[10px] text-sentinel-300">
      <span className="w-24 shrink-0 font-semibold uppercase tracking-wider">{label}</span>
      <input
        type="range"
        min={0.1}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-orange-500"
        aria-label={`${label} opacity`}
      />
      <span className="w-8 text-right tabular-nums">{Math.round(value * 100)}%</span>
    </label>
  );
}

function Credit({ text, href }) {
  return (
    <div className="text-[9px] leading-tight text-sentinel-500">
      <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-sentinel-300 underline-offset-2 hover:underline">{text}</a>
    </div>
  );
}

function ClassPicker({ fields, value, onChange, label }) {
  return (
    <div className="flex gap-1" role="group" aria-label={label}>
      {fields.map((f) => (
        <button
          key={f}
          type="button"
          aria-pressed={value === f}
          onClick={() => onChange(f)}
          className={`min-h-7 flex-1 rounded-md px-1.5 text-[10px] font-semibold border transition-colors ${value === f
            ? 'bg-orange-500 text-white border-transparent'
            : 'bg-sentinel-900 text-sentinel-300 border-sentinel-600 hover:bg-sentinel-700 hover:text-white'}`}
        >
          {STATION_FIELDS[f].short}
        </button>
      ))}
    </div>
  );
}

const n1 = (v) => (v == null ? '–' : Math.round(v * 10) / 10);

/** Station statistics for the map view: a summary of FEMS values, not a forecast or warning. */
function RegionSummary({ data }) {
  const { viewport } = useViewport();
  const summary = useMemo(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    return summarizeStations(data, viewportBounds(viewport, w, h));
  }, [data, viewport]);

  if (!summary.stations) return <div className="text-[11px] text-sentinel-400">No NFDRS stations in the map view.</div>;
  return (
    <div className="space-y-1.5 text-[11px] text-sentinel-200">
      <div className="grid grid-cols-3 gap-1.5 tabular-nums">
        <div className="rounded-md bg-sentinel-900 border border-sentinel-700 px-2 py-1">
          <div className="text-[9px] uppercase tracking-wider text-sentinel-400">Stations</div>
          <div className="text-sm font-semibold text-white">{summary.current}<span className="text-[10px] text-sentinel-400"> / {summary.stations}</span></div>
        </div>
        <div className="rounded-md bg-sentinel-900 border border-sentinel-700 px-2 py-1">
          <div className="text-[9px] uppercase tracking-wider text-sentinel-400">ERC median · max</div>
          <div className="text-sm font-semibold text-white">{n1(summary.erc.median)} · {n1(summary.erc.max)}</div>
        </div>
        <div className="rounded-md bg-sentinel-900 border border-sentinel-700 px-2 py-1">
          <div className="text-[9px] uppercase tracking-wider text-sentinel-400">100-h FM min</div>
          <div className="text-sm font-semibold text-white">{summary.fm100.min == null ? '–' : `${n1(summary.fm100.min)}%`}</div>
        </div>
      </div>
      <div>
        ERC rose at <b className="text-white">{summary.rising}</b> and fell at <b className="text-white">{summary.falling}</b> of {summary.withTrend} stations over the past 7 days;
        FEMS forecasts a higher ERC within 7 days at <b className="text-white">{summary.forecastRising}</b>.
        {summary.stale > 0 && ` ${summary.stale} without a current observed day are left out.`}
      </div>
      {summary.biggestRises.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wider text-sentinel-400 mb-0.5">Largest 7-day ERC rises</div>
          <ul className="space-y-0.5">
            {summary.biggestRises.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5">
                <MapPin size={10} className="shrink-0 text-sentinel-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{p.name}{p.state ? `, ${p.state}` : ''}</span>
                <span className="tabular-nums text-white">+{n1(p.ercChange7d)} → {n1(p.erc)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="text-[9px] text-sentinel-500 leading-snug">
        A summary of station values in the current map view, not an official forecast or warning. Station points can&apos;t give a share of area.
      </div>
    </div>
  );
}

const FireDangerPanel = memo(function FireDangerPanel() {
  useTimeFormat();
  const fd = useFireDangerContext();
  if (!fd?.anyOn) return null;
  const { sfp, opacity, setOpacity } = fd;
  const retrieved = sfp.fetchedAt
    ? new Date(sfp.fetchedAt).toLocaleTimeString([], withClock({ hour: 'numeric', minute: '2-digit' }))
    : null;

  return (
    <div className="px-3 py-2.5 space-y-3" role="status" aria-live="polite">
      {fd.sfpOn && (
        <div className="space-y-1.5">
          <span className={LABEL_CLS}>7-day significant fire potential</span>
          <StatusRow status={sfpStatus(sfp)} icon={Flame} onRetry={fd.retry} />
          {retrieved && <div className="text-[10px] text-sentinel-400">Official NWCG product · retrieved {retrieved}</div>}
          <OpacitySlider label="Opacity" value={opacity.sfp} onChange={(v) => setOpacity('sfp', v)} />
          <Credit text={SFP_SOURCE} href={SFP_SOURCE_URL} />
        </div>
      )}
      {fd.wfpiOn && (
        <div className="space-y-1.5">
          <span className={LABEL_CLS}>Wildland Fire Potential Index (USGS model)</span>
          <StatusRow status={wfpiStatus(fd.wfpi, Boolean(FIRE_DANGER_URL))} icon={Layers} onRetry={fd.retry} />
          <div className="grid grid-cols-7 gap-1" role="group" aria-label="WFPI forecast day">
            {WFPI_DAYS.map((d) => {
              const date = fd.wfpi.validDates?.[d - 1];
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={fd.wfpi.day === d}
                  onClick={() => fd.wfpi.setDay(d)}
                  title={date ? formatForecastDate(date) : `Day ${d}`}
                  className={`min-h-8 rounded-md px-0.5 text-[10px] font-semibold leading-tight border transition-colors ${fd.wfpi.day === d
                    ? 'bg-orange-500 text-white border-transparent'
                    : 'bg-sentinel-900 text-sentinel-300 border-sentinel-600 hover:bg-sentinel-700 hover:text-white'}`}
                >
                  {date ? formatForecastDate(date).split(', ')[1] ?? `D${d}` : `D${d}`}
                </button>
              );
            })}
          </div>
          <OpacitySlider label="Opacity" value={opacity.wfpi} onChange={(v) => setOpacity('wfpi', v)} />
          <div className="text-[9px] text-sentinel-500 leading-snug">A USGS model of vegetation flammability, not an NFDRS index or an official rating.</div>
          <Credit text={WFPI_SOURCE} href={WFPI_SOURCE_URL} />
        </div>
      )}
      {fd.stationsOn && (
        <div className="space-y-1.5">
          <span className={LABEL_CLS}>NFDRS stations</span>
          <StatusRow status={stationStatus(fd.stations)} icon={MapPin} onRetry={fd.retry} />
          {fd.stations.field && DEAD_FM_FIELDS.includes(fd.stations.field) && (
            <ClassPicker fields={DEAD_FM_FIELDS} value={fd.stations.deadClass} onChange={fd.stations.setDeadClass} label="Dead fuel moisture class" />
          )}
          {fd.stations.field && LIVE_FM_FIELDS.includes(fd.stations.field) && (
            <ClassPicker fields={LIVE_FM_FIELDS} value={fd.stations.liveClass} onChange={fd.stations.setLiveClass} label="Live fuel moisture type" />
          )}
          {fd.stations.data && <OpacitySlider label="Opacity" value={opacity.stations} onChange={(v) => setOpacity('stations', v)} />}
          {fd.stations.data && (
            <div className="pt-1">
              <span className={LABEL_CLS}>In the map view</span>
              <div className="mt-1"><RegionSummary data={fd.stations.data} /></div>
            </div>
          )}
          <Credit text={STATIONS_SOURCE} href={STATIONS_SOURCE_URL} />
        </div>
      )}
      {fd.samplesOn && (
        <div className="space-y-1.5">
          <span className={LABEL_CLS}>Live fuel moisture samples (measured)</span>
          <StatusRow status={samplesStatus(fd.samples)} icon={MapPin} onRetry={fd.retry} />
          <div className="text-[9px] text-sentinel-500 leading-snug">
            Field samples at fixed sites, mostly WA, OR, ID, MT, WY, SD and ND. Faded sites haven&apos;t been sampled in two weeks. Click a site for its values.
          </div>
          <Credit text={SAMPLES_SOURCE} href={SAMPLES_SOURCE_URL} />
        </div>
      )}
      {fd.fuelsOn && (
        <div className="space-y-1.5">
          <span className={LABEL_CLS}>Fuel models</span>
          <StatusRow
            status={{ tone: 'info', text: 'LANDFIRE 2025 where released (western US, Alaska), 2024 elsewhere: fuel type only, a yearly map. It does not show how dry fuels are now.' }}
            icon={Layers}
          />
          <OpacitySlider label="Opacity" value={opacity.fuels} onChange={(v) => setOpacity('fuels', v)} />
          <Credit text={LANDFIRE_SOURCE} href={LANDFIRE_SOURCE_URL} />
        </div>
      )}
    </div>
  );
});

export default FireDangerPanel;
