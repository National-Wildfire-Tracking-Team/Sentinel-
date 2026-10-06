/**
 * usePopupDrag.js
 * Drag-aside offset for map popups (MapFeaturePopup, StormMapPopup) when the
 * Popup Drag Handle preference is on.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Tracks a pointer-drag delta, reset whenever `resetKey` changes. */
export function useDragOffset(resetKey) {
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
