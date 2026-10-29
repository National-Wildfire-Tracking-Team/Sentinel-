/**
 * DockSheet.jsx
 * Pull-up controls sheet on the bottom bar, shared by every layer that has
 * slider controls (see MapDockSheet.jsx). Each such layer that is on gets a
 * tab in a strip that extends the top of the bottom bar, shaped like a
 * browser tab: curved top corners, a flat bottom standing on the thin line
 * between the tabs and the bar's buttons, a lighter fill than the bar so it
 * reads as a tab. Each tab has a gray pull bar along its top, its layer's
 * name, and a small × that turns the layer off (onCloseTab). Tabs are as
 * compact as their names allow, so as many as possible fit; a crowded strip
 * shrinks them (names truncate) and then scrolls sideways.
 *
 * Slide a tab sideways to move it among the others (Shift+←/→ from the
 * keyboard): it follows the pointer, the rest make room, and on release it
 * springs into its slot. Tabs always pack to the left, against each other.
 * The order is remembered on this device; a newly docked layer joins at the end.
 *
 * Drag a tab up (or tap it) to open that layer's controls. Which of the two
 * a drag is (reorder or open) gets decided by its first few pixels.
 *
 * The tabs and the controls share one panel on the bar. Pulling up raises
 * the panel's top edge with the pointer from the first pixel, so it simply
 * grows upward off the bar with no gap; over the first stretch of the rise
 * the tabs fade away where they stand and the controls (with their dark
 * backing) fade in over them. Open, the panel's gray grabber bar along its
 * top edge is the handle: drag it (or tap it) to close, which plays the same
 * movement backwards and brings the tabs back.
 *
 * The drag tracks the pointer 1:1 and can be grabbed mid-animation. Let go
 * gently and the sheet stays where it was left (any height; nearly closed
 * closes). Flick it and the flick's projected momentum picks fully open or
 * closed, reached on a critically damped spring that starts at the finger's
 * velocity. The panel never takes more than the bottom third of the screen
 * (a tab with many controls can allow itself more, see `maxShare`): beyond
 * that it stops (with a little rubber-band), and whenever its
 * controls don't fit (capped or only part-way open) they scroll inside it,
 * under the fixed gray grabber bar. It only moves while a tab is held: the drag ends on release, on
 * lost pointer capture, or as soon as no button is pressed. Height changes
 * are applied straight to the DOM while moving; the page only hears about
 * the settled height (onSettledHeight): the panel's whole height.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const TAP_SLOP = 6; // px of movement before a press becomes a drag
const SPRING_RESPONSE = 0.32; // s, critically damped (no overshoot)
const DECELERATION = 0.998;
const FLICK_PX_S = 600; // release speed above which a flick snaps fully open/closed
const MIN_OPEN_PX = 28; // released having risen less than this: close
const FADE_SPAN = 1.5; // the tabs → controls crossfade runs over this many tab-heights of rise
const MIN_SHEET_PX = 96; // the screen-share cap never goes below this
const DEFAULT_MAX_SHARE = 1 / 3; // of the screen's height, unless a tab sets maxShare
const SHEET_ID = 'map-dock-sheet';
// Every layer with docked controls can have its tab at once (see MapDockSheet).
export const MAX_TABS = 9;

const ORDER_KEY = 'sentinel:dockTabOrder';

function readOrder() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(ORDER_KEY));
    return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeOrder(order) {
  try {
    window.localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    // Storage blocked (private mode etc.) — the order still holds this session.
  }
}

/** `tabs` in the user's order: saved ones first, as saved; any others after, as given. */
function inOrder(tabs, order) {
  const rank = new Map(order.map((id, i) => [id, i]));
  return tabs
    .map((tab, i) => ({ tab, i }))
    .sort((a, b) => (rank.get(a.tab.id) ?? order.length + a.i) - (rank.get(b.tab.id) ?? order.length + b.i))
    .map(({ tab }) => tab);
}

/** Where a flick would come to rest (Apple's scroll-deceleration projection), px. */
const project = (velocity) => ((velocity / 1000) * DECELERATION) / (1 - DECELERATION);

