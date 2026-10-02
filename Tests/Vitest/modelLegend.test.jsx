import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModelLegend from '../../src/app/components/WeatherModels/ModelLegend';

let wm = null;
vi.mock('../../src/app/context/WeatherModelsContext', () => ({ useWeatherModelsContext: () => wm }));
vi.mock('../../src/app/context/AppContext', () => ({ useApp: () => ({ legendOpen: true, layerPanelOpen: false }) }));
vi.mock('../../src/app/components/Map/MapScaleBar', () => ({ default: () => <div data-testid="scale" /> }));

const MANIFEST = {
  variables: {
    temperature: {
      label: 'Temperature', quantity: 'temperature', description: 'Air temperature at 2 m.',
      palette: [[-40, '#313695', 0.8], [0, '#abd9e9', 0.65], [50, '#a50026', 0.85]],
      difference: { encoding: { lo: -10, hi: 10 }, palette: [[-10, '#2166ac', 0.85], [-1, '#bdbdbd', 0], [1, '#bdbdbd', 0], [10, '#b2182b', 0.85]] },
    },
    precipitationRate: {
      label: 'Precipitation', quantity: 'rate', description: 'Average rate.',
      palette: [[0, '#ffffff', 0], [0.1, '#c6dbef', 0], [0.2, '#c6dbef', 0.55], [50, '#3f007d', 0.95]],
    },
  },
};

const base = { manifest: MANIFEST, validTime: '2026-10-01T00:00:00Z', mode: 'hrrr', compareView: 'swipe', units: 'si', particles: false };
const open = () => fireEvent.click(screen.getByRole('button', { name: /legend/i }));

beforeEach(() => { wm = { ...base, variable: 'temperature' }; });

describe('ModelLegend', () => {
  it("shows the selected variable's colour stops in display units", () => {
    render(<ModelLegend />);
    open();
    expect(screen.getByText('Temperature')).toBeTruthy();
    expect(screen.getByText('-40 °C')).toBeTruthy();
    expect(screen.getByText('50 °C')).toBeTruthy();
    expect(screen.getByText('Air temperature at 2 m.')).toBeTruthy();
    expect(screen.getByTestId('scale')).toBeTruthy();
  });

  it('follows a variable switch, skipping see-through stops', () => {
    const { rerender } = render(<ModelLegend />);
    open();
    wm = { ...base, variable: 'precipitationRate' };
    rerender(<ModelLegend />);
    expect(screen.queryByText('Temperature')).toBeNull();
    expect(screen.getByText('Precipitation')).toBeTruthy();
    expect(screen.queryByText('0.00 mm/h')).toBeNull();
    expect(screen.getByText('No colour at 0.10 mm/h or less.')).toBeTruthy();
  });

  it('shows the difference scale with signs in the difference view', () => {
    wm = { ...base, variable: 'temperature', mode: 'compare', compareView: 'difference' };
    render(<ModelLegend />);
    open();
    expect(screen.getByText('-10 °C')).toBeTruthy();
    expect(screen.getByText('+10 °C')).toBeTruthy();
  });

  it('keeps the button but does not open when there is nothing to show', () => {
    wm = { ...base, manifest: null };
    render(<ModelLegend />);
    const button = screen.getByRole('button', { name: /legend/i });
    expect(button.getAttribute('aria-expanded')).toBeNull();
    fireEvent.click(button);
    expect(screen.queryByText('Temperature')).toBeNull();
    expect(screen.getByTestId('scale')).toBeTruthy();
  });

  it('notes the wind particles only when they are drawn', () => {
    wm = { ...base, variable: 'temperature', particles: true };
    const { rerender } = render(<ModelLegend />);
    open();
    expect(screen.getByText('Wind particles')).toBeTruthy();
    wm = { ...wm, mode: 'compare' };
    rerender(<ModelLegend />);
    expect(screen.queryByText('Wind particles')).toBeNull();
  });
});
