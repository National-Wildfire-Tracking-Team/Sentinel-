import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DockSheet from '../../src/app/components/Map/DockSheet';
import RadarSitePanel from '../../src/app/components/Map/RadarSitePanel';
import { useRadarSiteContext } from '../../src/app/context/RadarSiteContext';

vi.mock('../../src/app/context/RadarSiteContext', () => ({ useRadarSiteContext: vi.fn() }));
vi.mock('../../src/app/hooks/useTimeFormat', () => ({ useTimeFormat: () => {} }));

const TABS = [
  { id: 'mrms', label: 'MRMS Radar', content: <div>MRMS controls</div> },
  { id: 'radarSite', label: 'Radar Site', content: <div>Radar Site controls</div> },
];

beforeEach(() => {
  window.localStorage.clear(); // no remembered tab order
  window.matchMedia = vi.fn(() => ({ matches: true })); // reduced motion: settle instantly
  globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
  // jsdom has no layout: give tabs and content a measured height
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 64 });
});

describe('DockSheet', () => {
  it('renders nothing and reports no height without tabs', () => {
    const onSettledHeight = vi.fn();
    const { container } = render(<DockSheet tabs={[]} onSettledHeight={onSettledHeight} />);
    expect(container).toBeEmptyDOMElement();
    expect(onSettledHeight).toHaveBeenLastCalledWith(0);
  });

  it('shows one tab per layer on the bar, and fills the same panel with controls when open', async () => {
    const onSettledHeight = vi.fn();
    const { container } = render(<DockSheet tabs={TABS} onSettledHeight={onSettledHeight} />);
    const mrms = screen.getByRole('button', { name: 'Open MRMS Radar controls' });
    const site = screen.getByRole('button', { name: 'Open Radar Site controls' });
    expect(mrms.closest('[data-dock-tab]').className).toBe(site.closest('[data-dock-tab]').className); // same tab style
    const panel = container.querySelector('[data-dock-panel]');
    expect(panel.style.height).toBe(''); // closed: just the tabs, at their natural height
    expect(onSettledHeight).toHaveBeenLastCalledWith(64);

    fireEvent.click(site); // keyboard-style activation (detail 0)
    const grabber = await screen.findByRole('button', { name: 'Close Radar Site controls' });
    expect(grabber).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Radar Site controls')).toBeInTheDocument();
    // Open: the one panel is as tall as the controls (grabber + content); the tabs are hidden in it
    expect(panel.style.height).toBe('128px');
    expect(onSettledHeight).toHaveBeenLastCalledWith(128);
    expect(site.closest('[aria-hidden]')).toHaveAttribute('aria-hidden', 'true');
    expect(site).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(grabber, { key: 'ArrowDown' });
    await waitFor(() => expect(panel.style.height).toBe(''));
    expect(onSettledHeight).toHaveBeenLastCalledWith(64);

    fireEvent.click(mrms);
    await screen.findByText('MRMS controls');
  });

  it("turns a tab's layer off with its ×, without opening the panel", () => {
    const onCloseTab = vi.fn();
    const { container } = render(<DockSheet tabs={TABS} onCloseTab={onCloseTab} />);
    const close = screen.getByRole('button', { name: 'Turn off Radar Site' });
    fireEvent.pointerDown(close, { pointerId: 1, button: 0, buttons: 1, clientY: 500 });
    fireEvent.click(close);
    expect(onCloseTab).toHaveBeenCalledWith('radarSite');
    expect(container.querySelector('[data-dock-panel]').style.height).toBe('');
  });

  it('has no × when nothing can turn the layer off', () => {
    render(<DockSheet tabs={TABS} />);
    expect(screen.queryByRole('button', { name: /^Turn off/ })).not.toBeInTheDocument();
  });

  it("raises the panel's top with the pull, fading the tabs out and the controls in, and only follows while held", async () => {
    const { container } = render(<DockSheet tabs={TABS} />);
    const tab = container.querySelector('[data-dock-tab="radarSite"]');
    const panel = container.querySelector('[data-dock-panel]');
    const controls = container.querySelector('#map-dock-sheet');
    const tabsLayer = tab.closest('[aria-hidden]');

    fireEvent.pointerDown(tab, { pointerId: 1, button: 0, buttons: 1, clientY: 500 });
    fireEvent.pointerMove(tab, { pointerId: 1, buttons: 1, clientY: 470 });
    // 30px pulled: the top edge has risen 30px off the tabs' height; no gap, one panel
    expect(panel.style.height).toBe('94px');
    const early = 30 / 96; // the crossfade runs over 1.5 tab-heights
    expect(Number(tabsLayer.style.opacity)).toBeCloseTo(1 - early * 2);
    expect(controls.style.opacity).toBe('0'); // the controls only come in from a third of the way
    fireEvent.pointerMove(tab, { pointerId: 1, buttons: 1, clientY: 440 });
    const later = 60 / 96;
    expect(panel.style.height).toBe('124px');
    expect(tabsLayer.style.visibility).toBe('hidden'); // tabs gone by halfway
    expect(Number(controls.style.opacity)).toBeCloseTo((later - 1 / 3) * 1.5);
    expect(screen.getByText('Radar Site controls')).toBeInTheDocument(); // pulled by its tab

    // Release missed: the next move with no buttons down ends the drag instead of following
    fireEvent.pointerMove(tab, { pointerId: 1, buttons: 0, clientY: 300 });
    await waitFor(() => expect(['', '128px']).toContain(panel.style.height));
    const settled = panel.style.height;
    fireEvent.pointerMove(tab, { pointerId: 1, buttons: 0, clientY: 200 });
    expect(panel.style.height).toBe(settled);
  });

  it('names each tab, even when it is the only one', () => {
    const { rerender } = render(<DockSheet tabs={[TABS[0]]} />);
    expect(screen.getByRole('button', { name: 'Open MRMS Radar controls' })).toHaveTextContent('MRMS Radar');
    rerender(<DockSheet tabs={TABS} />);
    expect(screen.getByRole('button', { name: 'Open MRMS Radar controls' })).toHaveTextContent('MRMS Radar');
    expect(screen.getByRole('button', { name: 'Open Radar Site controls' })).toHaveTextContent('Radar Site');
  });

  it('stays where a gentle drag leaves it, part-way open', () => {
    const onSettledHeight = vi.fn();
    const { container } = render(<DockSheet tabs={TABS} onSettledHeight={onSettledHeight} />);
    const tab = container.querySelector('[data-dock-tab="radarSite"]');
    const panel = container.querySelector('[data-dock-panel]');
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const move = (y, t) => { now = t; fireEvent.pointerMove(tab, { pointerId: 1, buttons: 1, clientY: y }); };
    fireEvent.pointerDown(tab, { pointerId: 1, button: 0, buttons: 1, clientY: 500 });
    move(490, 100); move(470, 300); move(450, 600); // slow
    now = 900; // held still, then let go
    fireEvent.pointerUp(tab, { pointerId: 1, clientY: 450 });
    clock.mockRestore();
    expect(panel.style.height).toBe('114px'); // risen 50px and left there, not snapped to 128
    expect(onSettledHeight).toHaveBeenLastCalledWith(114);
    expect(screen.getByRole('button', { name: 'Close Radar Site controls' })).toHaveAttribute('aria-expanded', 'true');
    // The controls scroll inside the part-open panel, with a scroll indicator on the right
    const controls = container.querySelector('#map-dock-sheet');
    expect(controls.querySelector('.overflow-y-auto')).toContainElement(screen.getByText('Radar Site controls'));
    expect(controls.querySelector('[data-dock-scrollbar]')).toBeInTheDocument();
  });

  it('closes when let go having barely risen', () => {
    const { container } = render(<DockSheet tabs={TABS} />);
    const tab = container.querySelector('[data-dock-tab="radarSite"]');
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    fireEvent.pointerDown(tab, { pointerId: 1, button: 0, buttons: 1, clientY: 500 });
    now = 300; fireEvent.pointerMove(tab, { pointerId: 1, buttons: 1, clientY: 480 }); // 20px: under 28
    now = 900;
    fireEvent.pointerUp(tab, { pointerId: 1, clientY: 480 });
    clock.mockRestore();
    expect(container.querySelector('[data-dock-panel]').style.height).toBe('');
  });

  it('never grows past the bottom third of the screen', async () => {
    const tall = window.innerHeight;
    window.innerHeight = 300; // a third is 100px; minus the 16px offset leaves 84 → floor of 96
    try {
      const { container } = render(<DockSheet tabs={TABS} bottomOffset={16} />);
      fireEvent.click(screen.getByRole('button', { name: 'Open Radar Site controls' }));
      await screen.findByRole('button', { name: 'Close Radar Site controls' });
      expect(container.querySelector('[data-dock-panel]').style.height).toBe('96px'); // not the 128px of content
    } finally {
      window.innerHeight = tall;
    }
  });

  it('lets a tab with many controls reach further up the screen, sized to its own controls when tapped', async () => {
    const tall = window.innerHeight;
    window.innerHeight = 960; // a third reaches 320px up, 3/8 reaches 360px; both minus the 16px offset
    // The aviation controls are much taller than fit; everything else measures 64px.
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() { return this.textContent?.includes('Aviation controls') ? 900 : 64; },
    });
    const tabs = [TABS[0], { id: 'awc', label: 'Aviation Weather', maxShare: 3 / 8, content: <div>Aviation controls</div> }];
    try {
      const { container, rerender } = render(<DockSheet tabs={tabs} bottomOffset={16} />);
      const body = container.querySelector('[data-dock-panel]');
      fireEvent.click(screen.getByRole('button', { name: 'Open Aviation Weather controls' }));
      const grabber = await screen.findByRole('button', { name: 'Close Aviation Weather controls' });
      expect(body.style.height).toBe('344px');

      // The MRMS tab keeps the usual third, and opens to its own (short) controls, not the aviation ones.
      fireEvent.keyDown(grabber, { key: 'ArrowDown' });
      fireEvent.click(await screen.findByRole('button', { name: 'Open MRMS Radar controls' }));
      await screen.findByRole('button', { name: 'Close MRMS Radar controls' });
      expect(body.style.height).toBe('128px');
      fireEvent.keyDown(screen.getByRole('button', { name: 'Close MRMS Radar controls' }), { key: 'ArrowDown' });

      // Same cap logic for a tall MRMS panel: a third, not 3/8.
      const tallMrms = [{ ...TABS[0], content: <div>Aviation controls in MRMS</div> }, tabs[1]];
      rerender(<DockSheet tabs={tallMrms} bottomOffset={16} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Open MRMS Radar controls' }));
      await screen.findByRole('button', { name: 'Close MRMS Radar controls' });
      expect(body.style.height).toBe('304px');
    } finally {
      window.innerHeight = tall;
    }
  });

  it('shows every docked layer as a tab (up to nine)', () => {
    const many = 'ABCDEFGHIJ'.split('').map((l) => ({ id: l, label: `Layer ${l}`, content: <div>{l}</div> }));
    const { container } = render(<DockSheet tabs={many} />);
    expect(container.querySelectorAll('[data-dock-tab]')).toHaveLength(9);
    expect(screen.queryByRole('button', { name: 'Open Layer J controls' })).not.toBeInTheDocument();
  });

  it('closes when the open tab\'s layer is switched off', async () => {
    const { rerender } = render(<DockSheet tabs={TABS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Radar Site controls' }));
    await screen.findByRole('button', { name: 'Close Radar Site controls' });
    rerender(<DockSheet tabs={[TABS[0]]} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open MRMS Radar controls' })).toHaveAttribute('tabindex', '0'));
    expect(screen.queryByRole('button', { name: /Radar Site/ })).not.toBeInTheDocument();
  });
});

describe('DockSheet tab reordering', () => {
  const THREE = [
    { id: 'a', label: 'Alpha', content: <div>A</div> },
    { id: 'b', label: 'Bravo', content: <div>B</div> },
    { id: 'c', label: 'Charlie', content: <div>C</div> },
  ];
  const order = (container) => [...container.querySelectorAll('[data-dock-tab]')].map((el) => el.dataset.dockTab);

  beforeEach(() => {
    // Lay tabs out left to right in DOM order: 96px wide, 4px apart.
    Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
      configurable: true,
      get() { return this.dataset?.dockTab ? [...this.parentElement.children].indexOf(this) * 100 : 0; },
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() { return this.dataset?.dockTab ? 96 : 0; },
    });
  });

  const slide = (el, dxs) => {
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, buttons: 1, clientX: 50, clientY: 500 });
    dxs.forEach((dx) => fireEvent.pointerMove(el, { pointerId: 1, buttons: 1, clientX: 50 + dx, clientY: 500 }));
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 50 + dxs[dxs.length - 1], clientY: 500 });
  };

  it('moves a tab slid sideways past its neighbour, and remembers the order', () => {
    const { container } = render(<DockSheet tabs={THREE} />);
    const a = container.querySelector('[data-dock-tab="a"]');
    slide(a, [10, 80, 160]); // its middle (48 + 160) passes Bravo's (148), not Charlie's (248)
    expect(order(container)).toEqual(['b', 'a', 'c']);
    expect(JSON.parse(window.localStorage.getItem('sentinel:dockTabOrder'))).toEqual(['b', 'a', 'c']);
    // Sliding sideways never opens the panel
    expect(container.querySelector('[data-dock-panel]').style.height).toBe('');

    // A fresh mount keeps the remembered order
    const again = render(<DockSheet tabs={THREE} />);
    expect(order(again.container)).toEqual(['b', 'a', 'c']);
  });

  it('springs a tab back to its slot when it is not slid far enough', () => {
    const { container } = render(<DockSheet tabs={THREE} />);
    const a = container.querySelector('[data-dock-tab="a"]');
    slide(a, [10, 30]);
    expect(order(container)).toEqual(['a', 'b', 'c']);
    expect(a.style.transform).toBe(''); // reduced motion: straight home
  });

  it('packs to the left: a tab slid past the last one lands at the end, against it', () => {
    const { container } = render(<DockSheet tabs={THREE} />);
    slide(container.querySelector('[data-dock-tab="a"]'), [10, 400]);
    expect(order(container)).toEqual(['b', 'c', 'a']);
  });

  it('still opens the sheet when a tab is pulled up', async () => {
    const { container } = render(<DockSheet tabs={THREE} />);
    const b = container.querySelector('[data-dock-tab="b"]');
    fireEvent.pointerDown(b, { pointerId: 1, button: 0, buttons: 1, clientX: 50, clientY: 500 });
    fireEvent.pointerMove(b, { pointerId: 1, buttons: 1, clientX: 52, clientY: 480 });
    fireEvent.pointerMove(b, { pointerId: 1, buttons: 1, clientX: 54, clientY: 450 });
    expect(container.querySelector('[data-dock-panel]').style.height).toBe('114px');
    expect(order(container)).toEqual(['a', 'b', 'c']);
  });

  it('moves the focused tab with Shift+arrow keys', () => {
    const { container } = render(<DockSheet tabs={THREE} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open Charlie controls' }), { key: 'ArrowLeft', shiftKey: true });
    expect(order(container)).toEqual(['a', 'c', 'b']);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open Alpha controls' }), { key: 'ArrowLeft', shiftKey: true });
    expect(order(container)).toEqual(['a', 'c', 'b']); // already first
  });

  it('puts a newly docked layer at the end', () => {
    window.localStorage.setItem('sentinel:dockTabOrder', JSON.stringify(['c', 'a']));
    const { container } = render(<DockSheet tabs={THREE} />);
    expect(order(container)).toEqual(['c', 'a', 'b']);
  });
});

describe('RadarSitePanel (sheet contents)', () => {
  const base = { active: true, site: null, product: null, status: 'idle', scan: null, error: null, stale: false, retry: vi.fn() };

  it('shows the selected station status first, with retry and no clear button', () => {
    const retry = vi.fn();
    useRadarSiteContext.mockReturnValue({
      ...base, retry, status: 'ready',
      site: { id: 'KTLX', place: 'Oklahoma City', state: 'OK' },
      product: { label: 'Base Reflectivity' },
      scan: { time: Date.now(), elevation: 0.5 },
      error: new Error('offline'),
    });
    render(<RadarSitePanel />);
    expect(screen.getByText('KTLX · Oklahoma City, OK')).toBeInTheDocument();
    expect(screen.getByText(/Base Reflectivity 0\.5° · .* · couldn't refresh/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Clear radar site/ })).not.toBeInTheDocument();
  });

  it('prompts to pick a station when none is selected', () => {
    useRadarSiteContext.mockReturnValue(base);
    render(<RadarSitePanel />);
    expect(screen.getByText('No radar site selected')).toBeInTheDocument();
  });
});
