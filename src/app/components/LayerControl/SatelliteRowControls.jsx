/**
 * SatelliteRowControls.jsx
 * Under the Satellite row in the layer panel, while the layer is on: what is
 * shown, and a button that brings the satellite controls back up when
 * another layer's controls have taken the dock above the bottom bar.
 */

import { memo } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useSatelliteContext } from '../../context/SatelliteContext';

const SatelliteRowControls = memo(function SatelliteRowControls() {
  const { layers } = useApp();
  const sat = useSatelliteContext();
  if (!layers.satellite || !sat?.active) return null;
  const { satellite, region, product, panelOpen, openPanel, closePanel } = sat;

  return (
    <div className="flex items-center gap-2 px-2.5 py-2 bg-sentinel-800/70 border-t border-sentinel-700">
      <span className="min-w-0 flex-1 truncate text-[10px] text-sentinel-300">
        {satellite.label} · {region.label} · {product?.label}
      </span>
      <button
        type="button"
        onClick={panelOpen ? closePanel : openPanel}
        aria-pressed={panelOpen}
        className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold border transition-all ${
          panelOpen
            ? 'bg-violet-600 text-white border-transparent'
            : 'bg-sentinel-900 text-sentinel-200 border-sentinel-600 hover:bg-sentinel-700 hover:text-white'}`}
      >
        <SlidersHorizontal size={11} aria-hidden />
        {panelOpen ? 'Hide controls' : 'Controls'}
      </button>
    </div>
  );
});

export default SatelliteRowControls;
