import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { buildSweep, snapDbz } from '../../src/app/utils/radarSweep';
import RadarSitePanel from '../../src/app/components/Map/RadarSitePanel';
import { useRadarSiteContext } from '../../src/app/context/RadarSiteContext';

vi.mock('../../src/app/context/RadarSiteContext', () => ({ useRadarSiteContext: vi.fn() }));

describe('snapDbz', () => {
  it('moves by 1 between the tens', () => {
    expect(snapDbz(15)).toBe(15);
    expect(snapDbz(23)).toBe(23);
    expect(snapDbz(47)).toBe(47);
  });

  it('snaps to the nearest 10 when close to it', () => {
    expect(snapDbz(12)).toBe(10);
    expect(snapDbz(18)).toBe(20);
    expect(snapDbz(1)).toBe(0);
    expect(snapDbz(69)).toBe(70);
  });

  it('stays within 0…70', () => {
    expect(snapDbz(-5)).toBe(0);
    expect(snapDbz(95)).toBe(70);
  });
});

describe('buildSweep', () => {
  it('carries the level → value scale for the gate filter', () => {
    const scan = { productCode: 153, lat: 0, lon: 0, gateKm: 1, firstGate: 0, gates: 1, valueMin: -32, valueInc: 0.5, radials: [{ start: 0, width: 1, data: new Uint8Array([2]) }] };
    expect(buildSweep(scan)).toMatchObject({ valueMin: -32, valueInc: 0.5 });
  });
});

describe('RadarSitePanel — Reflectivity Gates and Opacity', () => {
  const fns = { setDbzLow: vi.fn(), setDbzHigh: vi.fn(), setOpacity: vi.fn(), setKind: vi.fn() };
  const renderPanel = (state = {}) => {
    Object.values(fns).forEach((f) => f.mockReset());
    useRadarSiteContext.mockReturnValue({
      active: true, site: null, kind: 'reflectivity', chosenKind: 'reflectivity', dbzLow: 0, dbzHigh: 70, opacity: 1, retry: vi.fn(), ...fns, ...state,
    });
    return render(<RadarSitePanel />);
  };

  it('shows the L/H gates (0 … 70+), the recommendation and opacity, without the data credit', () => {
    renderPanel();
    expect(screen.getByText('Reflectivity Gates')).toBeInTheDocument();
    expect(screen.getByText('Recommended minimum of 10dBZ')).toBeInTheDocument();
    const low = screen.getByLabelText('L: lowest reflectivity shown');
    const high = screen.getByLabelText('H: highest reflectivity shown');
    for (const el of [low, high]) {
      expect(el).toHaveAttribute('min', '0');
      expect(el).toHaveAttribute('max', '70');
      expect(el).toHaveAttribute('step', '1');
    }
    expect(high).toHaveAttribute('aria-valuetext', '70+ dBZ, no upper limit');
    expect(screen.getByLabelText('Opacity')).toHaveValue('100');
    expect(screen.queryByText(/NOAA NWS NEXRAD/)).toBeNull();
  });

  it('moves L and H independently, snapping near the tens', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('L: lowest reflectivity shown'), { target: { value: '15' } });
    expect(fns.setDbzLow).toHaveBeenLastCalledWith(15);
    fireEvent.change(screen.getByLabelText('H: highest reflectivity shown'), { target: { value: '49' } });
    expect(fns.setDbzHigh).toHaveBeenLastCalledWith(50);
    expect(fns.setDbzLow).toHaveBeenCalledTimes(1);
  });

  it("doesn't let L pass H or H pass L", () => {
    renderPanel({ dbzLow: 20, dbzHigh: 40 });
    fireEvent.change(screen.getByLabelText('L: lowest reflectivity shown'), { target: { value: '55' } });
    expect(fns.setDbzLow).toHaveBeenLastCalledWith(40);
    fireEvent.change(screen.getByLabelText('H: highest reflectivity shown'), { target: { value: '5' } });
    expect(fns.setDbzHigh).toHaveBeenLastCalledWith(20);
  });

  it('sets opacity from transparent (0) to opaque (1)', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '0' } });
    expect(fns.setOpacity).toHaveBeenLastCalledWith(0);
    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '45' } });
    expect(fns.setOpacity).toHaveBeenLastCalledWith(0.45);
  });
});

describe('RadarSitePanel — product', () => {
  const setKind = vi.fn();
  const renderPanel = (state = {}) => {
    setKind.mockReset();
    useRadarSiteContext.mockReturnValue({
      active: true, site: null, kind: 'reflectivity', chosenKind: 'reflectivity', dbzLow: 0, dbzHigh: 70, opacity: 1,
      retry: vi.fn(), setKind, setDbzLow: vi.fn(), setDbzHigh: vi.fn(), setOpacity: vi.fn(), ...state,
    });
    return render(<RadarSitePanel />);
  };

  it('offers Radar, Velocity, Correlation Coefficient and Differential Reflectivity first, in that order', () => {
    const { container } = renderPanel();
    const options = screen.getAllByRole('radio');
    expect(options.map((o) => o.textContent)).toEqual(['Radar', 'Velocity', 'Correlation Coefficient', 'Differential Reflectivity']);
    expect(container.querySelector('[role="radiogroup"]')).toBe(container.firstChild.firstChild);
    expect(screen.getByRole('radio', { name: 'Radar' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Velocity' }));
    expect(setKind).toHaveBeenCalledWith('velocity');
  });

  it('shows the Reflectivity Gates only on Radar; opacity always', () => {
    renderPanel({ kind: 'velocity', chosenKind: 'velocity' });
    expect(screen.queryByText('Reflectivity Gates')).toBeNull();
    expect(screen.getByLabelText('Opacity')).toBeInTheDocument();
  });

  it('disables CC and ZDR for a TDWR and says why it shows reflectivity', () => {
    renderPanel({ site: { id: 'TDAL', type: 'tdwr', place: 'Dallas' }, status: 'loading', chosenKind: 'cc' });
    expect(screen.getByRole('radio', { name: 'Correlation Coefficient' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Differential Reflectivity' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Velocity' })).toBeEnabled();
    expect(screen.getByText(/TDWR has no correlation coefficient/)).toBeInTheDocument();
  });
});
