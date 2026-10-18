import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LayerControl from '../../src/app/components/LayerControl/LayerControl';
import NhcTropicalControls from '../../src/app/components/LayerControl/NhcTropicalControls';
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

describe('LayerControl — NHC Tropical', () => {
  const withApp = (overrides) => {
    const original = useApp.getMockImplementation();
    const base = original();
    useApp.mockImplementation(() => ({ ...base, ...overrides, layers: { ...base.layers, ...overrides.layers } }));
    return () => useApp.mockImplementation(original);
  };

  it.each(['weather', 'allhazard'])('offers one NHC row on the %s tab, with its parts in the drawer, not the panel', (tab) => {
    const restore = withApp({ layers: { nhcTropical: true, nhcTrack: true }, nhcWindProbKt: 34 });
    renderPanel({ activeMapTab: tab });
    expect(screen.getAllByRole('button', { name: /Toggle NHC/ })).toHaveLength(1);
    expect(screen.queryByText('Tropical (NHC)')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /Storm track/ })).not.toBeInTheDocument();
    restore();
  });

  it('offers every NHC product in the NHC Tropical drawer', () => {
    const restore = withApp({ layers: { nhcTropical: true, nhcTrack: true }, nhcWindProbKt: 34 });
    render(<NhcTropicalControls />);
    for (const name of ['Storm track', 'Forecast cone', 'Coastal watches & warnings', 'Areas of interest',
      'Wind probabilities', 'Wind radii', 'Arrival of TS winds', 'Storm surge flooding']) {
      expect(screen.getByRole('switch', { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(screen.getByRole('switch', { name: /Storm track/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: /Wind radii/ })).toHaveAttribute('aria-checked', 'false');
    restore();
  });

  it('hides the parts while the row is off', () => {
    const restore = withApp({ layers: { nhcTropical: false } });
    render(<NhcTropicalControls />);
    expect(screen.queryByRole('switch', { name: /Storm track/ })).not.toBeInTheDocument();
    restore();
  });

  it('toggles a part and picks the wind threshold', () => {
    const toggleLayer = vi.fn();
    const setNhcWindProbKt = vi.fn();
    const restore = withApp({ layers: { nhcTropical: true, nhcWindProb: true }, nhcWindProbKt: 34, toggleLayer, setNhcWindProbKt });
    render(<NhcTropicalControls />);
    fireEvent.click(screen.getByRole('switch', { name: /Wind radii/ }));
    expect(toggleLayer).toHaveBeenCalledWith('nhcWindRadii');
    fireEvent.click(screen.getByRole('button', { name: /64 kt/ }));
    expect(setNhcWindProbKt).toHaveBeenCalledWith(64);
    restore();
  });
});

describe('LayerControl — Navigation (Pro)', () => {
  it.each(['allhazard', 'wildfire', 'weather'])('is the last row of the layer list on the %s tab', (tab) => {
    renderPanel({ activeMapTab: tab, routingEntitled: true });
    const rows = screen.getAllByRole('button', { name: /^Toggle / });
    expect(rows[rows.length - 1]).toHaveAccessibleName('Toggle Navigation');
    // The Evacuation section comes after Infrastructure.
    const titles = screen.getAllByText(/^(Infrastructure|Evacuation)$/).map((el) => el.textContent);
    expect(titles).toEqual(['Infrastructure', 'Evacuation']);
  });

  it('is not offered on the Models tab', () => {
    renderPanel({ activeMapTab: 'models', routingEntitled: true });
    expect(screen.queryByText('Navigation')).not.toBeInTheDocument();
  });

  it.each(['allhazard', 'wildfire', 'weather'])('is Pro-locked with no upgrade link when not entitled (%s)', (tab) => {
    renderPanel({ activeMapTab: tab, routingEntitled: false });
    const label = screen.getByText('Navigation');
    const row = label.closest('.w-full');
    expect(row).toHaveTextContent('Pro');
    expect(row.querySelector('a')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Toggle Navigation' })).not.toBeInTheDocument();
  });

  it('is a working toggle when entitled', () => {
    const toggleLayer = vi.fn();
    const original = useApp.getMockImplementation();
    useApp.mockImplementation(() => ({ ...original(), layers: {}, layerPanelOpen: true, toggleLayer }));
    try {
      renderPanel({ activeMapTab: 'allhazard', routingEntitled: true });
      fireEvent.click(screen.getByRole('button', { name: 'Toggle Navigation' }));
      expect(toggleLayer).toHaveBeenCalledWith('routeToSafety');
    } finally {
      useApp.mockImplementation(original);
    }
  });

  it('keeps every existing All Hazards toggle', () => {
    renderPanel({ activeMapTab: 'allhazard', routingEntitled: true });
    for (const label of ['Active Fires', 'Evacuation Zones', 'Fire Hotspots']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe('LayerControl — Radar Site', () => {
  it.each(['weather', 'allhazard'])('offers the Radar Site toggle on the %s tab, off by default', (tab) => {
    renderPanel({ activeMapTab: tab });
    const toggle = screen.getByRole('button', { name: 'Toggle Radar Site' });
    expect(toggle.getAttribute('aria-pressed')).not.toBe('true');
    expect(screen.getByText(/NEXRAD & TDWR stations/)).toBeInTheDocument();
  });

  it('does not offer the Radar Site toggle on the wildfire tab', () => {
    renderPanel({ activeMapTab: 'wildfire' });
    expect(screen.queryByRole('button', { name: 'Toggle Radar Site' })).not.toBeInTheDocument();
  });

  it('toggles the radarSites layer key', () => {
    const toggleLayer = vi.fn();
    const base = useApp();
    useApp.mockReturnValue({ ...base, toggleLayer });
    renderPanel({ activeMapTab: 'weather' });
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Radar Site' }));
    expect(toggleLayer).toHaveBeenCalledWith('radarSites');
    useApp.mockReset();
  });
});
