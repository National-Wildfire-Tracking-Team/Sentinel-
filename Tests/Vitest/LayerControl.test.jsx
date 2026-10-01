import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LayerControl from '../../src/app/components/LayerControl/LayerControl';
import { useApp } from '../../src/app/context/AppContext';

vi.mock('../../src/app/context/AppContext', () => ({
  useApp: vi.fn(() => ({
    layers: {},
    selectedFire: null,
    selectedGauge: null,
    sidebarOpen: true,
    layerPanelOpen: true,
    legendOpen: true,
    alerts: [],
    alertsStatus: {},
    isLoading: false,
    lastRefreshed: null,
    viewport: {},
    feedFilter: 'all',
    toggleLayer: vi.fn(),
    setLayer: vi.fn(),
    selectFire: vi.fn(),
    clearSelected: vi.fn(),
    selectGauge: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleLayerPanel: vi.fn(),
    toggleLegend: vi.fn(),
    setAlerts: vi.fn(),
    setAlertsStatus: vi.fn(),
    setLoading: vi.fn(),
    setRefreshed: vi.fn(),
    setViewport: vi.fn(),
    flyToFire: vi.fn(),
    setFeedFilter: vi.fn(),
  })),
}));

vi.mock('../../src/app/context/ViewportContext', () => ({
  useViewport: vi.fn(() => ({
    viewport: {},
    setViewport: vi.fn(),
  })),
}));

const renderPanel = (props = {}) =>
  render(
    <MemoryRouter>
      <LayerControl activeMapTab="wildfire" {...props} />
    </MemoryRouter>
  );

describe('LayerControl — Infrastructure & Modeling group', () => {
  it('renders the Infrastructure section', () => {
    renderPanel();
    expect(screen.getByText('Infrastructure')).toBeInTheDocument();
  });

  it('shows Critical Infrastructure toggle in the group', () => {
    renderPanel();
    expect(screen.getByText('Critical Infrastructure')).toBeInTheDocument();
  });

  it('shows Schools & Universities toggle in the group', () => {
    renderPanel();
    expect(screen.getByText('Schools & Universities')).toBeInTheDocument();
  });

  it('Infrastructure layers are Pro-locked by default', () => {
    renderPanel({ infrastructureLayersEntitled: false, fireBehaviorModelingEntitled: false });
    expect(screen.getByText('Critical Infrastructure')).toBeInTheDocument();
  });

  it.each(['wildfire', 'weather', 'allhazard'])(
    'shows Infrastructure section on the %s tab',
    (tab) => {
      renderPanel({ activeMapTab: tab });
      expect(screen.getByText('Infrastructure')).toBeInTheDocument();
    },
  );

  it('lists Critical Infrastructure and Schools & Universities layers', () => {
    renderPanel();
    expect(screen.getByText('Critical Infrastructure')).toBeInTheDocument();
    expect(screen.getByText('Schools & Universities')).toBeInTheDocument();
  });

  it.each(['wildfire', 'allhazard'])(
    'shows the Evacuation Zones toggle on the %s tab',
    (tab) => {
      renderPanel({ activeMapTab: tab });
      expect(screen.getByText('Evacuation Zones')).toBeInTheDocument();
    },
  );

  it('does not show the Evacuation Zones toggle on the weather tab', () => {
    renderPanel({ activeMapTab: 'weather' });
    expect(screen.queryByText('Evacuation Zones')).not.toBeInTheDocument();
  });

  it('no longer offers radar layers or the dBZ probe (radar is being rebuilt)', () => {
    renderPanel({ activeMapTab: 'weather' });
    expect(screen.queryByText('Composite Radar')).not.toBeInTheDocument();
    expect(screen.queryByText('NEXRAD Level II')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle dBZ radar probe' })).not.toBeInTheDocument();
  });
});

describe('LayerControl — Flood Hazard', () => {
  it.each(['weather', 'allhazard'])(
    'offers the Flood Hazard toggle on the %s tab, off by default',
    (tab) => {
      renderPanel({ activeMapTab: tab });
      const toggle = screen.getByRole('button', { name: 'Toggle Flood Hazard' });
      expect(toggle.getAttribute('aria-pressed')).not.toBe('true');
      expect(screen.getByText(/FEMA National Flood Hazard Layer/)).toBeInTheDocument();
    },
  );

  it('does not offer the Flood Hazard toggle on the wildfire tab', () => {
    renderPanel({ activeMapTab: 'wildfire' });
    expect(screen.queryByRole('button', { name: 'Toggle Flood Hazard' })).not.toBeInTheDocument();
  });

  it('toggles the floodHazard layer key', () => {
    const toggleLayer = vi.fn();
    const base = useApp();
    useApp.mockReturnValue({ ...base, toggleLayer });
    renderPanel({ activeMapTab: 'weather' });
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Flood Hazard' }));
    expect(toggleLayer).toHaveBeenCalledWith('floodHazard');
    useApp.mockReset();
  });
});
