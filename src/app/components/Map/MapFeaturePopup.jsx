/**
 * MapFeaturePopup.jsx
 * Floating popup shown when a map click hits more than one feature at the
 * same point (e.g. an evacuation zone overlapping a fire perimeter).
 * Picking an item opens it in the full FireDetailPanel, same as a normal
 * single-feature click. Behavior is driven by the user's display
 * preferences: Map Popup UI (list vs. single/carousel), Popup Spotlight
 * (dims the map outside the clicked polygon), and Popup Draggability (lets
 * the popup be dragged aside, by any part of it, to see the map underneath).
 */

import { memo, useState, useEffect, useRef } from 'react';
import { Popup } from 'react-map-gl';
import { ChevronRight, X } from 'lucide-react';
import { getGeometryCenter } from '../../utils/mapGeometry';
import { nwsAlertColor } from '../../utils/nwsColors';
import { categoryColor } from '../../api/nhcTropicalWeather';
import { awcAccentColor } from '../../api/awc/awc';
import { tfrTypeStyle } from '../../api/tfr';
import { wuiHazardColor } from '../../utils/colorUtils';
import SpotlightMaskLayer from './layers/SpotlightMaskLayer';
import { usePopupDrag } from './usePopupDrag';

export const CARD_BG = '#101d3a';
const DEFAULT_ACCENT = '#ff5a00';

const TYPE_LABELS = {
  hotspot: 'Fire hotspot',
  perimeter: 'Fire perimeter',
  incident: 'Fire incident',
  aqi: 'Air quality station',
  'weather-alert': 'Weather alert',
  'user-report': 'Fire incident',
  'hazard-event': 'Event report',
  'evacuation-zone': 'Evacuation zone',
  'reporter-evacuation-zone': 'Reporter evacuation zone',
  'transmission-line': 'Transmission line',
  'gas-pipeline': 'Gas pipeline',
  'national-map-college': 'School / university',
  wui: 'Wildland-Urban Interface',
  'flood-hazard': 'FEMA flood hazard',
  'nhc-storm': 'Tropical cyclone',
  'fire-danger-point': 'Fire danger & fuels',
  awc: 'Aviation weather',
  tfr: 'Flight restriction (TFR)',
};

function getTitle(item) {
  if (item.type === 'weather-alert') return item.eventType || item.headline || 'Weather alert';
  if (item.type === 'fire-danger-point') return item.sfp?.sfpLabel ? `Fire potential: ${item.sfp.sfpLabel}` : TYPE_LABELS[item.type];
  return item.name || item.title || item.zoneName || TYPE_LABELS[item.type] || 'Item';
}

const HISTORICAL_ACCENT = '#6b7280';

function getAccentColor(item) {
  if (item.historical) return HISTORICAL_ACCENT;
  if (item.type === 'weather-alert') return nwsAlertColor(item.eventType);
  if (item.type === 'nhc-storm') return categoryColor(item.category);
  if (item.type === 'fire-danger-point' && item.sfp?.sfpColor) return item.sfp.sfpColor;
  if (item.type === 'awc') return awcAccentColor(item) ?? DEFAULT_ACCENT;
  if (item.type === 'tfr') return tfrTypeStyle(item.tfrType).color;
  if (item.type === 'wui') return wuiHazardColor(item.hazard);
  return DEFAULT_ACCENT;
}

/** "in 8 hours" / "in 45 minutes" / "Expired" — used for a weather alert's expiration subtitle. */
function formatExpiresIn(expires) {
  if (!expires) return null;
  const diffMs = new Date(expires) - Date.now();
  if (!Number.isFinite(diffMs)) return null;
  if (diffMs <= 0) return 'Expired';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `in ${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

const EXPIRING_SOON_MS = 30 * 60 * 1000;

function getSubtitle(item) {
  if (item.historical) return { prefix: 'Previous mapping', bold: null };
  if (item.type === 'weather-alert' && item.expires) {
    const rel = formatExpiresIn(item.expires);
    if (rel === 'Expired') return { prefix: 'Expired', bold: null, tone: 'text-sentinel-400' };
    if (rel) {
      const soon = new Date(item.expires) - Date.now() < EXPIRING_SOON_MS;
      return { prefix: 'Ends ', bold: rel, tone: soon ? 'text-orange-300' : null };
    }
  }
  const typeLabel = TYPE_LABELS[item.type] || 'Item';
  if (getTitle(item) !== typeLabel) return { prefix: typeLabel, bold: null };
  return null;
}

/** First affected area (+N more) and issuing office — a weather alert's "where". */
function getAlertWhere(item) {
  if (item.type !== 'weather-alert') return null;
  const areas = String(item.affectedArea || '').split(/;\s*/).filter(Boolean);
  const area = areas.length ? `${areas[0]}${areas.length > 1 ? ` +${areas.length - 1}` : ''}` : null;
  return [area, item.senderName].filter(Boolean).join(' · ') || null;
}

const SEVERITY_DOT = { Extreme: 'bg-red-400', Severe: 'bg-orange-400' };

function SeverityTag({ item }) {
  if (item.type !== 'weather-alert' || !SEVERITY_DOT[item.severity]) return null;
  return (
    <span className="inline-flex items-center gap-1 shrink-0 px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-wide bg-white/10 text-white/80">
      <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[item.severity]}`} />
      {item.severity}
    </span>
  );
}

