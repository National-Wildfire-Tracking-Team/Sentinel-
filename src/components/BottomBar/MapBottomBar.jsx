/**
 * MapBottomBar.jsx
 * Floating bottom toolbar for the live map: layer control on the left,
 * followed by the All Hazards / Wildfire / Weather mode switcher.
 */

import { memo } from 'react';
import { AlertTriangle, Flame, CloudSun } from 'lucide-react';
import LayerControl from '../LayerControl/LayerControl';

const MapBottomBar = memo(function MapBottomBar({
  activeMapTab = 'wildfire',
  onTabChange,
  infrastructureLayersEntitled = false,
  mapType = 'satellite',
  onMapTypeChange,
  measureActive = false,
  measureMode = 'distance',
  onMeasureActivate,
  onMeasureClose,
  precipRingActive = false,
  onPrecipRingToggle,
  terrainActive = false,
  onTerrainToggle,
}) {
  const isAllHazardTab = activeMapTab === 'allhazard';

  return (
    <div className="absolute bottom-9 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1.5 bg-white/90 dark:bg-black/90 backdrop-blur-sm border border-sentinel-200 dark:border-zinc-700 rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/60">
      <LayerControl
        activeMapTab={activeMapTab}
        infrastructureLayersEntitled={infrastructureLayersEntitled}
        mapType={mapType}
        onMapTypeChange={onMapTypeChange}
        measureActive={measureActive}
        measureMode={measureMode}
        onMeasureActivate={onMeasureActivate}
        onMeasureClose={onMeasureClose}
        precipRingActive={precipRingActive}
        onPrecipRingToggle={onPrecipRingToggle}
        terrainActive={terrainActive}
        onTerrainToggle={onTerrainToggle}
      />

      <div className="w-px self-stretch my-1 bg-sentinel-200 dark:bg-zinc-700" />

      <button
        type="button"
        onClick={() => onTabChange?.('allhazard')}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl transition-all duration-200 ${
          isAllHazardTab
            ? 'bg-gradient-to-r from-fire-600 via-red-600 to-sky-700 text-white shadow-lg shadow-red-900/30'
            : 'text-sentinel-600 dark:text-zinc-300 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-zinc-800'
        }`}
        aria-pressed={isAllHazardTab}
      >
        <AlertTriangle size={15} className={isAllHazardTab ? 'text-yellow-300' : 'text-sentinel-400 dark:text-zinc-400'} />
        <span className="hidden sm:inline">All Hazards</span>
      </button>

      <button
        type="button"
        onClick={() => onTabChange?.('wildfire')}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl transition-colors ${
          activeMapTab === 'wildfire'
            ? 'bg-fire-600 text-white'
            : 'text-sentinel-600 dark:text-zinc-300 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-zinc-800'
        }`}
        aria-pressed={activeMapTab === 'wildfire'}
      >
        <Flame size={15} />
        <span className="hidden sm:inline">Wildfire</span>
      </button>

      <button
        type="button"
        onClick={() => onTabChange?.('weather')}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl transition-colors ${
          activeMapTab === 'weather'
            ? 'bg-sky-600 text-white'
            : 'text-sentinel-600 dark:text-zinc-300 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-zinc-800'
        }`}
        aria-pressed={activeMapTab === 'weather'}
      >
        <CloudSun size={15} />
        <span className="hidden sm:inline">Weather</span>
      </button>
    </div>
  );
});

export default MapBottomBar;
