/**
 * DockSheet.jsx
 * Pull-up controls sheet on the bottom bar's top edge, shared by every layer
 * that has slider controls (see MapDockSheet.jsx). Each such layer that is on
 * gets a tab: a small notch holding a gray grabber bar over its name. Up to
 * MAX_TABS tabs show at once, all the same width and centered on the bar as
 * one row whatever their number; on a narrow bar they shrink evenly. Each
 * tab names its layer under the gray bar, even a lone one. Drag a tab up (or
 * tap it) to open the sheet with that layer's controls; the other tabs hide
 * as soon as the pull starts. The open sheet has no notch, just a gray grabber
 * bar along its top edge: drag it (or tap it) to close.
 *
 * Opening is two steps along one gesture: first the bottom bar's curved top
 * corners fold out to square (--dock-sheet-fold, see index.css) while the
 * pulled tab's notch fades away, and only then does the sheet extend up from
 * the squared edge, its own top corners curving in as it rises. Closing
 * reverses it and the tabs come back.
 *
 * The drag tracks the pointer 1:1 and can be grabbed mid-animation. Let go
 * gently and the sheet stays where it was left (any height; nearly closed
 * closes). Flick it and the flick's projected momentum picks fully open or
 * closed, reached on a critically damped spring that starts at the finger's
 * velocity. The sheet never takes more than the bottom third of the screen
 * (a tab with many controls can allow itself more, see `maxShare`): beyond
 * that it stops (with a little rubber-band), and whenever its
 * controls don't fit (capped or only part-way open) they scroll inside it,
 * under the fixed gray grabber bar. It only moves while a tab is held: the drag ends on release, on
 * lost pointer capture, or as soon as no button is pressed. Height changes
 * are applied straight to the DOM while moving; the page only hears about
 * the settled height (onSettledHeight).
 */

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const TAP_SLOP = 6; // px of movement before a press becomes a drag
const FOLD_PX = 20; // travel spent folding the bar's corners square before the sheet rises
const SPRING_RESPONSE = 0.32; // s, critically damped (no overshoot)
const DECELERATION = 0.998;
const FLICK_PX_S = 600; // release speed above which a flick snaps fully open/closed
const MIN_OPEN_PX = 28; // released with less sheet showing than this: close
const MIN_SHEET_PX = 96; // the screen-share cap never goes below this
const DEFAULT_MAX_SHARE = 1 / 3; // of the screen's height, unless a tab sets maxShare
const SHEET_ID = 'map-dock-sheet';
export const MAX_TABS = 5;

/** Where a flick would come to rest (Apple's scroll-deceleration projection), px. */
const project = (velocity) => ((velocity / 1000) * DECELERATION) / (1 - DECELERATION);

/** Soft resistance past an edge. */
const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {{
 *   tabs: { id: string, label: string, loading?: boolean, content: import('react').ReactNode, maxShare?: number }[],
 *   bottomOffset: number, bottomBarWidth?: number, onSettledHeight?: (px: number) => void,
 * }} props
 *   maxShare: how far up the screen this tab's sheet may reach, as a share of its height (default a third)
 */
