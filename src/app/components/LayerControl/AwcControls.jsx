/**
 * AwcControls.jsx
 * Aviation Weather Center settings, in the bottom bar's pull-up sheet
 * (DockSheet, via MapDockSheet) under the "Aviation Weather" tab while that
 * layer is on: one switch per AWC product and per hazard (api/awc/awc.js
 * AWC_GROUPS), each with a status line once on, and the text products read
 * right here under their switch. The layer panel's single "Aviation Weather
 * Center" row turns the whole set on or off; these choose which parts show.
 */

import { memo } from 'react';
import {
  AlertTriangle, Building2, CloudLightning, CloudFog, Compass, FileText, Globe, Landmark, Megaphone, Mountain,
  Plane, PlaneLanding, RadioTower, ScrollText, Snowflake, Triangle, Waypoints, Wind,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAwcContext } from '../../context/AwcContext';
import { AWC_GROUPS, AWC_HAZARD_TOGGLES, AWC_MAX_RESULTS, hazardStyle } from '../../api/awc/awc';
import {
  AREAFCST_REGIONS, FCSTDISC_TYPES, NWS_OFFICES, WINDTEMP_FORECASTS, WINDTEMP_LEVELS, WINDTEMP_REGIONS,
} from '../../api/awc/textProducts';
import { formatRelativeTime } from '../../utils/formatUtils';
import { SubLayerSwitch } from './NhcTropicalControls';

/** A small filled swatch in the hazard's map colour, in place of an icon. */
function makeSwatch(color) {
  return function HazardSwatch({ className = '' }) {
    return <span className={`inline-block h-3 w-3 rounded-[3px] ring-1 ring-inset ring-black/30 ${className}`} style={{ backgroundColor: color }} aria-hidden />;
  };
}

const ICONS = {
  awcMetarTaf: PlaneLanding,
  awcPirep: Plane,
  awcSigmetUs: AlertTriangle,
  awcSigmetIntl: Globe,
  awcCwa: Megaphone,
  awcGairmetSierra: CloudFog,
  awcGairmetTango: Wind,
  awcGairmetZulu: Snowflake,
  awcAirmetAk: Mountain,
  awcTcf: CloudLightning,
  awcWindTemp: Wind,
  awcFcstDisc: FileText,
  awcMis: ScrollText,
  awcAreaFcst: FileText,
  awcAirports: PlaneLanding,
  awcStations: RadioTower,
  awcNavaids: Compass,
  awcFixes: Waypoints,
  awcObstacles: Triangle,
  awcFeatures: Landmark,
  ...Object.fromEntries(AWC_HAZARD_TOGGLES.map((t) => [t.key, makeSwatch(hazardStyle(t.hz[0]).color)])),
};

const NOUNS = {
  awcMetarTaf: 'stations', awcPirep: 'reports', awcAirports: 'airports', awcStations: 'stations',
  awcNavaids: 'navaids', awcFixes: 'fixes', awcObstacles: 'obstacles', awcFeatures: 'landmarks',
};

/** [text, isWarning] for a map switch's status line. */
function statusText(layerKey, layer, status, awc) {
  if (status.needsZoom) return [`Zoom in to see ${layer.label.toLowerCase()} (zoom ${layer.minZoom}+)`];
  if (status.loading) return ['Loading…'];
  if (status.error) return [`Couldn't load from AWC · ${status.error.message}`, true];
  if (status.count == null) return [null];
  const noun = NOUNS[layerKey] ?? 'shapes';
  if (status.count === 0) return [layer.minZoom ? 'None returned for this view' : NOUNS[layerKey] ? 'None reported' : 'None in effect'];
  if (status.truncated) {
    return [layer.minZoom
      ? `Showing the first ${AWC_MAX_RESULTS} ${noun} · zoom in for the rest`
      : `Showing ${AWC_MAX_RESULTS} ${noun}, AWC's limit per request · some may be missing`];
  }
  // Hazard switches that are off hide some of a source's shapes; say how many.
  const hiddenCount = NOUNS[layerKey]
    ? 0
    : awc.sources[layerKey].features.filter((f) => !awc.hazardFilter.includes(f.properties.hz)).length;
  const when = status.fetchedAt ? ` · updated ${formatRelativeTime(status.fetchedAt).toLowerCase()}` : '';
  const label = status.count === 1 ? noun.replace(/s$/, '') : noun;
  return [`${status.count.toLocaleString('en-US')} ${label}${hiddenCount ? ` · ${hiddenCount} hidden by hazard switches` : ''}${when}`];
}

function StatusLine({ layerKey, layer, status, awc }) {
  if (!status) return null;
  const [text, warn] = statusText(layerKey, layer, status, awc);
  if (!text) return null;
  return (
    <div className={`pl-[26px] pr-1.5 -mt-0.5 pb-1 text-[9px] leading-tight ${warn ? 'text-amber-400' : 'text-sentinel-500'}`} role="status">
      {text}
    </div>
  );
}

