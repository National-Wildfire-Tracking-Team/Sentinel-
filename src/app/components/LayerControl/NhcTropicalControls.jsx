/**
 * NhcTropicalControls.jsx
 * Under the single "NHC Tropical" row in the layer panel, while it's on: one
 * switch per NHC product, in two groups, with the wind-probability threshold
 * picker nested under its switch. The row turns the whole set on or off;
 * these choose which parts draw.
 */

import { memo } from 'react';
import { AlertTriangle, Clock, Cone, Waves, Waypoints, Wind } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import NhcWindProbControls from './NhcWindProbControls';

export const NHC_SUBLAYER_GROUPS = [
  {
    label: 'Storms & outlook',
    layers: [
      { key: 'nhcTrack', label: 'Storm track', sublabel: 'Past & forecast track, intensity', icon: Waypoints, color: '#4dffff' },
      { key: 'nhcCone', label: 'Forecast cone', sublabel: 'Cone of uncertainty', icon: Cone, color: '#cbd5e1' },
      { key: 'nhcWatchWarning', label: 'Coastal watches & warnings', sublabel: 'Hurricane / tropical storm', icon: AlertTriangle, color: '#FF0000' },
      { key: 'nhcOutlook', label: 'Areas of interest', sublabel: '2- & 7-day formation outlook', icon: Wind, color: '#FFA040' },
    ],
  },
  {
    label: 'Wind & surge',
    layers: [
      { key: 'nhcWindProb', label: 'Wind probabilities', sublabel: '5-day chance of 34/50/64-kt winds', icon: Wind, color: '#e69800' },
      { key: 'nhcWindRadii', label: 'Wind radii', sublabel: 'Extent of 34/50/64-kt winds', icon: Wind, color: '#ff0000' },
      { key: 'nhcArrival', label: 'Arrival of TS winds', sublabel: 'Most likely arrival time', icon: Clock, color: '#ffffff' },
      { key: 'nhcSurge', label: 'Storm surge flooding', sublabel: 'U.S. landfall threats only', icon: Waves, color: '#0070ff' },
    ],
  },
];

function SubLayerSwitch({ layer, on, onToggle }) {
  const Icon = layer.icon;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="w-full flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-white/5 transition-colors"
    >
      <Icon size={12} className="shrink-0" style={{ color: on ? layer.color : undefined }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={`block text-[11px] font-semibold leading-tight ${on ? 'text-white' : 'text-sentinel-300'}`}>{layer.label}</span>
        <span className="block text-[9px] leading-tight text-sentinel-500 truncate">{layer.sublabel}</span>
      </span>
      <span
        className={`relative h-3.5 w-6 shrink-0 rounded-full transition-colors ${on ? 'bg-sky-500' : 'bg-sentinel-600'}`}
        aria-hidden
      >
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${on ? 'left-3' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

const NhcTropicalControls = memo(function NhcTropicalControls() {
  const { layers, toggleLayer } = useApp();
  if (!layers.nhcTropical) return null;

  return (
    <div className="px-2 py-2 bg-sentinel-800/70 border-t border-sentinel-700 space-y-2">
      {NHC_SUBLAYER_GROUPS.map((group) => (
        <div key={group.label} role="group" aria-label={group.label}>
          <div className="px-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-sentinel-400">{group.label}</div>
          {group.layers.map((layer) => (
            <div key={layer.key}>
              <SubLayerSwitch layer={layer} on={Boolean(layers[layer.key])} onToggle={() => toggleLayer(layer.key)} />
              {layer.key === 'nhcWindProb' && <NhcWindProbControls />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});

export default NhcTropicalControls;
