/**
 * ModelSwitcher.jsx
 * HRRR | GFS | Compare. The three ways into model data; each model wears its
 * own colour so the choice and the data it produces read as one thing.
 */

import { GitCompare } from 'lucide-react';
import { MODEL_STYLE } from './modelTheme';

const OPTIONS = [
  { id: 'hrrr', label: 'HRRR', hint: MODEL_STYLE.hrrr.blurb },
  { id: 'gfs', label: 'GFS', hint: MODEL_STYLE.gfs.blurb },
  { id: 'compare', label: 'Compare', hint: 'HRRR and GFS side by side' },
];

export default function ModelSwitcher({ value, onChange, hrrrAvailable = true }) {
  return (
    <div role="radiogroup" aria-label="Weather model" className="inline-flex rounded-lg border border-sentinel-200 dark:border-sentinel-600 p-0.5 bg-sentinel-100/60 dark:bg-sentinel-800">
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        const disabled = opt.id !== 'gfs' && !hrrrAvailable;
        const swatch = MODEL_STYLE[opt.id];
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            title={disabled ? 'HRRR covers the continental U.S. only' : opt.hint}
            onClick={() => onChange(opt.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500
              disabled:opacity-40 disabled:cursor-not-allowed
              ${active
                ? 'bg-white dark:bg-sentinel-600 text-sentinel-900 dark:text-white shadow-sm'
                : 'text-sentinel-500 dark:text-sentinel-200 hover:text-sentinel-900 dark:hover:text-white'}`}
          >
            {swatch ? (
              <span aria-hidden className="w-2.5 h-2.5 rounded-full" style={{ background: swatch.color }} />
            ) : (
              <GitCompare size={13} aria-hidden />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
