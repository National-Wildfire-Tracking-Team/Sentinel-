/**
 * useSidebar.js
 * Hooks shared by the incident-style detail sidebars (see sidebarParts.jsx).
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** Re-render on an interval so relative times ("Updated 3m ago") stay current. */
export function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const DESKTOP_QUERY = '(min-width: 768px)';

function subscribeDesktop(onChange) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** Tailwind `md` and up: docked panel; below: bottom sheet. */
export function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

// Space left above the expanded sheet so the map (and the selected marker
// edge) stays visible and the sheet reads as dismissible.
const SHEET_TOP_GAP = 56;
const SHEET_MAX_PEEK_RATIO = 0.7;
const DRAG_SLOP = 6;

/**
 * Bottom-sheet state for mobile. Peek shows everything above the tabs
 * (header through evacuations) plus the footer; dragging the handle (or the
 * peek content) up expands to full height, dragging below peek closes.
 */
export function useBottomSheet({ enabled, onClose, scrollRef, sheetRef, handleRef, peekRef, footerRef }) {
  const [expanded, setExpanded] = useState(false);
  const [dragHeight, setDragHeight] = useState(null);
  const [parts, setParts] = useState({ handle: 0, peek: 0, footer: 0 });
  const drag = useRef(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;
    const measure = () => setParts({
      handle: handleRef.current?.offsetHeight ?? 0,
      peek: peekRef.current?.offsetHeight ?? 0,
      footer: footerRef.current?.offsetHeight ?? 0,
    });
    const observer = new ResizeObserver(measure);
    [handleRef, peekRef, footerRef].forEach((r) => r.current && observer.observe(r.current));
    return () => observer.disconnect();
  }, [enabled, handleRef, peekRef, footerRef]);

  const fullPx = () => window.innerHeight - SHEET_TOP_GAP;
  const peekPx = parts.peek
    ? Math.min(parts.handle + parts.peek + parts.footer, window.innerHeight * SHEET_MAX_PEEK_RATIO)
    : window.innerHeight * 0.45;

  const setSheetExpanded = useCallback((next) => {
    setExpanded(next);
    // Collapsing always returns to the top so the peek shows the header.
    if (!next && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [scrollRef]);

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    suppressClick.current = false;
    drag.current = {
      startY: e.clientY,
      startH: sheetRef.current?.getBoundingClientRect().height ?? peekPx,
      moved: false,
      target: e.currentTarget,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dy) < DRAG_SLOP) return;
    if (!d.moved) {
      d.moved = true;
      d.target.setPointerCapture?.(d.pointerId);
    }
    setDragHeight(Math.max(80, Math.min(fullPx(), d.startH - dy)));
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    suppressClick.current = true;
    const h = d.startH - (e.clientY - d.startY);
    setDragHeight(null);
    if (h < peekPx * 0.6) onClose();
    else setSheetExpanded(h > (peekPx + fullPx()) / 2);
  };

  const dragProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: () => { drag.current = null; setDragHeight(null); },
    // A drag that ends over a link must not also follow it.
    onClickCapture: (e) => {
      if (suppressClick.current) {
        suppressClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };

  const height = dragHeight != null ? `${dragHeight}px`
    : expanded ? `calc(100dvh - ${SHEET_TOP_GAP}px)`
    : `${peekPx}px`;

  return {
    expanded,
    dragging: dragHeight != null,
    height,
    toggle: () => setSheetExpanded(!expanded),
    dragProps,
  };
}

/** Close the sidebar on Escape. */
export function useEscapeToClose(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}