function Chips({ label, options, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`h-6 px-2 rounded-md text-[10px] font-semibold border transition-colors active:scale-[0.97] ${on
              ? 'bg-sky-500/20 text-white border-sky-500/50'
              : 'bg-sentinel-900 text-sentinel-300 border-sentinel-600 hover:bg-sentinel-700 hover:text-white'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Select({ label, value, onChange, children }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-6 max-w-full rounded-md border border-sentinel-600 bg-sentinel-900 px-1.5 text-[10px] text-sentinel-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
    >
      {children}
    </select>
  );
}

function TextReader({ text, empty, loading, error }) {
  let body;
  if (loading && text == null) body = <p className="text-[10px] text-sentinel-500">Loading…</p>;
  else if (error && text == null) body = <p className="text-[10px] text-amber-400">Couldn&apos;t load from AWC · {error.message}</p>;
  else if (!text) body = <p className="text-[10px] text-sentinel-400">{empty}</p>;
  else {
    body = (
      <pre className="max-h-56 overflow-auto scrollbar-panel rounded-md bg-black/30 border border-sentinel-700 p-2 text-[10px] leading-snug text-sentinel-100 font-mono whitespace-pre">
        {text.trim()}
      </pre>
    );
  }
  return <div className="mt-1">{body}</div>;
}

/** The reader (and its choices) under a text product's switch. */
function TextProduct({ layerKey, awc }) {
  const { settings, setSetting, text, status } = awc;
  const st = status[layerKey] || {};
  const common = { text: text[layerKey], loading: st.loading || (!text[layerKey] && !st.error), error: st.error };

  if (layerKey === 'awcWindTemp') {
    const s = settings.windtemp;
    return (
      <div className="pl-[26px] pr-1.5 pb-2 space-y-1.5">
        <Select label="Winds aloft region" value={s.region} onChange={(region) => setSetting('windtemp', { region })}>
          {WINDTEMP_REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>
        <Chips label="Altitudes" options={WINDTEMP_LEVELS} value={s.level} onChange={(level) => setSetting('windtemp', { level })} />
        <Chips label="Forecast" options={WINDTEMP_FORECASTS} value={s.fcst} onChange={(fcst) => setSetting('windtemp', { fcst })} />
        <p className="text-[9px] leading-snug text-sentinel-500">
          Each cell is DDSS±TT: direction (tens of °), speed (kt), temperature (°C). 9900 = light and variable.
        </p>
        <TextReader {...common} empty="No winds aloft forecast returned." />
      </div>
    );
  }
  if (layerKey === 'awcFcstDisc') {
    const s = settings.fcstdisc;
    return (
      <div className="pl-[26px] pr-1.5 pb-2 space-y-1.5">
        <Select label="NWS office" value={s.office} onChange={(office) => setSetting('fcstdisc', { office })}>
          <option value="auto">Nearest the map center{awc.autoOffice ? ` · ${awc.autoOffice.name}` : ''}</option>
          {NWS_OFFICES.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.id})</option>)}
        </Select>
        <Chips label="Discussion part" options={FCSTDISC_TYPES} value={s.type} onChange={(type) => setSetting('fcstdisc', { type })} />
        <TextReader {...common} empty="This office hasn't issued a discussion in the last 6 hours." />
      </div>
    );
  }
  if (layerKey === 'awcAreaFcst') {
    const s = settings.areafcst;
    return (
      <div className="pl-[26px] pr-1.5 pb-2 space-y-1.5">
        <Select label="Alaska region" value={s.region} onChange={(region) => setSetting('areafcst', { region })}>
          {AREAFCST_REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>
        <TextReader {...common} empty="No area forecast returned for this region." />
      </div>
    );
  }
  // awcMis: every center's statements in effect.
  return (
    <div className="pl-[26px] pr-1.5 pb-2">
      <TextReader {...common} empty="No impact statements in effect." />
    </div>
  );
}

const AwcControls = memo(function AwcControls() {
  const { layers, toggleLayer, setLayer } = useApp();
  const awc = useAwcContext();
  if (!layers.awc || !awc) return null;

  const setAllHazards = (value) => AWC_HAZARD_TOGGLES.forEach((t) => setLayer(t.key, value));
  const allHazardsOn = AWC_HAZARD_TOGGLES.every((t) => layers[t.key]);

  return (
    <div className="px-2 pt-1 pb-2.5 space-y-2" role="group" aria-label="Aviation Weather Center settings">
      {AWC_GROUPS.map((group) => (
        <div key={group.label} role="group" aria-label={group.label}>
          <div className="flex items-center justify-between px-1.5 pb-0.5">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-sentinel-400">{group.label}</span>
            {group.hazards && (
              <button
                type="button"
                onClick={() => setAllHazards(!allHazardsOn)}
                className="text-[9px] font-semibold text-sky-400 hover:text-sky-300 active:opacity-70"
              >
                {allHazardsOn ? 'Hide all' : 'Show all'}
              </button>
            )}
          </div>
          {group.layers.map((layer) => {
            const on = Boolean(layers[layer.key]);
            const count = layer.kind === 'hazard' ? awc.hazardCounts[layer.key] : 0;
            const row = {
              ...layer,
              icon: ICONS[layer.key] ?? Building2,
              sublabel: layer.kind === 'hazard' && on && count ? `${layer.sublabel} · ${count} on map` : layer.sublabel,
            };
            return (
              <div key={layer.key}>
                <SubLayerSwitch layer={row} on={on} onToggle={() => toggleLayer(layer.key)} />
                {on && layer.kind === 'map' && <StatusLine layerKey={layer.key} layer={layer} status={awc.status[layer.key]} awc={awc} />}
                {on && layer.kind === 'text' && <TextProduct layerKey={layer.key} awc={awc} />}
              </div>
            );
          })}
        </div>
      ))}
      <p className="px-1.5 text-[9px] leading-snug text-sentinel-500">
        From the NOAA Aviation Weather Center (aviationweather.gov). For situational awareness, not a flight briefing.
      </p>
    </div>
  );
});

export default AwcControls;
