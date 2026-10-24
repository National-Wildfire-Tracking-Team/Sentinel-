/**
 * usePopupDrag.js
 * Popup Draggability: with the preference on, a popup or details panel can be
 * dragged aside by any part of it to see the map underneath.
 *
 * A press becomes a drag only once it has moved DRAG_SLOP px, so clicks and
 * taps on the popup's own buttons and links still work, and the click a drag
 * ends in is swallowed. Presses on form controls, scrollbars and
 * [data-popup-no-drag] areas (a swipe carousel) never drag.
 *
 * A dragged popup stays inside the map ([data-map-area]) and off the controls
 * floating on it ([data-map-control] and Mapbox's own): it slides along them
 * and stops at them, and picks the pointer back up when it returns. One that
 * opened overlapping them can only be moved out of the way.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useOptionalPreferences } from '../../context/PreferencesContext';

const DRAG_SLOP = 6;
const NO_DRAG = 'input, textarea, select, [contenteditable="true"], [data-popup-no-drag]';
const CONTROLS = '[data-map-control], .mapboxgl-ctrl';
const ORIGIN = { x: 0, y: 0 };

/** A press on an element's own scrollbar (outside its client area). */
function onScrollbar(e) {
  const el = e.target;
  if (!(el instanceof Element)) return false;
  return (el.clientWidth > 0 && e.offsetX > el.clientWidth)
    || (el.clientHeight > 0 && e.offsetY > el.clientHeight);
}

function overlap(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The map's box and the controls on it, minus the popup itself. */
function dragLimits(popup) {
  const map = document.querySelector('[data-map-area]')?.getBoundingClientRect() ?? null;
  const controls = [...document.querySelectorAll(CONTROLS)]
    .filter((el) => !popup.contains(el) && !el.contains(popup))
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);
  return { map, controls };
}

/** How much of a box sits off the map or over a control (0 = a free spot). */
function blockedArea(box, { map, controls }) {
  const area = (box.right - box.left) * (box.bottom - box.top);
  const offMap = map ? area - overlap(box, map) : 0;
  return offMap + controls.reduce((sum, c) => sum + overlap(box, c), 0);
}

const moved = (rect, { x, y }) => ({ left: rect.left + x, right: rect.right + x, top: rect.top + y, bottom: rect.bottom + y });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Where a popup at `from` (offset from its drag-start box `rect`) can go on
 * its way to `to`, never into more blocked area than it's in now: all the
 * way if it can, otherwise as far as it gets straight there or sliding along
 * either axis, whichever ends nearest the pointer.
 */
function allowedMove(rect, from, to, limits) {
  const now = blockedArea(moved(rect, from), limits);
  const ok = (p) => blockedArea(moved(rect, p), limits) <= now + 0.5;
  if (ok(to)) return to;
  const farthest = (target) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 10; i += 1) {
      const t = (lo + hi) / 2;
      if (ok(lerp(from, target, t))) lo = t;
      else hi = t;
    }
    return lerp(from, target, lo);
  };
  return [to, { x: to.x, y: from.y }, { x: from.x, y: to.y }]
    .map(farthest)
    .reduce((best, p) => (distance(p, to) < distance(best, to) ? p : best));
}

/**
 * Drag offset for a popup, back to its place whenever `resetKey` changes or
 * dragging is turned off. Spread `dragProps` on the popup's root, apply
 * `translate` as its CSS translate (which composes with any slide-in
 * transform), and add `dragClass` for the grab cursor.
 */
export function usePopupDrag(resetKey, enabled) {
  const [offset, setOffset] = useState(ORIGIN);
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef(ORIGIN);
  // Ends the press in progress (removing its window listeners), if any.
  const endRef = useRef(null);

  useEffect(() => {
    offsetRef.current = ORIGIN;
    setOffset(ORIGIN);
  }, [resetKey, enabled]);

  useEffect(() => () => endRef.current?.(), []);

  // The press is followed on the window, not the popup: the pointer can leave
  // the popup before the press turns into a drag, and capturing it on the
  // popup up front would take the click away from the button pressed.
  const onPointerDown = useCallback((e) => {
    if (e.button !== 0 || e.target.closest?.(NO_DRAG) || onScrollbar(e)) return;
    endRef.current?.();
    const popup = e.currentTarget;
    const { pointerId } = e;
    const start = { x: e.clientX, y: e.clientY };
    const root = document.documentElement;
    let drag = null;
    let userSelect = '';

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const pointer = { x: ev.clientX - start.x, y: ev.clientY - start.y };
      if (!drag) {
        if (Math.hypot(pointer.x, pointer.y) < DRAG_SLOP) return;
        window.getSelection?.()?.removeAllRanges();
        userSelect = root.style.userSelect;
        root.style.userSelect = 'none';
        drag = {
          rect: popup.getBoundingClientRect(),
          limits: dragLimits(popup),
          origin: offsetRef.current,
          at: ORIGIN,
        };
        setDragging(true);
      }
      // Follows the pointer 1:1 (slop included) wherever the limits allow.
      drag.at = allowedMove(drag.rect, drag.at, pointer, drag.limits);
      offsetRef.current = { x: drag.origin.x + drag.at.x, y: drag.origin.y + drag.at.y };
      setOffset(offsetRef.current);
    };

    const end = (ev) => {
      if (ev && ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      endRef.current = null;
      if (!drag) return;
      root.style.userSelect = userSelect;
      setDragging(false);
      if (ev?.type !== 'pointerup') return;
      // The press was a drag, so the click it ends in isn't a tap on whatever
      // button or link it started on.
      const swallow = (click) => {
        click.stopPropagation();
        click.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    endRef.current = end;
  }, []);

  return {
    enabled,
    translate: enabled ? `${offset.x}px ${offset.y}px` : undefined,
    dragProps: enabled
      ? {
        onPointerDown,
        // Links and images would otherwise start a native drag-and-drop.
        onDragStart: (e) => e.preventDefault(),
      }
      : {},
    dragClass: enabled ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : '',
  };
}

/** usePopupDrag for a panel or popup that reads the preference itself. */
export function usePanelDrag(resetKey) {
  return usePopupDrag(resetKey, Boolean(useOptionalPreferences()?.prefs?.popupDragHandle));
}
