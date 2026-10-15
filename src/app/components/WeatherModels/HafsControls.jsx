/**
 * HafsControls.jsx
 * What HAFS shows, chosen under the HAFS row of the Models layer pop-up:
 * the storm, the configuration (HAFS-A / HAFS-B), the run, and the domain
 * (the storm-following nest or the larger parent). Only what the catalog
 * actually has is offered.
 */

import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import { basinLabel, stormLabel } from '../../utils/hafsSelection';
import { localTime, zulu } from './modelTheme';

const LABEL = 'text-[10px] font-semibold uppercase tracking-wider text-sentinel-300 mb-1.5';
const SEGMENT = (active) => `h-8 rounded-md text-[11px] font-semibold transition-all border px-2 ${
  active
    ? 'bg-teal-600 text-white border-teal-400 shadow-lg shadow-teal-900/30'
    : 'bg-sentinel-900 text-sentinel-300 border-sentinel-600 hover:bg-sentinel-700 hover:text-white hover:border-sentinel-500'}`;

const DOMAIN_LABEL = { storm: 'Storm nest', parent: 'Parent' };

function Segmented({ label, options, value, onChange }) {
  return (
    <div>
      <div className={LABEL}>{label}</div>
      <div role="radiogroup" aria-label={label} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
            title={o.title} className={SEGMENT(value === o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function runLabel(run) {
  const status = run.status === 'complete' ? `to +${run.latestHour} h`
    : run.status === 'in-progress' ? `arriving · to +${run.latestHour} h` : `partial · to +${run.latestHour} h`;
  return `${localTime(run.initTime, { month: 'short', day: 'numeric' })} ${zulu(run.initTime)} · ${status}`;
}

export default function HafsControls() {
  const wm = useWeatherModelsContext();
  const hafs = wm?.hafs;
  if (!hafs) return null;
  const { catalog, catalogError, sel, choose, detailError } = hafs;

  if (!catalog) {
    return (
      <p className={`px-2.5 py-2.5 text-xs border-t border-sentinel-700 ${catalogError ? 'text-red-300' : 'text-sentinel-300'}`}>
        {catalogError ? catalogError.message : 'Loading HAFS runs…'}
      </p>
    );
  }
  if (!sel) {
    return (
      <p className="px-2.5 py-2.5 text-xs text-sentinel-300 border-t border-sentinel-700">
        No HAFS runs in the last {catalog.days} days. NOAA runs HAFS only while a tropical cyclone (or an invest it&apos;s tasked with) is active.
      </p>
    );
  }

  return (
    <div className="px-2.5 py-2.5 space-y-3 bg-sentinel-800/70 border-t border-sentinel-700">
      <div>
        <div className={LABEL}>Storm</div>
        <div role="radiogroup" aria-label="Storm" className="space-y-1">
          {sel.storms.map((s) => {
            const active = s.key === sel.storm.key;
            return (
              <button key={s.key} type="button" role="radio" aria-checked={active} onClick={() => choose({ storm: s.key })}
                className={`w-full flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                  active ? 'border-teal-400 bg-teal-600/20 text-white' : 'border-sentinel-600 bg-sentinel-900 text-sentinel-200 hover:bg-sentinel-700'}`}>
                <span className="truncate text-xs font-semibold">{stormLabel(s)}</span>
                <span className="shrink-0 text-[10px] text-sentinel-300">{basinLabel(s.basin)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {sel.models.length > 1 && (
        <Segmented label="Configuration" value={sel.model} onChange={(model) => choose({ model, cycle: undefined })}
          options={sel.models.map((m) => ({ id: m.id, label: m.name }))} />
      )}

      <div>
        <label htmlFor="hafs-run" className={`block ${LABEL}`}>Run</label>
        <select id="hafs-run" value={sel.cycle} onChange={(e) => choose({ cycle: e.target.value })}
          className="w-full h-8 rounded-md border border-sentinel-600 bg-sentinel-900 px-2 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
          {sel.runs.map((r) => <option key={r.cycle} value={r.cycle}>{runLabel(r)}</option>)}
        </select>
      </div>

      {sel.domains.length > 1 && (
        <Segmented label="Domain" value={sel.domain} onChange={(domain) => choose({ domain })}
          options={sel.domains.map((d) => ({
            id: d, label: DOMAIN_LABEL[d] ?? d,
            title: catalog.models.find((m) => m.id === sel.model)?.domains.find((x) => x.id === d)?.description,
          }))} />
      )}

      {detailError && <p role="alert" className="text-[11px] text-red-300">{detailError.message}</p>}
    </div>
  );
}
