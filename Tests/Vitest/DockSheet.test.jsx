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

  it('shows one same-width tab per layer, centered, and opens with the tab that was pulled', async () => {
    const onSettledHeight = vi.fn();
    const { container } = render(<DockSheet tabs={TABS} onSettledHeight={onSettledHeight} />);
    const mrms = screen.getByRole('button', { name: 'Open MRMS Radar controls' });
    const site = screen.getByRole('button', { name: 'Open Radar Site controls' });
    expect(mrms.firstChild.className).toBe(site.firstChild.className); // same fixed-width notch
    expect(mrms.parentElement.className).toMatch(/justify-center/);
    expect(onSettledHeight).toHaveBeenLastCalledWith(64); // tab row only

    fireEvent.click(site); // keyboard-style activation (detail 0)
    const grabber = await screen.findByRole('button', { name: 'Close Radar Site controls' });
    expect(grabber).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Radar Site controls')).toBeInTheDocument();
    expect(onSettledHeight).toHaveBeenLastCalledWith(64 + 128); // tabs + sheet (grabber + content)
    // Open: the tabs are hidden; the sheet's own gray bar is the handle
    expect(screen.queryByRole('button', { name: 'Open MRMS Radar controls' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-dock-tab="mrms"]').style.opacity).toBe('0');
    expect(container.querySelector('[data-dock-tab="radarSite"]').style.opacity).toBe('0');

    fireEvent.keyDown(grabber, { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open MRMS Radar controls' })).toBeInTheDocument());
    expect(container.querySelector('[data-dock-tab="mrms"]').style.opacity).toBe('1');

    fireEvent.click(mrms);
    await screen.findByText('MRMS controls');
  });

  it('folds the bar corners square before the sheet rises, and only follows while held', async () => {
    const { container } = render(<DockSheet tabs={TABS} />);
    const grabber = screen.getByRole('button', { name: 'Open Radar Site controls' });
    grabber.setPointerCapture = vi.fn();
    const body = container.querySelector('#map-dock-sheet');
    const fold = () => container.style.getPropertyValue('--dock-sheet-fold');

    fireEvent.pointerDown(grabber, { pointerId: 1, button: 0, buttons: 1, clientY: 500 });
    fireEvent.pointerMove(grabber, { pointerId: 1, buttons: 1, clientY: 490 });
    expect(body.style.height).toBe('0px'); // first 20px only fold the corners
    expect(fold()).toBe('0.5');
    // The pulled tab's notch is fading with the fold; the other tab is hidden
    expect(grabber.style.opacity).toBe('0.5');
    expect(container.querySelector('[data-dock-tab="mrms"]').style.opacity).toBe('0');
    fireEvent.pointerMove(grabber, { pointerId: 1, buttons: 1, clientY: 470 });
    expect(fold()).toBe('1');
    expect(body.style.height).toBe('10px');
    expect(screen.getByText('Radar Site controls')).toBeInTheDocument(); // pulled by its tab

    // Release missed: the next move with no buttons down ends the drag instead of following
    fireEvent.pointerMove(grabber, { pointerId: 1, buttons: 0, clientY: 300 });
    await waitFor(() => expect(['0px', '128px']).toContain(body.style.height));
    const settled = body.style.height;
    fireEvent.pointerMove(grabber, { pointerId: 1, buttons: 0, clientY: 200 });
    expect(body.style.height).toBe(settled);
  });

  it('shows only the gray bar on a lone tab, and names once there are several', () => {
    const { rerender } = render(<DockSheet tabs={[TABS[0]]} />);
    const lone = screen.getByRole('button', { name: 'Open MRMS Radar controls' }); // still named for assistive tech
    expect(lone).not.toHaveTextContent('MRMS Radar');
    rerender(<DockSheet tabs={TABS} />);
    expect(screen.getByRole('button', { name: 'Open MRMS Radar controls' })).toHaveTextContent('MRMS Radar');
    expect(screen.getByRole('button', { name: 'Open Radar Site controls' })).toHaveTextContent('Radar Site');
  });

  it('stays where a gentle drag leaves it, part-way open', () => {
    const onSettledHeight = vi.fn();
    const { container } = render(<DockSheet tabs={TABS} onSettledHeight={onSettledHeight} />);
    const grabber = screen.getByRole('button', { name: 'Open Radar Site controls' });
    grabber.setPointerCapture = vi.fn();
    const body = container.querySelector('#map-dock-sheet');
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const move = (y, t) => { now = t; fireEvent.pointerMove(grabber, { pointerId: 1, buttons: 1, clientY: y }); };
    fireEvent.pointerDown(grabber, { pointerId: 1, button: 0, buttons: 1, clientY: 500 });
    move(480, 100); move(440, 300); move(420, 600); // slow
    now = 900; // held still, then let go
    fireEvent.pointerUp(grabber, { pointerId: 1, clientY: 420 });
    clock.mockRestore();
    expect(body.style.height).toBe('60px'); // 80px pulled − 20px fold, not snapped to 128
    expect(onSettledHeight).toHaveBeenLastCalledWith(64 + 60);
    expect(screen.getByRole('button', { name: 'Close Radar Site controls' })).toHaveAttribute('aria-expanded', 'true');
    // The controls scroll inside the part-open sheet, with a scroll indicator on the right
    expect(body.querySelector('.overflow-y-auto')).toContainElement(screen.getByText('Radar Site controls'));
    expect(body.querySelector('[data-dock-scrollbar]')).toBeInTheDocument();
  });

  it('never grows past the bottom third of the screen', async () => {
    const tall = window.innerHeight;
    window.innerHeight = 300; // a third is 100px; minus the 16px offset leaves 84 → floor of 96
    try {
      const { container } = render(<DockSheet tabs={TABS} bottomOffset={16} />);
      fireEvent.click(screen.getByRole('button', { name: 'Open Radar Site controls' }));
      await screen.findByRole('button', { name: 'Close Radar Site controls' });
      expect(container.querySelector('#map-dock-sheet').style.height).toBe('96px'); // not the 128px of content
    } finally {
      window.innerHeight = tall;
    }
  });

  it('shows at most five tabs at once', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F'].map((l) => ({ id: l, label: `Layer ${l}`, content: <div>{l}</div> }));
    const { container } = render(<DockSheet tabs={many} />);
    expect(container.querySelectorAll('[data-dock-tab]')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Open Layer F controls' })).not.toBeInTheDocument();
  });

  it('closes when the open tab\'s layer is switched off', async () => {
    const { rerender } = render(<DockSheet tabs={TABS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Radar Site controls' }));
    await screen.findByRole('button', { name: 'Close Radar Site controls' });
    rerender(<DockSheet tabs={[TABS[0]]} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open MRMS Radar controls' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Radar Site/ })).not.toBeInTheDocument();
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
