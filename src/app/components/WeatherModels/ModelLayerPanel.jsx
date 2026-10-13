/**
 * ModelLayerPanel.jsx
 * The Models tab's body of the bottom bar's layer pop-up (LayerControl):
 * model, compare view, variable and wind particles, drawn with the same
 * sections and rows as the map layer toggles on the other tabs.
 * Variables a mode can't show stay listed but disabled, with the reason
 * ("Not in GFS", "Not comparable between models").
 */

import { Check, GitCompare, Wind } from 'lucide-react';
import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import LayerPanelSection from '../LayerControl/LayerPanelSection';
import { MODEL_STYLE } from './modelTheme';

const MODELS = [
  { id: 'hrrr', label: 'HRRR', sublabel: MODEL_STYLE.hrrr.blurb, color: MODEL_STYLE.hrrr.hexDark },
  { id: 'gfs', label: 'GFS', sublabel: MODEL_STYLE.gfs.blurb, color: MODEL_STYLE.gfs.hexDark },
  { id: 'compare', label: 'Compare', sublabel: 'HRRR and GFS side by side', color: '#818cf8', icon: GitCompare },
];

const COMPARE_VIEWS = [
  { id: 'swipe', label: 'Swipe' },
  { id: 'difference', label: 'Difference' },
];

const ROW = 'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/10 transition-colors text-left '
  + 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500';
const LIST = 'rounded-lg bg-sentinel-900 border border-sentinel-700 divide-y divide-sentinel-700 overflow-hidden';

// fill/edge are hex alpha suffixes; toggles pass '26'/'4d' (15%/30%), matching the layer toggles.
function IconBox({ active, color, fill = '22', edge = '55', children }) {
  return (
    <div
      className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
      style={{
        backgroundColor: active ? `${color}${fill}` : 'transparent',
        border: `1px solid ${active ? `${color}${edge}` : '#52525b'}`,
      }}
    >
      {children}
    </div>
  );
}

function RadioDot({ active, color }) {
  return (
    <span
      aria-hidden
      className="shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center"
      style={{ borderColor: active ? color : '#71717a' }}
    >
      {active && <span className="w-2 h-2 rounded-full" style={{ background: color }} />}
    </span>
  );
}

function CompareViewSelector({ value, onChange }) {
  return (
    <div className="px-2.5 py-2.5 bg-sentinel-800/70 border-t border-sentinel-700">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-sentinel-300 mb-2">Compare view</div>
      <div role="radiogroup" aria-label="Compare view" className="grid grid-cols-2 gap-1">
        {COMPARE_VIEWS.map(({ id, label }) => {
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(id)}
              className={`h-8 rounded-md text-[10px] font-semibold transition-all border ${
                active
                  ? 'bg-indigo-500 text-white border-indigo-400 shadow-lg shadow-indigo-900/30'
                  : 'bg-sentinel-900 text-sentinel-300 border-sentinel-600 hover:bg-sentinel-700 hover:text-white hover:border-sentinel-500'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ModelLayerPanel({ collapsed = {}, onToggleSection }) {
  const wm = useWeatherModelsContext();
  if (!wm) return null;
  const { mode, setMode, compareView, setCompareView, variable, setVariable, variables, particles, setParticles,
    manifest, manifestError, variableSwitched } = wm;
  const current = variables.find((v) => v.id === variable);
  const modelColor = MODELS.find((m) => m.id === mode)?.color ?? '#818cf8';

  return (
    <>
      <LayerPanelSection
        title="Model"
        subtitle="Forecast model drawn on the map"
        collapsed={collapsed['wm-model']}
        onToggle={() => onToggleSection('wm-model')}
      >
        <div role="radiogroup" aria-label="Weather model" className={LIST}>
          {MODELS.map((m) => {
            const active = mode === m.id;
            const Icon = m.icon;
            return (
              <div key={m.id}>
                <button type="button" role="radio" aria-checked={active} onClick={() => setMode(m.id)} className={ROW}>
                  <IconBox active={active} color={m.color}>
                    {Icon
                      ? <Icon size={14} style={{ color: active ? m.color : '#a1a1aa' }} aria-hidden />
                      : <span aria-hidden className="w-2.5 h-2.5 rounded-full" style={{ background: m.color }} />}
                  </IconBox>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${active ? 'text-white' : 'text-sentinel-100'}`}>{m.label}</div>
                    <div className="text-[10px] text-sentinel-300 leading-snug line-clamp-2">{m.sublabel}</div>
                  </div>
                  <RadioDot active={active} color={m.color} />
                </button>
                {active && m.id === 'compare' && <CompareViewSelector value={compareView} onChange={setCompareView} />}
              </div>
            );
          })}
        </div>
      </LayerPanelSection>

      <LayerPanelSection
        title="Variable"
        subtitle={current ? `Showing ${current.label}` : 'Field drawn on the map'}
        collapsed={collapsed['wm-variable']}
        onToggle={() => onToggleSection('wm-variable')}
      >
        <div role="radiogroup" aria-label="Model variable" className={LIST}>
          {!manifest && !manifestError && <p className="px-2.5 py-2 text-xs text-sentinel-300">Loading model runs…</p>}
          {manifestError && !manifest && <p className="px-2.5 py-2 text-xs text-red-300">{manifestError.message}</p>}
          {variables.map((v) => {
            const active = v.id === variable;
            return (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!v.available}
                onClick={() => setVariable(v.id)}
                title={v.reason ?? v.description}
                className={`${ROW} disabled:cursor-not-allowed disabled:hover:bg-transparent`}
              >
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${
                    !v.available ? 'text-sentinel-500' : active ? 'text-white font-semibold' : 'text-sentinel-100 font-medium'}`}>
                    {v.label}
                  </div>
                  {v.reason && <div className="text-[10px] text-sentinel-400 leading-snug">{v.reason}</div>}
                </div>
                {active && <Check size={14} className="shrink-0" style={{ color: modelColor }} aria-hidden />}
              </button>
            );
          })}
        </div>
        {variableSwitched && (
          <p className="px-1 text-[11px] text-amber-300">
            Showing {current?.label}: the selected variable is {variableSwitched.toLowerCase()}.
          </p>
        )}
      </LayerPanelSection>

      {mode !== 'compare' && (
        <LayerPanelSection
          title="Overlays"
          collapsed={collapsed['wm-overlays']}
          onToggle={() => onToggleSection('wm-overlays')}
        >
          <div className={LIST}>
            <button type="button" onClick={() => setParticles(!particles)} aria-pressed={particles} aria-label="Toggle Wind particles" className={ROW}>
              <IconBox active={particles} color="#ff5a00" fill="26" edge="4d">
                <Wind size={14} style={{ color: particles ? '#ff5a00' : '#a1a1aa' }} aria-hidden />
              </IconBox>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${particles ? 'text-white' : 'text-sentinel-100'}`}>Wind particles</div>
                <div className="text-[10px] text-sentinel-300 leading-snug">Animated wind flow from the selected model</div>
              </div>
              <div className={`shrink-0 relative w-9 h-5 rounded-full transition-colors duration-200 ${particles ? 'bg-fire-600/25 ring-1 ring-inset ring-fire-600/50' : 'bg-sentinel-500'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${particles ? 'translate-x-4' : ''}`} />
              </div>
            </button>
          </div>
        </LayerPanelSection>
      )}
    </>
  );
}
