/**
 * FutureFeaturesPanel.jsx
 * Placeholder slide-in panel reserved for upcoming map features.
 */

import { memo } from 'react';
import { useApp } from '../../context/AppContext';

const FutureFeaturesPanel = memo(function FutureFeaturesPanel() {
  const { futurePanelOpen } = useApp();

  return (
    <aside
      className={`
        absolute inset-y-0 left-0 z-40
        flex flex-col
        bg-sentinel-900/95 backdrop-blur-sm
        border-r border-sentinel-700
        transition-transform duration-300 ease-in-out
        w-full sm:w-80
        ${futurePanelOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
    >
      <div className="flex items-center px-4 py-3 border-b border-sentinel-700 shrink-0">
        <h2 className="font-semibold text-white text-sm">More Features</h2>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 text-center">
        <p className="text-sentinel-400 text-sm">Additional tools will appear here soon.</p>
      </div>
    </aside>
  );
});

export default FutureFeaturesPanel;
