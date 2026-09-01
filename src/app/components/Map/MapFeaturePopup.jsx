/**
 * MapFeaturePopup.jsx
 * Floating popup shown when a map click hits more than one feature at the
 * same point (e.g. an evacuation zone overlapping a fire perimeter).
 * Picking an item opens it in the full FireDetailPanel, same as a normal
 * single-feature click. Behavior is driven by the user's display
 * preferences: Map Popup UI (list vs. single/carousel), Popup Spotlight
 * (dims the map outside the clicked polygon), and Popup Drag Handle (lets
 * the popup be dragged aside to see the map underneath).
 */

import { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Popup } from 'react-map-gl';
import { Grip, ChevronRight, X, Radar } from 'lucide-react';
import { getGeometryCenter, nearestPointFeatures } from '../../utils/mapGeometry';
import { nwsAlertColor } from '../../utils/nwsColors';
import SpotlightMaskLayer from './layers/SpotlightMaskLayer';

const CARD_BG = '#101d3a';
const DEFAULT_ACCENT = '#ff5a00';

const TYPE_LABELS = {
  hotspot: 'Fire hotspot',
  perimeter: 'Fire perimeter',
  incident: 'Fire incident',
  aqi: 'Air quality station',
  'weather-alert': 'Weather alert',
  'user-report': 'Community report',
  'hazard-event': 'Event report',
  'evacuation-zone': 'Evacuation zone',
  'reporter-evacuation-zone': 'Reporter evacuation zone',
  'transmission-line': 'Transmission line',
  'gas-pipeline': 'Gas pipeline',
  'national-map-college': 'School / university',
};

function getTitle(item) {
  if (item.type === 'weather-alert') return item.eventType || item.headline || 'Weather alert';
  return item.name || item.title || item.zoneName || TYPE_LABELS[item.type] || 'Item';
}

function getAccentColor(item) {
  if (item.type === 'weather-alert') return nwsAlertColor(item.eventType);
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

function getSubtitle(item) {
  if (item.type === 'weather-alert' && item.expires) {
    const rel = formatExpiresIn(item.expires);
    if (rel) return { prefix: 'Expires ', bold: rel };
  }
  const typeLabel = TYPE_LABELS[item.type] || 'Item';
  if (getTitle(item) !== typeLabel) return { prefix: typeLabel, bold: null };
  return null;
}

/** Tracks a pointer-drag delta, reset whenever `resetKey` changes. */
function useDragOffset(resetKey) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

  useEffect(() => {
    setOffset({ x: 0, y: 0 });
  }, [resetKey]);

  const onPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: offset.x, originY: offset.y };
  }, [offset]);

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    const { startX, startY, originX, originY } = dragRef.current;
    setOffset({ x: originX + (e.clientX - startX), y: originY + (e.clientY - startY) });
  }, []);

  const onPointerUp = useCallback((e) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  return { offset, onPointerDown, onPointerMove, onPointerUp };
}

function ItemHeader({ item }) {
  const title = getTitle(item);
  const subtitle = getSubtitle(item);
  return (
    <span className="flex-1 min-w-0 flex items-center justify-between gap-2">
      <span className="min-w-0">
        <div className="text-white font-semibold text-[15px] leading-snug truncate">{title}</div>
        {subtitle && (
          <div className="text-[13px] text-sentinel-200 mt-0.5">
            {subtitle.prefix}
            {subtitle.bold && <span className="font-semibold text-white">{subtitle.bold}</span>}
          </div>
        )}
      </span>
      <ChevronRight size={18} className="text-white/50 shrink-0" />
    </span>
  );
}

function ListRow({ item, onSelect }) {
  const title = getTitle(item);
  const subtitle = getSubtitle(item);
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="w-full flex items-stretch gap-3 px-3 py-2 text-left hover:bg-white/5 transition-colors"
    >
      <span className="w-1 rounded-full shrink-0" style={{ background: getAccentColor(item) }} />
      <span className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <span className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">{title}</div>
          {subtitle && (
            <div className="text-xs text-sentinel-300 mt-0.5">
              {subtitle.prefix}
              {subtitle.bold && <span className="font-semibold text-white">{subtitle.bold}</span>}
            </div>
          )}
        </span>
        <ChevronRight size={15} className="text-white/40 shrink-0" />
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

function PopupFooter({ dragEnabled, dragHandlers, radarSites, onSelectRadarSite, onClose }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {dragEnabled && (
        <button
          type="button"
          onPointerDown={dragHandlers.onPointerDown}
          onPointerMove={dragHandlers.onPointerMove}
          onPointerUp={dragHandlers.onPointerUp}
          aria-label="Drag popup"
          className="p-1 -ml-1 rounded text-sentinel-300 hover:text-white cursor-grab active:cursor-grabbing touch-none"
        >
          <Grip size={16} />
        </button>
      )}
      {radarSites.length > 0 && (
        <div className="flex items-center gap-1.5">
          {radarSites.map((site) => (
            <button
              key={site.id}
              type="button"
              onClick={() => onSelectRadarSite(site)}
              title={site.name}
              className="flex items-center gap-1 pl-1.5 pr-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
            >
              <Radar size={13} />
              {site.id}
            </button>
          ))}
        </div>
      )}
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
  items, mouseLngLat, anchorFeature, prefs, nexradSitesGeoJSON, onSelect, onSelectRadarSite, onClose,
}) {
  const { offset, onPointerDown, onPointerMove, onPointerUp } = useDragOffset(items);

  const anchor = prefs.dataPickerAnchor === 'center'
    ? (getGeometryCenter(anchorFeature?.geometry) ?? [mouseLngLat.lng, mouseLngLat.lat])
    : [mouseLngLat.lng, mouseLngLat.lat];

  const radarSites = useMemo(() => {
    if (!nexradSitesGeoJSON) return [];
    return nearestPointFeatures(anchor, nexradSitesGeoJSON, 2).map((f) => ({
      id: f.properties.id,
      name: f.properties.name,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      properties: f.properties,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nexradSitesGeoJSON, anchor[0], anchor[1]]);

  if (!items?.length) return null;

  const handleSelectRadarSite = (site) => {
    onSelectRadarSite({ ...site.properties, lat: site.lat, lng: site.lng });
    onClose();
  };

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
          style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, background: CARD_BG }}
          className="rounded-2xl border border-white/10 shadow-2xl min-w-[240px] max-w-[300px] overflow-hidden"
        >
          {prefs.mapPopupMode === 'single' ? (
            <SingleCarousel items={items} onSelect={onSelect} />
          ) : (
            <div className="max-h-64 overflow-y-auto py-1">
              {items.map((item, i) => (
                <ListRow key={item.id ?? i} item={item} onSelect={onSelect} />
              ))}
            </div>
          )}

          <div className="h-px bg-white/10 mx-3" />

          <PopupFooter
            dragEnabled={prefs.popupDragHandle}
            dragHandlers={{ onPointerDown, onPointerMove, onPointerUp }}
            radarSites={radarSites}
            onSelectRadarSite={handleSelectRadarSite}
            onClose={onClose}
          />
        </div>
      </Popup>
    </>
  );
});

export default MapFeaturePopup;
