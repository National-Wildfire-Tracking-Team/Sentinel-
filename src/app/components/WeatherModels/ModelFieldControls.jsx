/**
 * ModelFieldControls.jsx
 * Model, compare view and variable for the Models map, floating at the top
 * left. Variables a mode can't show stay listed but disabled, with the
 * reason ("Not in GFS", "Not comparable between models").
 */

import { useState } from 'react';
import { ChevronDown, Wind } from 'lucide-react';
import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import ModelSwitcher from './ModelSwitcher';

export default function ModelFieldControls() {
  const wm = useWeatherModelsContext();
  // Collapsed on phones so the map stays visible.
  const [open, setOpen] = useState(() => window.matchMedia?.('(min-width: 640px)').matches ?? true);
  if (!wm) return null;
  const { mode, setMode, compareView, setCompareView, variable, setVariable, variables, particles, setParticles,
    manifest, manifestError, variableSwitched } = wm;
  const current = variables.find((v) => v.id === variable);

  return (
    // Phones: top right (the corner buttons own the left edge). Wider: left, under the legend.
    <div className="dark absolute z-20 top-[9.5rem] right-3 sm:right-auto sm:left-20 sm:top-24 w-[16.5rem] max-w-[calc(100vw-5rem)]">
      <div className="rounded-xl border border-sentinel-600 bg-sentinel-900/95 backdrop-blur-sm shadow-2xl text-white">
        <div className="p-2 space-y-2">
          <ModelSwitcher value={mode} onChange={setMode} />
          {mode === 'compare' && (
            <div role="radiogroup" aria-label="Compare view" className="grid grid-cols-2 gap-1 text-xs">
              {[['swipe', 'Swipe'], ['difference', 'Difference']].map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={compareView === id} onClick={() => setCompareView(id)}
                  className={`rounded-md px-2 py-1 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${
                    compareView === id ? 'bg-sentinel-600 text-white' : 'text-sentinel-300 hover:bg-sentinel-700'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            className="flex w-full items-center justify-between rounded-md px-1 text-xs text-sentinel-300 hover:text-white">
            <span>Variable: <strong className="text-white">{current?.label ?? '—'}</strong></span>
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        </div>
        {open && (
          <div role="radiogroup" aria-label="Model variable" className="border-t border-sentinel-700 p-1 max-h-[45vh] overflow-y-auto">
            {!manifest && !manifestError && <p className="px-2 py-1.5 text-xs text-sentinel-300">Loading model runs…</p>}
            {manifestError && !manifest && <p className="px-2 py-1.5 text-xs text-red-300">{manifestError.message}</p>}
            {variables.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={v.id === variable}
                disabled={!v.available}
                onClick={() => setVariable(v.id)}
                title={v.reason ?? v.description}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  v.id === variable ? 'bg-sentinel-700 text-white font-semibold' : 'text-sentinel-200 hover:bg-sentinel-800'
                } disabled:cursor-not-allowed disabled:text-sentinel-500 disabled:hover:bg-transparent`}
              >
                <span>{v.label}</span>
                {v.reason && <span className="text-[10px]">{v.reason}</span>}
              </button>
            ))}
          </div>
        )}
        {mode !== 'compare' && (
          <label className="flex items-center gap-2 border-t border-sentinel-700 px-3 py-1.5 text-xs text-sentinel-200 cursor-pointer">
            <input type="checkbox" checked={particles} onChange={(e) => setParticles(e.target.checked)} className="accent-sky-500" />
            <Wind size={12} aria-hidden /> Wind particles
          </label>
        )}
        {variableSwitched && (
          <p className="border-t border-sentinel-700 px-3 py-1.5 text-[11px] text-amber-300">
            Showing {current?.label}: the selected variable is {variableSwitched.toLowerCase()}.
          </p>
        )}
      </div>
    </div>
  );
}
