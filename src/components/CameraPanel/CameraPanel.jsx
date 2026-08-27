/**
 * CameraPanel.jsx
 * Compact floating widget for a selected California highway camera —
 * live still image (auto-refreshed), route/location, and an optional
 * link to the raw HLS stream. Styled to match RadarSitePanel's
 * floating-card conventions. The header is drag-handled so the user can
 * reposition the panel anywhere over the map, and the bottom corners are
 * resize-handled (locked to the panel's aspect ratio) so the live feed
 * can be scaled up or down in place.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { X, Camera as CameraIcon, ExternalLink, GripHorizontal } from 'lucide-react';

const MIN_REFRESH_MS = 15 * 1000;
const DEFAULT_WIDTH = 288; // matches the old w-72 default
const RESIZE_MIN_WIDTH = 220;
const RESIZE_MAX_WIDTH = 640;

/** Small curved corner-drag glyph, mirrored per corner via the `flip` prop. */
function ResizeGlyph({ flip }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M3 13 Q3 3 13 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

const CameraPanel = memo(function CameraPanel({ camera, onClose }) {
  const [cacheBust, setCacheBust] = useState(() => Date.now());
  // Pixel {top, left} relative to the panel's positioned ancestor, and
  // pixel {width, height}, once the user has dragged/resized at least
  // once. Null means "use the default corner placement / default width".
  const [position, setPosition] = useState(null);
  const [size, setSize] = useState(null);
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  useEffect(() => {
    if (!camera) return undefined;
    const intervalMs = Math.max(MIN_REFRESH_MS, (camera.updateFrequencyMin || 1) * 60 * 1000);
    const id = setInterval(() => setCacheBust(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [camera]);

  useEffect(() => {
    setCacheBust(Date.now());
  }, [camera?.id]);

  const handleDragStart = useCallback((e) => {
    if (e.button != null && e.button !== 0) return;
    const panel = panelRef.current;
    if (!panel) return;

    const parent = panel.offsetParent;
    const parentRect = parent
      ? parent.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight };

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTop: panel.offsetTop,
      startLeft: panel.offsetLeft,
      maxLeft: Math.max(0, parentRect.width - panel.offsetWidth),
      maxTop: Math.max(0, parentRect.height - panel.offsetHeight),
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const handleDragMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const nextLeft = Math.min(Math.max(0, drag.startLeft + (e.clientX - drag.startX)), drag.maxLeft);
    const nextTop = Math.min(Math.max(0, drag.startTop + (e.clientY - drag.startY)), drag.maxTop);
    setPosition({ top: nextTop, left: nextLeft });
  }, []);

  const handleDragEnd = useCallback((e) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  /** Bottom-left and bottom-right corner handles both keep the panel's aspect ratio locked. */
  const handleResizeStart = useCallback((corner) => (e) => {
    if (e.button != null && e.button !== 0) return;
    const panel = panelRef.current;
    if (!panel) return;
    e.stopPropagation();

    const parent = panel.offsetParent;
    const parentRect = parent
      ? parent.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight };

    const startWidth = panel.offsetWidth;
    const startHeight = panel.offsetHeight;
    const startTop = panel.offsetTop;
    const startLeft = panel.offsetLeft;
    const aspectRatio = startWidth / startHeight;

    const maxWidthByViewport = corner === 'right'
      ? parentRect.width - startLeft
      : startLeft + startWidth;
    const maxWidthByHeight = (parentRect.height - startTop) * aspectRatio;

    resizeRef.current = {
      corner,
      startX: e.clientX,
      startWidth,
      startTop,
      startLeft,
      aspectRatio,
      maxWidth: Math.min(RESIZE_MAX_WIDTH, maxWidthByViewport, maxWidthByHeight),
    };

    // Lock in explicit position + size the first time a resize happens, so
    // dragging always operates in absolute pixel space from here on.
    setPosition((prev) => prev ?? { top: startTop, left: startLeft });
    setSize({ width: startWidth, height: startHeight });

    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const handleResizeMove = useCallback((e) => {
    const drag = resizeRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const rawWidth = drag.corner === 'right' ? drag.startWidth + dx : drag.startWidth - dx;
    const newWidth = Math.min(Math.max(RESIZE_MIN_WIDTH, rawWidth), drag.maxWidth);
    const newHeight = newWidth / drag.aspectRatio;

    setSize({ width: newWidth, height: newHeight });
    if (drag.corner === 'left') {
      setPosition({ top: drag.startTop, left: drag.startLeft + (drag.startWidth - newWidth) });
    }
  }, []);

  const handleResizeEnd = useCallback((e) => {
    resizeRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  if (!camera) return null;

  const imageSrc = camera.imageUrl ? `${camera.imageUrl}${camera.imageUrl.includes('?') ? '&' : '?'}t=${cacheBust}` : null;
  const subtitle = [camera.route, camera.direction].filter(Boolean).join(' · ') || camera.nearbyPlace;

  const resizeHandleClass = 'absolute z-10 w-5 h-5 flex items-center justify-center text-sentinel-400 hover:text-teal-400 transition-colors touch-none';

  return (
    <div
      ref={panelRef}
      className={`absolute z-30 bg-sentinel-900/95 backdrop-blur-sm border border-sentinel-700 rounded-xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in flex flex-col ${position ? '' : 'top-4 right-4'}`}
      style={{
        ...(position ? { top: position.top, left: position.left } : {}),
        width: size ? size.width : DEFAULT_WIDTH,
        height: size ? size.height : undefined,
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b border-sentinel-700 shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <GripHorizontal size={12} className="text-sentinel-500 shrink-0" />
        <CameraIcon size={14} className="text-teal-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-white truncate">{camera.name}</div>
          {subtitle && <div className="text-[10px] text-sentinel-400 truncate">{subtitle}</div>}
        </div>
        <button
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          className="shrink-0 text-sentinel-400 hover:text-white transition-colors p-0.5"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div className={`px-3 py-2.5 flex flex-col ${size ? 'flex-1 min-h-0' : ''}`}>
        {imageSrc ? (
          <img
            key={camera.id}
            src={imageSrc}
            alt={camera.name}
            draggable={false}
            className={`w-full rounded-lg border border-sentinel-700 bg-black object-contain ${size ? 'flex-1 min-h-0' : ''}`}
          />
        ) : (
          <div className="text-[10px] text-amber-300 bg-amber-900/20 border border-amber-800 rounded p-1.5">
            Live image unavailable for this camera.
          </div>
        )}

        <div className="flex items-center justify-between mt-2 text-[10px] text-sentinel-400 shrink-0">
          <span>{camera.county ? `${camera.county} Co.` : ''}</span>
          {camera.streamUrl && (
            <a
              href={camera.streamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-teal-400 hover:text-teal-300 font-medium"
            >
              Raw stream <ExternalLink size={10} />
            </a>
          )}
        </div>
        <div className="text-[9px] text-sentinel-500 mt-1 shrink-0">Caltrans District CCTV · updates periodically</div>
      </div>

      {/* Corner resize handles — locked to the panel's aspect ratio */}
      <div
        className={`${resizeHandleClass} bottom-0 left-0 pb-0.5 pl-0.5`}
        style={{ cursor: 'nesw-resize' }}
        onPointerDown={handleResizeStart('left')}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        aria-label="Resize camera feed"
      >
        <ResizeGlyph flip />
      </div>
      <div
        className={`${resizeHandleClass} bottom-0 right-0 pb-0.5 pr-0.5`}
        style={{ cursor: 'nwse-resize' }}
        onPointerDown={handleResizeStart('right')}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        aria-label="Resize camera feed"
      >
        <ResizeGlyph />
      </div>
    </div>
  );
});

export default CameraPanel;