/** Soft resistance past an edge. */
const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {{
 *   tabs: { id: string, label: string, loading?: boolean, content: import('react').ReactNode, maxShare?: number }[],
 *   onCloseTab?: (id: string) => void,
 *   bottomOffset: number, bottomBarWidth?: number, onSettledHeight?: (px: number) => void,
 * }} props
 *   maxShare: how far up the screen this tab's sheet may reach, as a share of its height (default a third)
 *   onCloseTab: a tab's × was pressed — turn its layer off
 */
const DockSheet = memo(function DockSheet({ tabs: allTabs, onCloseTab, bottomOffset, bottomBarWidth, onSettledHeight }) {
  const [order, setOrder] = useState(readOrder);
  const tabs = inOrder(allTabs, order).slice(0, MAX_TABS);
  const rowRef = useRef(null); // the row of tabs
  const tabAnim = useRef(0); // rAF id of a tab springing into its slot
  const panelRef = useRef(null); // the one panel on the bar: tabs when closed, controls when open
  const stripInnerRef = useRef(null); // the tabs and their line, at their natural height
  const boxRef = useRef(null); // the controls layer, faded in over the tabs
  const backdropRef = useRef(null); // the controls' dark backing, faded in with them
  const grabberRef = useRef(null); // fixed gray bar at the controls' top
  const contentRef = useRef(null); // natural-height content, inside the scroll area
  const scrollRef = useRef(null); // the scroll area
  const thumbRef = useRef(null); // always-visible scroll indicator (overlay scrollbars hide until used)
  const fullyOpen = useRef(false); // settled at the full (capped) height
  const bottomRef = useRef(bottomOffset);
  useEffect(() => { bottomRef.current = bottomOffset; }, [bottomOffset]);
  // Position along the gesture, px: how far the panel's top has risen above
  // the tabs' own height.
  const pos = useRef(0);
  const anim = useRef(0); // rAF id
  const drag = useRef(null);
  const [open, setOpen] = useState(false);
  const [chosenId, setChosenId] = useState(null);
  const shownIdRef = useRef(null); // tab whose controls are in the sheet (for per-frame styling)
  const sharesRef = useRef({}); // tab id → its maxShare, for the tabs that set one
  const sharesKey = tabs.map((t) => `${t.id}=${t.maxShare ?? ''}`).join(' ');
  useEffect(() => {
    sharesRef.current = Object.fromEntries(tabs.filter((t) => t.maxShare).map((t) => [t.id, t.maxShare]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sharesKey changes exactly when an id or share does
  }, [sharesKey]);

  const visible = tabs.length > 0;
  const active = tabs.find((t) => t.id === chosenId) ?? tabs[0] ?? null;
  const activeId = active?.id ?? null;

  /** The tabs' height: the panel's height when closed. */
  const stripHeight = () => stripInnerRef.current?.offsetHeight ?? 0;
  /** Natural controls height: grabber + all its controls. */
  const fullHeight = () => (grabberRef.current?.offsetHeight ?? 0) + (contentRef.current?.offsetHeight ?? 0);
  /** Tallest the open panel may be: its controls, but reaching no further up the screen than its tab's share (a third by default). */
  const openHeight = () => {
    const share = sharesRef.current[shownIdRef.current] ?? DEFAULT_MAX_SHARE;
    const cap = (typeof window !== 'undefined' ? window.innerHeight : 900) * share - (Number(bottomRef.current) || 0);
    return Math.max(stripHeight() + MIN_OPEN_PX, Math.min(fullHeight(), Math.max(MIN_SHEET_PX, cap)));
  };
  /** Fully open, as a position: the rise that makes the panel openHeight() tall. */
  const openPos = () => openHeight() - stripHeight();
  useEffect(() => { shownIdRef.current = activeId; }, [activeId]);

  /** Show the right-edge scroll indicator only when the controls don't fit, sized and placed to match. */
  const updateScrollbar = useCallback(() => {
    const el = scrollRef.current;
    const thumb = thumbRef.current;
    if (!el || !thumb) return;
    const { scrollHeight, clientHeight, scrollTop } = el;
    const track = thumb.parentElement;
    if (scrollHeight <= clientHeight + 1 || clientHeight < 8) {
      track.style.opacity = '0';
      return;
    }
    const trackH = track.clientHeight;
    const thumbH = Math.max(16, (clientHeight / scrollHeight) * trackH);
    const top = (scrollTop / (scrollHeight - clientHeight)) * (trackH - thumbH);
    thumb.style.height = `${thumbH}px`;
    thumb.style.transform = `translateY(${top}px)`;
    track.style.opacity = '1';
  }, []);

  const apply = useCallback((position) => {
    pos.current = position;
    const panel = panelRef.current;
    const tabsLayer = stripInnerRef.current;
    const box = boxRef.current;
    if (!panel || !tabsLayer || !box) return;
    // One panel on the bar: its top edge rises with the pointer from the first
    // pixel, never leaving a gap. Over the first stretch of the rise the tabs
    // fade away where they stand while the controls (and their dark backing)
    // fade in over them: the tabs are gone by halfway and the controls only
    // come in from a third of the way, so the two never sit on top of each
    // other as legible text; the backing blends across the whole stretch.
    // Closed, it is just the tabs at their natural height.
    const strip = stripHeight();
    const rise = Math.max(0, position);
    const closed = rise < 0.5;
    const into = closed ? 0 : Math.min(1, rise / Math.max(24, strip * FADE_SPAN)); // 0 tabs → 1 controls
    panel.style.height = closed ? '' : `${strip + rise}px`;
    const tabsOpacity = Math.max(0, 1 - into * 2);
    const controlsOpacity = Math.min(1, Math.max(0, (into - 1 / 3) * 1.5));
    tabsLayer.style.opacity = closed ? '' : String(tabsOpacity);
    tabsLayer.style.transform = closed ? '' : `translateY(${-4 * into}px)`;
    tabsLayer.style.visibility = !closed && tabsOpacity === 0 ? 'hidden' : '';
    box.style.opacity = closed ? '0' : String(controlsOpacity);
    box.style.visibility = closed ? 'hidden' : 'visible';
    if (backdropRef.current) backdropRef.current.style.opacity = String(into);
    updateScrollbar();
  }, [updateScrollbar]);

  /** The panel has come to rest at `position`. */
  const settle = useCallback((position) => {
    const rise = Math.max(0, position);
    fullyOpen.current = rise > 0 && position >= openPos() - 0.5;
    setOpen(rise > 0.5);
    onSettledHeight?.(stripHeight() + rise);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSettledHeight]);

  /** Spring the sheet to `target` (a position) from where it is now, starting at `velocity` (px/s, + = opening). */
  const springTo = useCallback((target, velocity = 0) => {
    cancelAnimationFrame(anim.current);
    if (reducedMotion()) {
      apply(target);
      settle(target);
      return;
    }
    const x0 = pos.current - target;
    const omega = (2 * Math.PI) / SPRING_RESPONSE;
    const start = performance.now();
    const step = (t) => {
      const s = (t - start) / 1000;
      // Critically damped: x(t) = (x0 + (v0 + ω·x0)·t)·e^(−ωt)
      const decay = Math.exp(-omega * s);
      const x = (x0 + (velocity + omega * x0) * s) * decay;
      const v = (velocity - omega * (velocity + omega * x0) * s) * decay;
      if (Math.abs(x) < 0.5 && Math.abs(v) < 10) {
        apply(target);
        settle(target);
        return;
      }
      apply(target + x);
      anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, [apply, settle]);

  /** Fully open (to the cap) or closed. */
  const animateTo = useCallback((toOpen, velocity = 0) => {
    springTo(toOpen ? openPos() : 0, velocity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [springTo]);

  // While open, keep the sheet's height right as its content or the window
  // changes: a fully open sheet follows (up to the cap); a part-open one stays
  // where it was left unless that is now past the cap.
  useLayoutEffect(() => {
    if (!visible || !open || !contentRef.current) return undefined;
    const refit = () => {
      updateScrollbar();
      if (drag.current) return;
      const max = openPos();
      if (fullyOpen.current || pos.current > max + 0.5) springTo(max);
    };
    const observer = new ResizeObserver(refit);
    observer.observe(contentRef.current);
    window.addEventListener('resize', refit);
    return () => { observer.disconnect(); window.removeEventListener('resize', refit); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, open, activeId, springTo]); // activeId: the content node remounts per tab

  // The open tab's layer was switched off: close rather than show another layer's controls.
  const tabIds = tabs.map((t) => t.id).join(' ');
  const prevActiveId = useRef(activeId);
  useEffect(() => {
    const prev = prevActiveId.current;
    prevActiveId.current = activeId;
    if (open && prev && !tabIds.split(' ').includes(prev)) animateTo(false);
  }, [activeId, tabIds, open, animateTo]);

  // No tabs: nothing docked. Tabs back: report the strip before paint, so the
  // bar squares its corners in the same frame the strip appears on it.
  useLayoutEffect(() => {
    if (visible) {
      apply(pos.current);
      onSettledHeight?.(stripHeight() + Math.max(0, pos.current));
      return undefined;
    }
    cancelAnimationFrame(anim.current);
    pos.current = 0;
    drag.current = null;
    setOpen(false);
    onSettledHeight?.(0);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // The strip's height can change while closed (text size, a wrapped name): keep it whole.
  useLayoutEffect(() => {
    if (!visible || !stripInnerRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const refit = () => {
      if (drag.current || pos.current > 0) return;
      apply(0);
      onSettledHeight?.(stripHeight());
    };
    const observer = new ResizeObserver(refit);
    observer.observe(stripInnerRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // Opening on a tab whose controls aren't in the sheet yet waits for them to
  // mount, so the spring heads for their height rather than the last tab's.
  const pendingOpen = useRef(false);
  useLayoutEffect(() => {
    if (!pendingOpen.current) return;
    pendingOpen.current = false;
    animateTo(true);
  }, [activeId, animateTo]);

  /** Open the sheet on `id`'s controls. */
  const openTab = (id) => {
    setChosenId(id);
    shownIdRef.current = id;
    if (id === activeId) animateTo(true);
    else pendingOpen.current = true;
  };

  /** A tap (or keyboard activation) on a tab or the sheet's grabber. */
  const tapTab = (id) => {
    if (open) animateTo(false);
    else openTab(id);
  };

  // ── Reordering tabs ──

  /** Save a new tab order (every currently docked tab, plus remembered ones that aren't). */
  const commitOrder = (ids) => {
    const next = [...ids, ...order.filter((id) => !ids.includes(id))];
    setOrder(next);
    writeOrder(next);
  };

  /** The tab elements, in order, with their resting place in the row. */
  const measureTabs = () => [...(rowRef.current?.querySelectorAll('[data-dock-tab]') ?? [])]
    .map((el) => ({ id: el.dataset.dockTab, el, left: el.offsetLeft, width: el.offsetWidth }));

  /** Spring a tab's sideways offset from `x` to 0 (its slot), starting at `velocity` px/s. */
  const springTabHome = (el, x, velocity = 0) => {
    cancelAnimationFrame(tabAnim.current);
    const done = () => {
      el.style.transform = '';
      el.style.zIndex = '';
      el.style.boxShadow = '';
    };
    if (reducedMotion() || Math.abs(x) < 0.5) { done(); return; }
    const omega = (2 * Math.PI) / SPRING_RESPONSE;
    const start = performance.now();
    const step = (t) => {
      const s = (t - start) / 1000;
      const decay = Math.exp(-omega * s);
      const pos = (x + (velocity + omega * x) * s) * decay;
      const v = (velocity - omega * (velocity + omega * x) * s) * decay;
      if (Math.abs(pos) < 0.5 && Math.abs(v) < 10) { done(); return; }
      el.style.transform = `translateX(${pos}px)`;
      tabAnim.current = requestAnimationFrame(step);
    };
    tabAnim.current = requestAnimationFrame(step);
  };

  /** A sideways drag has begun: lift the tab and note where every tab rests. */
  const startReorder = (d) => {
    cancelAnimationFrame(tabAnim.current);
    const rects = measureTabs();
    const from = rects.findIndex((r) => r.id === d.id);
    if (from === -1) return false;
    const gap = rects.length > 1 ? rects[1].left - (rects[0].left + rects[0].width) : 0;
    rects.forEach((r, i) => {
      r.el.style.transition = i === from ? 'none' : 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)';
      if (i !== from) r.el.style.transform = '';
    });
    const el = rects[from].el;
    el.style.zIndex = '10';
    el.style.boxShadow = '0 6px 16px rgb(0 0 0 / 0.35)';
    d.reorder = { rects, from, to: from, gap, x: 0 };
    return true;
  };

  /** Follow the pointer 1:1 (soft at the row's ends) and slide the others aside. */
  const moveReorder = (d, dx) => {
    const { rects, from, gap } = d.reorder;
    const me = rects[from];
    const last = rects[rects.length - 1];
    const minX = rects[0].left - me.left;
    const maxX = last.left + last.width - (me.left + me.width);
    const x = dx < minX ? minX + rubberband(dx - minX, 80) : dx > maxX ? maxX + rubberband(dx - maxX, 80) : dx;
    me.el.style.transform = `translateX(${x}px)`;
    // Its slot: after every other tab whose middle it has passed.
    const middle = me.left + me.width / 2 + x;
    const to = rects.filter((r, i) => i !== from && r.left + r.width / 2 < middle).length;
    const shift = me.width + gap;
    rects.forEach((r, i) => {
      if (i === from) return;
      const moved = from < to ? (i > from && i <= to ? -shift : 0) : (i >= to && i < from ? shift : 0);
      r.el.style.transform = moved ? `translateX(${moved}px)` : '';
    });
    d.reorder.to = to;
    d.reorder.x = x;
  };

  // A dropped tab is laid out in its new slot: start it from where it was let
  // go (the others are already where the layout now puts them) and spring it home.
  const pendingDrop = useRef(null);
  const orderKey = tabs.map((t) => t.id).join(' ');
  useLayoutEffect(() => {
    const drop = pendingDrop.current;
    if (!drop) return;
    pendingDrop.current = null;
    const rects = measureTabs();
    rects.forEach((r) => { r.el.style.transition = 'none'; r.el.style.transform = ''; });
    const me = rects.find((r) => r.id === drop.id);
    if (!me) return;
    springTabHome(me.el, drop.visualLeft - me.left, drop.velocity);
  }, [orderKey]);

  /** Let go of a sideways drag: drop the tab into its slot. */
  const endReorder = (d, velocity) => {
    const { rects, from, to, x } = d.reorder;
    const me = rects[from];
    if (to === from) {
      rects.forEach((r, i) => { if (i !== from) r.el.style.transform = ''; });
      springTabHome(me.el, x, velocity);
      return;
    }
    const ids = rects.map((r) => r.id);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    pendingDrop.current = { id: me.id, visualLeft: me.left + x, velocity };
    commitOrder(ids);
  };

  /** Keyboard: move a tab one place left (-1) or right (+1). */
  const nudgeTab = (id, step) => {
    const ids = tabs.map((t) => t.id);
    const from = ids.indexOf(id);
    const to = from + step;
    if (from === -1 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    commitOrder(ids);
  };

  useEffect(() => () => cancelAnimationFrame(tabAnim.current), []);

  // ── Dragging ──

  const onPointerDown = (id, { reorderable = false } = {}) => (e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    cancelAnimationFrame(anim.current); // grab it mid-flight, from where it is now
    if (!open && pos.current < 0.5) { // pulling a closed sheet up by this tab
      setChosenId(id);
      shownIdRef.current = id;
    }
    drag.current = {
      id, reorderable, pointerId: e.pointerId, x: e.clientX, y: e.clientY, p0: pos.current, moved: false, mode: null,
      samples: [{ x: e.clientX, y: e.clientY, t: performance.now() }],
    };
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    // Only follow while held: a release we never saw (no buttons down) ends the drag here.
    if (e.buttons === 0) {
      onPointerUp(e);
      return;
    }
    const dy = d.y - e.clientY; // + = up
    const dx = e.clientX - d.x; // + = right
    if (!d.mode) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < TAP_SLOP) return;
      // Mostly sideways on a tab (with the sheet away): reorder. Otherwise: pull the sheet.
      d.mode = d.reorderable && !open && pos.current < 0.5 && Math.abs(dx) > Math.abs(dy) && startReorder(d)
        ? 'reorder' : 'sheet';
    }
    d.moved = true;
    d.samples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    if (d.samples.length > 6) d.samples.shift();
    if (d.mode === 'reorder') {
      moveReorder(d, dx);
      return;
    }
    const max = openPos();
    const raw = d.p0 + dy;
    apply(raw < 0 ? rubberband(raw, 120) : raw > max ? max + rubberband(raw - max, 120) : raw);
  };

  function onPointerUp(e) {
    const d = drag.current;
    if (!d || (e && e.pointerId !== d.pointerId)) return;
    drag.current = null;
    if (!d.moved) {
      tapTab(d.id);
      return;
    }
    // Release velocity from the last ~100 ms of samples (+ = upward / opening)
    const last = d.samples[d.samples.length - 1];
    const first = d.samples.find((s) => last.t - s.t <= 100) ?? d.samples[0];
    const dt = (performance.now() - first.t) / 1000; // includes any pause before letting go
    if (d.mode === 'reorder') {
      endReorder(d, dt > 0 ? (last.x - first.x) / dt : 0);
      return;
    }
    const velocity = dt > 0 ? (first.y - last.y) / dt : 0;
    const max = openPos();
    // A flick: its projected momentum picks fully open or closed.
    if (Math.abs(velocity) > FLICK_PX_S) {
      animateTo(pos.current + project(velocity) > max / 2, velocity);
      return;
    }
    // Otherwise it stays where it was left: back inside the cap if pulled past
    // it, closed if it has barely risen.
    if (pos.current > max) springTo(max, velocity);
    else if (pos.current < MIN_OPEN_PX) springTo(0, velocity);
    else settle(pos.current);
  }

  const onKeyDown = (id) => (e) => {
    if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !open) {
      e.preventDefault();
      nudgeTab(id, e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (e.key === 'ArrowUp' && !open) { e.preventDefault(); openTab(id); }
    if (e.key === 'ArrowDown' && open) { e.preventDefault(); animateTo(false); }
  };

  /** Pointer handlers that make `id`'s tab (or the open sheet's grabber) a drag handle. */
  const dragHandle = (id, opts) => ({
    onPointerDown: onPointerDown(id, opts),
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onLostPointerCapture: onPointerUp,
  });

  if (!visible) return null;

  return (
    <div
      data-map-control=""
      className="absolute left-1/2 -translate-x-1/2 z-[var(--bar-z,20)] flex flex-col pointer-events-none"
      style={{
        bottom: bottomOffset,
        width: bottomBarWidth ? `max(${bottomBarWidth}px, min(24rem, calc(100vw - 1rem)))` : 'min(24rem, calc(100vw - 1rem))',
        maxWidth: 'calc(100vw - 1rem)',
      }}
    >
      {/* The one panel on the bar: its top edge rises with the pull (height set
          per frame), with no gap below it. The tabs stay at its foot and fade
          away while the controls and their dark backing fade in over them. */}
      <div
        ref={panelRef}
        data-dock-panel=""
        className="pointer-events-auto relative flex w-full flex-col justify-end overflow-hidden rounded-t-2xl border-x border-t border-sentinel-200 dark:border-sentinel-600 bg-white/90 dark:bg-sentinel-900/90 backdrop-blur-sm"
      >
        <div ref={backdropRef} aria-hidden className="pointer-events-none absolute inset-0 bg-sentinel-900" style={{ opacity: 0 }} />

        {/* Controls layer: fills the panel, above the tabs. */}
        <div
          ref={boxRef}
          id={SHEET_ID}
          role="group"
          aria-label={active ? `${active.label} controls` : undefined}
          aria-hidden={!open}
          className="absolute inset-0 z-10 flex flex-col"
          style={{ opacity: 0, visibility: 'hidden' }}
        >
          {/* The open panel's handle: a gray grabber bar fixed along its top edge. */}
          <button
            ref={grabberRef}
            type="button"
            tabIndex={open ? 0 : -1}
            aria-label={active ? `Close ${active.label} controls` : 'Close controls'}
            aria-expanded={open}
            aria-controls={SHEET_ID}
            {...dragHandle(activeId)}
            onClick={(e) => { if (e.detail === 0) tapTab(activeId); }} // keyboard activation
            onKeyDown={onKeyDown(activeId)}
            className="group flex w-full shrink-0 touch-none cursor-grab select-none justify-center pt-1.5 pb-0.5 active:cursor-grabbing focus-visible:outline-none"
          >
            <span className="block h-[3px] w-12 rounded-full bg-gray-500 transition-colors duration-100 group-hover:bg-gray-400 group-active:bg-gray-300 group-focus-visible:ring-2 group-focus-visible:ring-sky-400" />
          </button>
          {/* Scrolls whenever the controls don't fit: part-way open, or capped at its share of the screen.
              The native scrollbar is hidden (it only appears mid-scroll on macOS/mobile) in favour of
              an always-visible indicator on the right while there is more to scroll. */}
          <div className="relative min-h-0 flex-1">
            <div
              ref={scrollRef}
              onScroll={updateScrollbar}
              className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div ref={contentRef} key={activeId} className="animate-fade-in motion-reduce:animate-none">
                {active?.content}
              </div>
            </div>
            <div
              className="pointer-events-none absolute top-1 bottom-1 right-1 w-1 rounded-full bg-white/10 opacity-0 transition-opacity duration-150"
              data-dock-scrollbar
              aria-hidden
            >
              <div ref={thumbRef} className="w-full rounded-full bg-gray-400/80" />
            </div>
          </div>
        </div>

        {/* Tabs layer: at the panel's foot, on the line above the bar's buttons. */}
        <div ref={stripInnerRef} aria-hidden={open} className="relative shrink-0">
          {/* Tabs stand on the line below them (flat bottoms, curved tops). */}
          <div
            ref={rowRef}
            className="relative flex w-full flex-nowrap items-end justify-start gap-1 overflow-x-auto px-2 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="Map controls — slide a tab sideways (or Shift+arrow keys) to reorder"
          >
            {tabs.map((tab) => (
              <div
                key={tab.id}
                data-dock-tab={tab.id}
                {...dragHandle(tab.id, { reorderable: true })}
                className="group relative flex min-w-[3.5rem] max-w-[10rem] shrink touch-none cursor-grab select-none flex-col rounded-t-lg rounded-b-none
                           bg-sentinel-100 dark:bg-sentinel-600 transition-colors duration-100
                           hover:bg-sentinel-200 dark:hover:bg-sentinel-500 active:cursor-grabbing"
              >
                {/* Pull bar */}
                <span
                  aria-hidden
                  className={`mx-auto mt-[3px] block h-[3px] w-6 shrink-0 rounded-full bg-sentinel-400 dark:bg-sentinel-300 transition-colors duration-100 group-hover:bg-sentinel-500 dark:group-hover:bg-white
                    ${tab.loading ? 'animate-pulse motion-reduce:animate-none' : ''}`}
                />
                <div className="flex min-w-0 items-center">
                  <button
                    type="button"
                    tabIndex={open ? -1 : 0}
                    aria-label={`Open ${tab.label} controls`}
                    title={tab.label}
                    aria-expanded={open && tab.id === activeId}
                    aria-controls={SHEET_ID}
                    onClick={(e) => { if (e.detail === 0) tapTab(tab.id); }} // keyboard activation
                    onKeyDown={onKeyDown(tab.id)}
                    className="min-w-0 flex-1 cursor-grab truncate rounded-md py-0.5 pl-2 pr-0.5 text-left text-[11px] font-semibold leading-tight text-sentinel-800 dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  >
                    {tab.label}
                  </button>
                  {onCloseTab && (
                    <button
                      type="button"
                      tabIndex={open ? -1 : 0}
                      aria-label={`Turn off ${tab.label}`}
                      title={`Turn off ${tab.label}`}
                      // Not a drag handle: pressing × never pulls the sheet.
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => onCloseTab(tab.id)}
                      className="mr-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-sentinel-500 dark:text-sentinel-200 transition hover:bg-sentinel-300 hover:text-sentinel-900 dark:hover:bg-sentinel-400 dark:hover:text-white active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                      <X size={10} strokeWidth={3} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* The thin line between the drawer tabs and the bar's buttons. */}
          <div aria-hidden className="h-px w-full bg-sentinel-300 dark:bg-sentinel-500" />
        </div>
      </div>
    </div>
  );
});

export default DockSheet;
