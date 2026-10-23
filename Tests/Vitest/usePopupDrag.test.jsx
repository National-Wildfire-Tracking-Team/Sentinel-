import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { usePopupDrag } from '../../src/app/components/Map/usePopupDrag';

// Boxes by data-box name: a 1000×800 map with the zoom buttons in its
// bottom-right corner and a 200×200 popup near the top-left.
const BOXES = {
  map: { left: 0, top: 0, right: 1000, bottom: 800 },
  zoom: { left: 940, top: 640, right: 984, bottom: 784 },
  popup: { left: 100, top: 100, right: 300, bottom: 300 },
};
const realRect = Element.prototype.getBoundingClientRect;

function Popup({ enabled = true, onOpen = () => {} }) {
  const drag = usePopupDrag('fire-1', enabled);
  return (
    <div data-box="popup" data-testid="popup" {...drag.dragProps} style={{ translate: drag.translate }}>
      <button type="button" onClick={onOpen}>Open</button>
      <input aria-label="Opacity" type="range" />
    </div>
  );
}

const renderOnMap = (ui) => render(
  <div data-map-area="" data-box="map">
    <div data-map-control="" data-box="zoom" />
    {ui}
  </div>,
);

/** Press on `el`, move by each [dx, dy] in turn (from the press point), release. */
function drag(el, ...moves) {
  fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 150, clientY: 150 });
  moves.forEach(([dx, dy]) => fireEvent.pointerMove(el, { pointerId: 1, clientX: 150 + dx, clientY: 150 + dy }));
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 150, clientY: 150 });
}

const translate = () => screen.getByTestId('popup').style.translate;

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function getBox() {
    const box = BOXES[this.dataset?.box] ?? { left: 0, top: 0, right: 0, bottom: 0 };
    return { ...box, x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top };
  };
});
afterEach(async () => {
  Element.prototype.getBoundingClientRect = realRect;
  // Let a finished drag drop its one-shot click swallower (a browser fires
  // the click right after the pointerup; these tests may not).
  await new Promise((r) => setTimeout(r, 0));
});

describe('usePopupDrag (Popup Draggability)', () => {
  it('drags the popup by any part of it, 1:1 with the pointer', () => {
    renderOnMap(<Popup />);
    drag(screen.getByRole('button', { name: 'Open' }), [50, 20]);
    expect(translate()).toBe('50px 20px');
  });

  it('keeps a press that barely moves a click, and swallows the click a drag ends in', () => {
    const onOpen = vi.fn();
    renderOnMap(<Popup onOpen={onOpen} />);
    const open = screen.getByRole('button', { name: 'Open' });

    drag(open, [3, 2]);
    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(translate()).toBe('0px 0px');

    drag(open, [40, 0]);
    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('never drags from a form control', () => {
    renderOnMap(<Popup />);
    drag(screen.getByRole('slider', { name: 'Opacity' }), [60, 0]);
    expect(translate()).toBe('0px 0px');
  });

  it('stops at the edge of the map', () => {
    renderOnMap(<Popup />);
    drag(screen.getByTestId('popup'), [-500, 0]);
    const [x, y] = translate().split(' ').map(parseFloat);
    expect(x).toBeLessThanOrEqual(-97);
    expect(x).toBeGreaterThanOrEqual(-100);
    expect(y).toBe(0);
  });

  it('stops at a map control instead of covering it', () => {
    renderOnMap(<Popup />);
    // Straight there would cover the zoom buttons: it stops just short of them.
    drag(screen.getByTestId('popup'), [700, 450]);
    const [x, y] = translate().split(' ').map(parseFloat);
    const right = BOXES.popup.right + x;
    expect(right).toBeLessThanOrEqual(BOXES.zoom.left);
    expect(right).toBeGreaterThan(BOXES.zoom.left - 4);
    expect(BOXES.popup.bottom + y).toBeGreaterThan(BOXES.zoom.top);
  });

  it('slides along a map control when the pointer goes past it', () => {
    renderOnMap(<Popup />);
    // Level with the zoom buttons, pushing right then down past them.
    drag(screen.getByTestId('popup'), [600, 0], [900, 300]);
    const [x, y] = translate().split(' ').map(parseFloat);
    expect(BOXES.popup.right + x).toBeLessThanOrEqual(BOXES.map.right);
    expect(BOXES.popup.bottom + y).toBeLessThanOrEqual(BOXES.zoom.top + 1);
    expect(y).toBeGreaterThan(0);
  });

  it('picks the pointer back up after being held at an edge', () => {
    renderOnMap(<Popup />);
    drag(screen.getByTestId('popup'), [-500, 0], [-20, 0]);
    expect(translate()).toBe('-20px 0px');
  });

  it('stays put with the preference off', () => {
    renderOnMap(<Popup enabled={false} />);
    drag(screen.getByTestId('popup'), [50, 20]);
    expect(translate()).toBe('');
  });
});