const DockSheet = memo(function DockSheet({ tabs: allTabs, bottomOffset, bottomBarWidth, onSettledHeight }) {
  const tabs = allTabs.slice(0, MAX_TABS);
  const rootRef = useRef(null);
  const tabRowRef = useRef(null);
  const boxRef = useRef(null); // the sheet body whose height animates
  const grabberRef = useRef(null); // fixed gray bar at the sheet's top
  const contentRef = useRef(null); // natural-height content, inside the scroll area
  const scrollRef = useRef(null); // the scroll area
  const thumbRef = useRef(null); // always-visible scroll indicator (overlay scrollbars hide until used)
  const fullyOpen = useRef(false); // settled at the full (capped) height
  const bottomRef = useRef(bottomOffset);
  useEffect(() => { bottomRef.current = bottomOffset; }, [bottomOffset]);
  // Sheet position along the gesture, px: 0..FOLD_PX folds the bar's corners,
  // beyond that is the sheet body's height.
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

  /** Natural sheet height: grabber + all its controls. */
  const fullHeight = () => (grabberRef.current?.offsetHeight ?? 0) + (contentRef.current?.offsetHeight ?? 0);
  /** Tallest the sheet may be: its content, but reaching no further up the screen than its tab's share (a third by default). */
  const openHeight = () => {
    const share = sharesRef.current[shownIdRef.current] ?? DEFAULT_MAX_SHARE;
    const cap = (typeof window !== 'undefined' ? window.innerHeight : 900) * share - (Number(bottomRef.current) || 0);
    return Math.min(fullHeight(), Math.max(MIN_SHEET_PX, cap));
  };
  const openPos = () => FOLD_PX + openHeight();
  useEffect(() => { shownIdRef.current = activeId; }, [activeId]);
  const tabHeight = () => tabRowRef.current?.offsetHeight ?? 0;

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

  /** Bar corner fold 0 (curved) .. 1 (square), set on the shared map container. */
  const setFold = useCallback((f) => {
    rootRef.current?.parentElement?.style.setProperty('--dock-sheet-fold', String(f));
  }, []);

  const apply = useCallback((position) => {
    pos.current = position;
    const box = boxRef.current;
    if (!box) return;
    const fold = Math.min(1, Math.max(0, position / FOLD_PX));
    setFold(fold);
    // The pulled tab's notch fades out as the corners fold; the other tabs hide
    // as soon as the sheet moves. Closed again, all come back.
    const pulled = drag.current?.id ?? shownIdRef.current;
    const moving = position > 0.5;
    tabRowRef.current?.querySelectorAll('[data-dock-tab]').forEach((el) => {
      const isPulled = el.dataset.dockTab === pulled;
      el.style.transition = isPulled ? 'none' : 'opacity 120ms ease-out';
      el.style.opacity = String(isPulled ? 1 - fold : moving ? 0 : 1);
      el.style.pointerEvents = moving && (!isPulled || fold >= 1) ? 'none' : '';
    });
    // The sheet only rises once the corners have folded square.
    const height = Math.max(0, position - FOLD_PX);
    box.style.height = `${height}px`;
    box.style.visibility = height < 0.5 ? 'hidden' : 'visible';
    const full = openHeight();
    const p = full ? Math.min(1, height / full) : 0;
    const radius = `${Math.min(16 * p, height / 2)}px`; // the sheet's corners curve in as it rises
    box.style.borderTopLeftRadius = radius;
    box.style.borderTopRightRadius = radius;
    updateScrollbar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openHeight only reads refs
  }, [setFold, updateScrollbar]);

  /** The sheet has come to rest at `position`. */
  const settle = useCallback((position) => {
    const height = Math.max(0, position - FOLD_PX);
    fullyOpen.current = height > 0 && position >= openPos() - 0.5;
    setOpen(height > 0.5);
    onSettledHeight?.(tabHeight() + height);
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

  // No tabs: nothing docked. Tabs back: report the closed tab row.
  useEffect(() => {
    if (visible) {
      onSettledHeight?.(tabHeight() + Math.max(0, pos.current - FOLD_PX));
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

  // The container outlives the sheet: leave the bar with its rounded corners.
  useEffect(() => {
    if (!visible) return undefined;
    const container = rootRef.current?.parentElement;
    return () => container?.style.removeProperty('--dock-sheet-fold');
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

  const onPointerDown = (id) => (e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    cancelAnimationFrame(anim.current); // grab it mid-flight, from where it is now
    if (!open && pos.current < FOLD_PX) { // pulling a closed sheet up by this tab
      setChosenId(id);
      shownIdRef.current = id;
    }
    drag.current = {
      id, pointerId: e.pointerId, y: e.clientY, p0: pos.current, moved: false, samples: [{ y: e.clientY, t: performance.now() }],
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
    if (!d.moved && Math.abs(dy) < TAP_SLOP) return;
    d.moved = true;
    d.samples.push({ y: e.clientY, t: performance.now() });
    if (d.samples.length > 6) d.samples.shift();
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
    const velocity = dt > 0 ? (first.y - last.y) / dt : 0;
    const max = openPos();
    // A flick: its projected momentum picks fully open or closed.
    if (Math.abs(velocity) > FLICK_PX_S) {
      animateTo(pos.current + project(velocity) > max / 2, velocity);
      return;
    }
    // Otherwise it stays where it was left: back inside the cap if pulled past
    // it, closed if barely any sheet is showing.
    if (pos.current > max) springTo(max, velocity);
    else if (pos.current < FOLD_PX + MIN_OPEN_PX) springTo(0, velocity);
    else settle(pos.current);
  }

  const onKeyDown = (id) => (e) => {
    if (e.key === 'ArrowUp' && !open) { e.preventDefault(); openTab(id); }
    if (e.key === 'ArrowDown' && open) { e.preventDefault(); animateTo(false); }
  };

  if (!visible) return null;

  return (
    <div
      ref={rootRef}
      data-map-control=""
      className="absolute left-1/2 -translate-x-1/2 z-[var(--bar-z,20)] flex flex-col pointer-events-none"
      style={{
        bottom: bottomOffset,
        width: bottomBarWidth ? `max(${bottomBarWidth}px, min(24rem, calc(100vw - 1rem)))` : 'min(24rem, calc(100vw - 1rem))',
        maxWidth: 'calc(100vw - 1rem)',
      }}
    >
      {/* Tabs: one centered row, same width (shrinking evenly to fit MAX_TABS); hidden while the sheet is open. */}
      <div ref={tabRowRef} className="flex w-full flex-nowrap items-end justify-center gap-1 px-2" role="group" aria-label="Map controls" aria-hidden={open}>
        {tabs.map((tab) => {
          const current = tab.id === activeId;
          return (
            <button
              key={tab.id}
              data-dock-tab={tab.id}
              type="button"
              tabIndex={open ? -1 : 0}
              aria-label={`Open ${tab.label} controls`}
              aria-expanded={open && current}
              aria-controls={SHEET_ID}
              onPointerDown={onPointerDown(tab.id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onLostPointerCapture={onPointerUp}
              onClick={(e) => { if (e.detail === 0) tapTab(tab.id); }} // keyboard activation
              onKeyDown={onKeyDown(tab.id)}
              className="group pointer-events-auto -mb-px flex min-w-0 shrink grow-0 basis-[7.5rem] touch-none cursor-grab select-none items-end pt-3 active:cursor-grabbing focus-visible:outline-none"
            >
              <span
                className={`flex w-full flex-col items-center gap-[2px] rounded-t-lg border border-b-0 border-sentinel-600 bg-sentinel-900 pt-1 pb-0.5
                           group-focus-visible:ring-2 group-focus-visible:ring-sky-400`}
              >
                <span
                  className={`block h-[3px] w-12 max-w-[70%] rounded-full bg-gray-500 transition-colors duration-100 group-hover:bg-gray-400 group-active:bg-gray-300
                    ${tab.loading ? 'animate-pulse motion-reduce:animate-none' : ''}`}
                />
                <span className="max-w-full truncate px-1 text-[10px] font-semibold leading-none tracking-[0.02em] text-sentinel-300">
                  {tab.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Sheet body: height driven by the drag/spring above. */}
      <div
        ref={boxRef}
        id={SHEET_ID}
        role="group"
        aria-label={active ? `${active.label} controls` : undefined}
        aria-hidden={!open}
        className="pointer-events-auto flex w-full flex-col overflow-hidden border border-b-0 border-sentinel-600 bg-sentinel-900 shadow-2xl shadow-black/60"
        style={{ height: 0, visibility: 'hidden' }}
      >
        {/* Open sheet's only handle: a gray grabber bar fixed along its top edge. */}
        <button
          ref={grabberRef}
          type="button"
          tabIndex={open ? 0 : -1}
          aria-label={active ? `Close ${active.label} controls` : 'Close controls'}
          aria-expanded={open}
          aria-controls={SHEET_ID}
          onPointerDown={onPointerDown(activeId)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={onPointerUp}
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
    </div>
  );
});

export default DockSheet;
