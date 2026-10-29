/**
 * MapBottomBar.jsx
 * Floating bottom toolbar for the live map: layer control on the left,
 * followed by the All Hazards / Wildfire / Weather / Models mode switcher.
 * Simplified Sentinel (`simplified`) has no Models tab.
 */

import { memo, forwardRef } from 'react';
import { AlertTriangle, Flame, CloudSun, Wind } from 'lucide-react';
import LayerControl from '../LayerControl/LayerControl';

const MapBottomBar = memo(forwardRef(function MapBottomBar({
  activeMapTab = 'wildfire',
  onTabChange,
  onModelsIntent,
  infrastructureLayersEntitled = false,
  fireDangerEntitled = false,
  routingEntitled = false,
  measureActive = false,
  measureMode = 'distance',
  onMeasureActivate,
  onMeasureClose,
  dockedPanelClearance = 0,
  dockedAttached = false,
  dockTabsShowing = false,
  simplified = false,
}, ref) {
  const isAllHazardTab = activeMapTab === 'allhazard';

  return (
    <div
      ref={ref}
      data-map-bottom-bar
      data-map-control=""
      // Top corners and edge fold square as the controls sheet is pulled up (index.css)
      data-sheet-aware=""
      // A panel docked open on the bar (the Models forecast time) keeps them square,
      // as does the drawer tab strip (DockSheet), which sits on the bar as its top
      // part: then the bar is at least as wide as the strip, so the two line up.
      style={dockTabsShowing
        ? { '--dock-sheet-fold': 1, minWidth: 'min(24rem, calc(100vw - 1rem))' }
        : dockedAttached ? { '--dock-sheet-fold': 1 } : undefined}
      className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-[var(--bar-z,20)] flex items-center justify-center gap-1 px-2 py-1.5 bg-white/90 dark:bg-sentinel-900/90 backdrop-blur-sm border border-sentinel-200 dark:border-sentinel-600 shadow-2xl shadow-black/10 dark:shadow-black/60 rounded-2xl`}
    >
      <LayerControl
        activeMapTab={activeMapTab}
        infrastructureLayersEntitled={infrastructureLayersEntitled}
        fireDangerEntitled={fireDangerEntitled}
        routingEntitled={routingEntitled}
        measureActive={measureActive}
        measureMode={measureMode}
        onMeasureActivate={onMeasureActivate}
        onMeasureClose={onMeasureClose}
        dockedPanelClearance={dockedPanelClearance}
        simplified={simplified}
      />

      <div className="w-px self-stretch my-1 bg-sentinel-200 dark:bg-sentinel-600" />

      <button
        type="button"
        aria-label="All Hazards"
        onClick={() => onTabChange?.('allhazard')}
        className={`inline-flex items-center gap-1.5 px-3 py-2 whitespace-nowrap text-sm font-bold rounded-xl transition-all duration-200 ${
          isAllHazardTab
            ? 'bg-red-600 text-white'
            : 'text-sentinel-600 dark:text-sentinel-200 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-sentinel-700'
        }`}
        aria-pressed={isAllHazardTab}
      >
        <AlertTriangle size={15} className={isAllHazardTab ? 'text-yellow-300' : 'text-sentinel-400 dark:text-sentinel-300'} />
        <span className="hidden sm:inline">All Hazards</span>
      </button>

      <button
        type="button"
        aria-label="Wildfire"
        onClick={() => onTabChange?.('wildfire')}
        className={`inline-flex items-center gap-1.5 px-3 py-2 whitespace-nowrap text-sm font-semibold rounded-xl transition-colors ${
          activeMapTab === 'wildfire'
            ? 'bg-fire-600/25 ring-1 ring-inset ring-fire-600/50 text-sentinel-900 dark:text-white'
            : 'text-sentinel-600 dark:text-sentinel-200 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-sentinel-700'
        }`}
        aria-pressed={activeMapTab === 'wildfire'}
      >
        <Flame size={15} />
        <span className="hidden sm:inline">Wildfire</span>
      </button>

      <button
        type="button"
        aria-label="Weather"
        onClick={() => onTabChange?.('weather')}
        className={`inline-flex items-center gap-1.5 px-3 py-2 whitespace-nowrap text-sm font-semibold rounded-xl transition-colors ${
          activeMapTab === 'weather'
            ? 'bg-sky-600 text-white'
            : 'text-sentinel-600 dark:text-sentinel-200 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-sentinel-700'
        }`}
        aria-pressed={activeMapTab === 'weather'}
      >
        <CloudSun size={15} />
        <span className="hidden sm:inline">Weather</span>
      </button>

      {/* HRRR/GFS numerical model forecasts — model output, kept apart from alerts and observations */}
      {!simplified && (
        <button
          type="button"
          aria-label="Models"
          onClick={() => onTabChange?.('models')}
          // Hover, focus or the start of a tap: fetch the first frame before the click lands.
          onPointerEnter={onModelsIntent}
          onPointerDown={onModelsIntent}
          onFocus={onModelsIntent}
          className={`inline-flex items-center gap-1.5 px-3 py-2 whitespace-nowrap text-sm font-semibold rounded-xl transition-colors ${
            activeMapTab === 'models'
              ? 'bg-indigo-600 text-white'
              : 'text-sentinel-600 dark:text-sentinel-200 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-sentinel-700'
          }`}
          aria-pressed={activeMapTab === 'models'}
          title="HRRR and GFS weather model forecasts"
        >
          <Wind size={15} />
          <span className="hidden sm:inline">Models</span>
        </button>
      )}
    </div>
  );
}));

export default MapBottomBar;
