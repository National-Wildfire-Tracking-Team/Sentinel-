/**
 * StormMapPopup.jsx
 * Popup for a tropical system clicked on the map — an NHC storm (cone, track
 * or position) or an outlook system (invest disturbance or area of
 * interest): name, what was clicked, category or formation chance, current
 * numbers, with actions — open its detail panel (chevron), point the
 * satellite layer at it, and show spaghetti model tracks by model group.
 * Same card, drag handle and close as MapFeaturePopup.
 */

import { memo } from 'react';
import { Popup } from 'react-map-gl';
import { ChevronRight } from 'lucide-react';
import { DISTURBANCE_COLORS, categoryColor } from '../../api/nhcTropicalWeather';
import { useInvestModelRun } from '../../hooks/useInvestModelRun';
import { CARD_BG, PopupFooter } from './MapFeaturePopup';
import SpaghettiModelsButton from './SpaghettiModelsButton';
import { useDragOffset } from './usePopupDrag';

const actionButton = 'min-h-[44px] rounded-lg border border-white/10 bg-white/5 text-sm font-semibold text-white hover:bg-white/10 transition-colors';

function stormSummary(storm) {
  const motion = storm.motionDir ? `${storm.motionDir} ${storm.motionMph} mph` : storm.movement;
  return {
    color: categoryColor(storm.category),
    tag: storm.category,
    stats: [storm.maxWindMph > 0 && `${storm.maxWindMph} mph`, storm.mslp != null && `${storm.mslp} mb`, motion]
      .filter(Boolean).join(' · '),
  };
}

function outlookSummary(system) {
  const pct = (v) => (v != null ? `${v}%` : '—');
  return {
    color: DISTURBANCE_COLORS[system.formationChance]?.fill ?? '#94a3b8',
    tag: system.formationChance ? `${system.formationChance[0]}${system.formationChance.slice(1).toLowerCase()} chance` : null,
    stats: `Formation: 2-day ${pct(system.day2Percent)} · 7-day ${pct(system.day7Percent)}`,
  };
}

/** Spaghetti for an outlook system: its invest's model runs, found by position. */
function OutlookSpaghetti({ system }) {
  const run = useInvestModelRun(system);
  return <SpaghettiModelsButton atcfId={run.atcfId} finding={run.status === 'searching'} />;
}

/**
 * @param {'storm'|'outlook'} kind
 * @param {object}   system     cyclone from buildCyclones, or outlook system from buildOutlookSystems
 * @param {string}   via        what was clicked ("Cone of uncertainty")
 * @param {{ lng: number, lat: number }} lngLat
 * @param {object}   prefs      display preferences (popupDragHandle)
 */
const StormMapPopup = memo(function StormMapPopup({
  kind = 'storm', system, via, lngLat, prefs, onOpen, onShowSatellite, onClose,
}) {
  const { offset, onPointerDown, onPointerMove, onPointerUp } = useDragOffset(system.id);
  const { color, tag, stats } = kind === 'storm' ? stormSummary(system) : outlookSummary(system);

  return (
    <Popup
      longitude={lngLat.lng}
      latitude={lngLat.lat}
      closeButton={false}
      closeOnClick={false}
      anchor="bottom"
      offset={[0, -8]}
      onClose={onClose}
      className="sentinel-popup"
    >
      <div
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, background: CARD_BG }}
        className="w-[288px] overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
        aria-label={`${system.name} on the map`}
        role="dialog"
      >
        <button
          type="button"
          onClick={() => onOpen(system)}
          aria-label={`Open ${system.name} details`}
          className="flex w-full items-stretch gap-3 px-3 py-3 text-left hover:bg-white/5"
        >
          <span className="w-1 shrink-0 rounded-full" style={{ background: color }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold leading-snug text-white">{system.name}</span>
            <span className="mt-0.5 block text-[13px] text-sentinel-200">
              {via}{via && tag && ' · '}{tag && <span className="font-semibold" style={{ color }}>{tag}</span>}
            </span>
            <span className="mt-0.5 block text-[12px] text-sentinel-300 tabular-nums">{stats}</span>
          </span>
          <ChevronRight size={18} className="shrink-0 self-center text-white/50" />
        </button>

        <div className="space-y-2 px-3 pb-3">
          <button type="button" onClick={() => onShowSatellite(system)} className={`w-full ${actionButton}`}>
            Show on Satellite
          </button>
          {kind === 'storm'
            ? <SpaghettiModelsButton atcfId={system.atcfId} />
            : <OutlookSpaghetti system={system} />}
        </div>

        <div className="mx-3 h-px bg-white/10" />
        <PopupFooter
          dragEnabled={prefs?.popupDragHandle}
          dragHandlers={{ onPointerDown, onPointerMove, onPointerUp }}
          onClose={onClose}
        />
      </div>
    </Popup>
  );
});

export default StormMapPopup;
