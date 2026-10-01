/**
 * MapBottomBar.jsx
 * Floating bottom toolbar for the live map: layer control on the left,
 * followed by the All Hazards / Wildfire / Weather mode switcher.
 */

import { memo, forwardRef } from 'react';
import { AlertTriangle, Flame, CloudSun } from 'lucide-react';
import LayerControl from '../LayerControl/LayerControl';

const MapBottomBar = memo(forwardRef(function MapBottomBar({
  activeMapTab = 'wildfire',
  onTabChange,
  infrastructureLayersEntitled = false,
  measureActive = false,
  measureMode = 'distance',
  onMeasureActivate,
  onMeasureClose,
  dockedAttached = false,
  dockedPanelClearance = 0,
}, ref) {
  const isAllHazardTab = activeMapTab === 'allhazard';

  return (
    <div
      ref={ref}
      className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1.5 bg-white/90 dark:bg-sentinel-900/90 backdrop-blur-sm border border-sentinel-200 dark:border-sentinel-600 shadow-2xl shadow-black/10 dark:shadow-black/60 ${
        dockedAttached ? 'rounded-b-2xl border-t-0' : 'rounded-2xl'
      }`}
    >
      <LayerControl
        activeMapTab={activeMapTab}
        infrastructureLayersEntitled={infrastructureLayersEntitled}
        measureActive={measureActive}
        measureMode={measureMode}
        onMeasureActivate={onMeasureActivate}
        onMeasureClose={onMeasureClose}
        dockedPanelClearance={dockedPanelClearance}
      />

      <div className="w-px self-stretch my-1 bg-sentinel-200 dark:bg-sentinel-600" />

      <button
        type="button"
        onClick={() => onTabChange?.('allhazard')}
        className={`inline-flex items-center gap-1.5 px-3 py-2 whitespace-nowrap text-sm font-bold rounded-xl transition-all duration-200 ${
          isAllHazardTab
            ? 'bg-gradient-to-r from-fire-600 via-red-600 to-sky-700 text-white shadow-lg shadow-red-900/30'
            : 'text-sentinel-600 dark:text-sentinel-200 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-sentinel-700'
        }`}
        aria-pressed={isAllHazardTab}
      >
        <AlertTriangle size={15} className={isAllHazardTab ? 'text-yellow-300' : 'text-sentinel-400 dark:text-sentinel-300'} />
        <span className="hidden sm:inline">All Hazards</span>
      </button>

      <button
        type="button"
        onClick={() => onTabChange?.('wildfire')}
        className={`inline-flex items-center gap-1.5 px-3 py-2 whitespace-nowrap text-sm font-semibold rounded-xl transition-colors ${
          activeMapTab === 'wildfire'
            ? 'bg-fire-600 text-white'
            : 'text-sentinel-600 dark:text-sentinel-200 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-sentinel-700'
        }`}
        aria-pressed={activeMapTab === 'wildfire'}
      >
        <Flame size={15} />
        <span className="hidden sm:inline">Wildfire</span>
      </button>

      <button
        type="button"
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
    </div>
  );
}));

export default MapBottomBar;
