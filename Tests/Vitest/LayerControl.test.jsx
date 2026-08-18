import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LayerControl from '../../src/components/LayerControl/LayerControl';

vi.mock('../../src/context/AppContext', () => ({
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

  it.each(['wildfire', 'weather', 'allhazard'])(
    'shows the Evacuation Zones toggle on the %s tab',
    (tab) => {
      renderPanel({ activeMapTab: tab });
      expect(screen.getByText('Evacuation Zones')).toBeInTheDocument();
    },
  );
});
