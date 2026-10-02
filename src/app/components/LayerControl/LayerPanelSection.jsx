/**
 * LayerPanelSection.jsx
 * One collapsible section of the bottom bar's layer pop-up: a chevron
 * header (title + optional subtitle) over its rows. Shared by the map
 * layer sections and the Models tab's model/variable sections so both
 * pop-ups read as the same control.
 */

import { ChevronDown, ChevronRight } from 'lucide-react';

export default function LayerPanelSection({ title, subtitle, collapsed = false, onToggle, children }) {
  return (
    <div className="mb-1 last:mb-0 px-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="w-full flex items-start gap-2 px-1.5 py-2 rounded-lg hover:bg-white/5 transition-colors text-left"
      >
        {collapsed ? (
          <ChevronRight size={14} className="shrink-0 text-sentinel-400 mt-0.5" />
        ) : (
          <ChevronDown size={14} className="shrink-0 text-sentinel-400 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-white leading-tight">{title}</div>
          {subtitle && (
            <div className="text-[10px] text-sentinel-300 mt-0.5 leading-snug">{subtitle}</div>
          )}
        </div>
      </button>

      {!collapsed && <div className="pl-1 pb-2 space-y-3">{children}</div>}
    </div>
  );
}