function Subtitle({ subtitle, className }) {
  if (!subtitle) return null;
  return (
    <div className={`${className} ${subtitle.tone || ''}`}>
      {subtitle.prefix}
      {subtitle.bold && <span className={`font-semibold ${subtitle.tone || 'text-white'}`}>{subtitle.bold}</span>}
    </div>
  );
}

function ItemHeader({ item }) {
  const title = getTitle(item);
  const subtitle = getSubtitle(item);
  const where = getAlertWhere(item);
  return (
    <span className="flex-1 min-w-0 flex items-center justify-between gap-2">
      <span className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`font-semibold text-[15px] leading-snug truncate ${item.historical ? 'text-sentinel-300' : 'text-white'}`}>{title}</span>
          <SeverityTag item={item} />
        </div>
        {where && <div className="text-[12px] text-sentinel-300 mt-0.5 truncate">{where}</div>}
        <Subtitle subtitle={subtitle} className="text-[13px] text-sentinel-200 mt-0.5" />
      </span>
      <ChevronRight size={18} className="text-white/50 shrink-0" />
    </span>
  );
}

function ListRow({ item, onSelect }) {
  const title = getTitle(item);
  const subtitle = getSubtitle(item);
  const where = getAlertWhere(item);
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="group w-full flex items-stretch gap-3 px-3 py-2 text-left hover:bg-white/[0.06] transition-colors"
    >
      <span className="w-1 rounded-full shrink-0" style={{ background: getAccentColor(item) }} />
      <span className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <span className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-sm font-semibold truncate ${item.historical ? 'text-sentinel-300' : 'text-white'}`}>{title}</span>
            <SeverityTag item={item} />
          </div>
          {where && <div className="text-[11px] text-sentinel-400 mt-0.5 truncate">{where}</div>}
          <Subtitle subtitle={subtitle} className="text-xs text-sentinel-300 mt-0.5" />
        </span>
        <ChevronRight size={15} className="text-white/30 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all shrink-0" />
      </span>
    </button>
  );
}

function SingleCarousel({ items, onSelect }) {
  const [index, setIndex] = useState(0);
  const swipeRef = useRef(null);

  useEffect(() => { setIndex(0); }, [items]);

  const clamp = (i) => Math.max(0, Math.min(items.length - 1, i));

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    swipeRef.current = { startX: e.clientX };
  };
  const onPointerUp = (e) => {
    if (!swipeRef.current) return;
    const dx = e.clientX - swipeRef.current.startX;
    swipeRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const THRESHOLD = 30;
    if (dx <= -THRESHOLD) setIndex((i) => clamp(i + 1));
    else if (dx >= THRESHOLD) setIndex((i) => clamp(i - 1));
    else onSelect(items[index]);
  };

  const item = items[index];

  return (
    <>
      <div
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        // Swiping here flicks between items, so it never drags the popup.
        data-popup-no-drag=""
        className="flex items-stretch gap-3 px-3 py-3 cursor-pointer select-none touch-pan-y"
      >
        <span className="w-1 rounded-full shrink-0" style={{ background: getAccentColor(item) }} />
        <ItemHeader item={item} />
      </div>
      {items.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 pb-3">
          {items.map((it, i) => (
            <button
              key={it.id ?? i}
              type="button"
              aria-label={`Item ${i + 1} of ${items.length}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-4 bg-fire-500' : 'w-1.5 bg-white/25 hover:bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
    </>
  );
}

export function PopupFooter({ onClose }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="flex-1" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="p-1 rounded text-sentinel-300 hover:text-white transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
}

const MapFeaturePopup = memo(function MapFeaturePopup({
  items, mouseLngLat, anchorFeature, prefs, onSelect, onClose,
}) {
  const drag = usePopupDrag(items, prefs.popupDragHandle);

  const anchor = prefs.dataPickerAnchor === 'center'
    ? (getGeometryCenter(anchorFeature?.geometry) ?? [mouseLngLat.lng, mouseLngLat.lat])
    : [mouseLngLat.lng, mouseLngLat.lat];

  if (!items?.length) return null;

  return (
    <>
      {prefs.popupSpotlight && (
        <SpotlightMaskLayer geometry={anchorFeature?.geometry} opacity={prefs.spotlightOpacity / 100} />
      )}
      <Popup
        longitude={anchor[0]}
        latitude={anchor[1]}
        closeButton={false}
        closeOnClick={false}
        anchor="bottom"
        offset={[0, -8]}
        onClose={onClose}
        className="sentinel-popup"
      >
        <div
          {...drag.dragProps}
          style={{ translate: drag.translate, background: CARD_BG }}
          className={`rounded-2xl border border-white/10 shadow-2xl min-w-[260px] max-w-[320px] overflow-hidden ${drag.dragClass} ${drag.enabled ? 'touch-none' : ''}`}
        >
          {prefs.mapPopupMode === 'single' ? (
            <SingleCarousel items={items} onSelect={onSelect} />
          ) : (
            <>
              <div className="px-4 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-sentinel-400">
                {items.length} {items.length === 1 ? 'feature' : 'features'} here
              </div>
              <div className="max-h-64 overflow-y-auto scrollbar-thin pb-1 divide-y divide-white/5 touch-pan-y">
                {items.map((item, i) => (
                  <ListRow key={item.id ?? i} item={item} onSelect={onSelect} />
                ))}
              </div>
            </>
          )}

          <div className="h-px bg-white/10 mx-3" />

          <PopupFooter onClose={onClose} />
        </div>
      </Popup>
    </>
  );
});

export default MapFeaturePopup;
