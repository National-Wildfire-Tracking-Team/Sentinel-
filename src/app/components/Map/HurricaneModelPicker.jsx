/**
 * HurricaneModelPicker.jsx
 * The model checklist under the "Spaghetti Models" button: the NHC official
 * forecast on its own, the operational models, the legacy (retired) models
 * kept apart, and the other guidance groups. Each row shows the run's
 * initialization time, or why there's no track (e.g. ECMWF isn't in NHC's
 * public data). Names, order and colors come from the model registry
 * (api/atcf/registry.mjs) and nowhere else.
 */

import { Check } from 'lucide-react';
import { GUIDANCE_GROUPS, HURRICANE_MODELS, MODEL_ORDER } from '../../api/nhcModelTracks';
import { formatRelativeTime } from '../../utils/formatUtils';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-08T06:00:00Z" → "06Z Oct 8" (model cycles are always named in UTC). */
function formatInitTime(iso) {
  const d = new Date(iso ?? '');
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCHours()).padStart(2, '0')}Z ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

const SECTIONS = [
  { key: 'official', title: null },
  { key: 'operational', title: 'Models' },
  { key: 'legacy', title: 'Legacy (historical)', note: 'Retired from operations; superseded by HAFS in 2023.' },
];

const STALE_REASON = {
  'upstream-unavailable': 'NOAA is not responding — showing the last data received.',
  'no-recent-guidance': 'No new guidance from NHC in over 18 hours.',
  'no-guidance': 'NHC has no guidance for this system.',
};

const ROW = 'flex min-h-[44px] w-full items-center gap-2 px-3 text-left text-sm text-white hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50';
const PILL = 'min-h-[32px] flex-1 rounded-md border border-white/10 px-2 text-xs font-semibold text-white hover:bg-white/10';

function Swatch({ color, dashed }) {
  return (
    <span
      aria-hidden
      className="inline-block w-4 shrink-0"
      style={{ borderTop: `3px ${dashed ? 'dashed' : 'solid'} ${color}` }}
    />
  );
}

function modelDetail(entry) {
  if (!entry) return 'Loading…';
  if (entry.status === 'unavailable') return entry.initTime ? `Expired · ${formatInitTime(entry.initTime)}` : 'Not available';
  const init = formatInitTime(entry.initTime);
  return entry.status === 'stale' ? `${init} · stale` : init;
}

/**
 * @param {object|null} data       normalized response (api/nhcModelTracks), null while loading
 * @param {string}      status     useNhcModelTracks status
 * @param {{models: string[], groups: string[]}} selection
 * @param {(next: {models: string[], groups: string[]}) => void} onChange
 */
export default function HurricaneModelPicker({ data, status, selection, onChange }) {
  const byId = Object.fromEntries((data?.models ?? []).map((m) => [m.id, m]));
  const drawable = (id) => byId[id] && byId[id].status !== 'unavailable';
  const groupCounts = Object.fromEntries(GUIDANCE_GROUPS.map((g) => [g.key, (data?.guidance ?? []).filter((t) => t.group === g.key).length]));

  const toggleModel = (id) => {
    const on = selection.models.includes(id);
    onChange({ ...selection, models: on ? selection.models.filter((m) => m !== id) : [...selection.models, id] });
  };
  const toggleGroup = (key) => {
    const on = selection.groups.includes(key);
    onChange({ ...selection, groups: on ? selection.groups.filter((g) => g !== key) : [...selection.groups, key] });
  };

  return (
    <div className="py-1" role="group" aria-label="Hurricane models">
      <div className="px-3 pt-1 pb-2 text-xs text-sentinel-200" aria-live="polite">
        {status === 'error' && !data ? 'Model data is unavailable right now.'
          : !data ? 'Loading model guidance…'
            : (
              <>
                <div>
                  NOAA/NHC ATCF · updated {formatRelativeTime(data.updatedAt)}
                  {data.asOf && <> · latest cycle {formatInitTime(data.asOf)}</>}
                </div>
                {data.stale && (
                  <div className="mt-1 text-amber-300">{STALE_REASON[data.staleReason] ?? 'This guidance may be out of date.'}</div>
                )}
              </>
            )}
      </div>

      <div className="flex gap-1.5 px-3 pb-2">
        <button
          type="button"
          className={PILL}
          onClick={() => onChange({ ...selection, models: MODEL_ORDER.filter(drawable) })}
        >
          All
        </button>
        <button type="button" className={PILL} onClick={() => onChange({ models: [], groups: [] })}>
          None
        </button>
        <button type="button" className={PILL} onClick={() => onChange({ models: ['OFCL'], groups: [] })}>
          Official only
        </button>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.key} className="border-t border-white/10 pt-1">
          {section.title && (
            <div className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-wide text-sentinel-300">{section.title}</div>
          )}
          {section.note && <div className="px-3 text-[11px] text-sentinel-300">{section.note}</div>}
          {MODEL_ORDER.filter((id) => HURRICANE_MODELS[id].category === section.key).map((id) => {
            const model = HURRICANE_MODELS[id];
            const entry = byId[id];
            const unavailable = Boolean(entry) && entry.status === 'unavailable';
            // Selected but trackless (ECMWF today) reads as off; it draws if a run appears.
            const checked = selection.models.includes(id) && !unavailable;
            const tech = entry?.technique ?? model.techniques[0];
            const detail = modelDetail(entry);
            return (
              <button
                key={id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                aria-label={`${model.name} (${tech}), ${detail}`}
                disabled={unavailable}
                title={entry?.error ?? model.description}
                onClick={() => toggleModel(id)}
                className={ROW}
              >
                <span className="w-4 shrink-0">{checked && <Check size={14} aria-hidden />}</span>
                <Swatch color={model.color} dashed={model.category === 'legacy' || entry?.status === 'stale'} />
                <span className={`flex-1 ${model.category === 'official' ? 'font-semibold' : ''}`}>
                  {model.name}
                  <span className="ml-1.5 text-[11px] font-normal text-sentinel-300">{tech}</span>
                </span>
                <span className={`text-[11px] ${entry?.status === 'stale' ? 'text-amber-300' : 'text-sentinel-200'}`}>
                  {detail}
                </span>
              </button>
            );
          })}
        </div>
      ))}

      <div className="border-t border-white/10 pt-1">
        <div className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-wide text-sentinel-300">Other guidance</div>
        {GUIDANCE_GROUPS.map((g) => {
          const checked = selection.groups.includes(g.key);
          return (
            <button
              key={g.key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
              aria-label={data ? `${g.label}, ${groupCounts[g.key]} tracks` : g.label}
              disabled={Boolean(data) && groupCounts[g.key] === 0 && !checked}
              onClick={() => toggleGroup(g.key)}
              className={ROW}
            >
              <span className="w-4 shrink-0">{checked && <Check size={14} aria-hidden />}</span>
              <Swatch color={g.color} />
              <span className="flex-1">{g.label}</span>
              {data && <span className="text-[11px] text-sentinel-200">{groupCounts[g.key]}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
