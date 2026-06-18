/**
 * AlertBanner.jsx
 * Scrolling banner that shows active Red Flag Warnings.
 * Auto-hides when there are no active alerts.
 */


import { useState, useEffect, memo } from 'react';
import {
  AlertTriangle,
  X,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const AlertBanner = memo(function AlertBanner({
  dismissed,
  onDismiss,
}) {
  const { alerts, selectFire } = useApp();
  const [activeIndex, setActiveIndex] = useState(0);

  // Only show Red Flag Warnings in the banner
  const rfwAlerts = alerts.filter(
    alert => alert.type === 'Red Flag Warning'
  );

  // Reset index if alert count changes
  useEffect(() => {
    if (
      rfwAlerts.length > 0 &&
      activeIndex >= rfwAlerts.length
    ) {
      setActiveIndex(0);
    }
  }, [rfwAlerts.length, activeIndex]);

  if (dismissed || rfwAlerts.length === 0) {
    return null;
  }

  const current = rfwAlerts[activeIndex];

  const next = () => {
    setActiveIndex(index => (index + 1) % rfwAlerts.length);
  };

  const previous = () => {
    setActiveIndex(
      index => (index - 1 + rfwAlerts.length) % rfwAlerts.length
    );
  };

  const openAlertDetails = () => {
    selectFire({
      ...current,
      type: 'weather-alert',
      eventType: current.type,
    });
  };

  return (
    <div
      className="
        relative z-30 flex items-center gap-2 px-3 py-2
        bg-red-950/90 backdrop-blur-sm
        border-b border-red-800/60
        text-red-200 text-sm
        shrink-0 min-h-[40px]
      "
    >
      {/* Alert Icon */}
      <AlertTriangle
        size={15}
        className="text-red-400 shrink-0 animate-pulse"
      />

      {/* Alert Label */}
      <span className="hidden text-xs font-bold tracking-wider text-red-400 uppercase sm:inline shrink-0">
        Red Flag Warning
      </span>

      <span className="hidden text-red-700 sm:inline">·</span>

      {/* Alert Headline */}
      <button
        onClick={openAlertDetails}
        className="flex-1 text-xs font-medium text-left text-red-200 truncate transition-colors cursor-pointer hover:text-white"
      >
        {current.headline ||
          current.affectedArea ||
          'Active Red Flag Warning in your area'}
      </button>

      {/* Navigation */}
      {rfwAlerts.length > 1 && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={previous}
            className="p-0.5 text-red-400 hover:text-red-200 transition-colors"
            aria-label="Previous alert"
          >
            <ChevronLeft size={13} />
          </button>

          <span className="text-xs text-red-400 min-w-[32px] text-center">
            {activeIndex + 1}/{rfwAlerts.length}
          </span>

          <button
            onClick={next}
            className="p-0.5 text-red-400 hover:text-red-200 transition-colors"
            aria-label="Next alert"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      )}

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="shrink-0 p-0.5 text-red-500 hover:text-red-200 transition-colors"
        aria-label="Dismiss alert banner"
      >
        <X size={14} />
      </button>
    </div>
  );
});

export default AlertBanner;