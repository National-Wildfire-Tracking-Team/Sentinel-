import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LayerControl from '../../src/app/components/LayerControl/LayerControl';
import { useWeatherModelsContext } from '../../src/app/context/WeatherModelsContext';

vi.mock('../../src/app/context/AppContext', () => ({
  useApp: vi.fn(() => ({
    layers: {},
    layerPanelOpen: true,
    toggleLayer: vi.fn(),
    toggleLayerPanel: vi.fn(),
    wpcOutlookDay: {},
    setWpcOutlookDay: vi.fn(),
  })),
}));

vi.mock('../../src/app/context/WeatherModelsContext', () => ({
  useWeatherModelsContext: vi.fn(),
}));

const setParticles = vi.fn();

beforeEach(() => {
  setParticles.mockReset();
  useWeatherModelsContext.mockReturnValue({ particles: false, setParticles });
});

const renderTab = (tab) => render(
  <MemoryRouter>
    <LayerControl activeMapTab={tab} />
  </MemoryRouter>,
);

describe('Wind Particles toggle on every map tab', () => {
  it.each(['wildfire', 'weather', 'allhazard'])('is in the %s tab layer list and flips the shared setting', (tab) => {
    renderTab(tab);
    const toggle = screen.getByRole('button', { name: 'Toggle Wind Particles' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(setParticles).toHaveBeenCalledWith(true);
  });

  it('shows as on when particles are on (e.g. turned on from the Models tab)', () => {
    useWeatherModelsContext.mockReturnValue({ particles: true, setParticles });
    renderTab('weather');
    expect(screen.getByRole('button', { name: 'Toggle Wind Particles' })).toHaveAttribute('aria-pressed', 'true');
  });
});
