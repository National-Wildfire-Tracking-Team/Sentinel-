import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SimplifiedModeProvider, useSimplifiedMode } from '../../src/app/context/SimplifiedModeContext';
import SimplifiedPrompt from '../../src/app/components/MapControls/SimplifiedPrompt';
import LayerControl from '../../src/app/components/LayerControl/LayerControl';
import MapBottomBar from '../../src/app/components/BottomBar/MapBottomBar';
import FutureFeaturesPanel from '../../src/app/components/MapControls/FutureFeaturesPanel';
import ModelForecastSummary from '../../src/app/components/WeatherModels/ModelForecastSummary';
import MapDockSheet from '../../src/app/components/Map/MapDockSheet';
import ModelLayerPanel from '../../src/app/components/WeatherModels/ModelLayerPanel';
import { useApp } from '../../src/app/context/AppContext';

vi.mock('../../src/app/context/AppContext', () => ({
  useApp: vi.fn(() => ({
    layers: {},
    layerPanelOpen: true,
    futurePanelOpen: true,
    toggleLayer: vi.fn(),
    setLayer: vi.fn(),
    toggleLayerPanel: vi.fn(),
    toggleFuturePanel: vi.fn(),
    wpcOutlookDay: {},
    setWpcOutlookDay: vi.fn(),
  })),
}));
vi.mock('../../src/app/context/WeatherModelsContext', () => ({
  useWeatherModelsContext: () => ({
    particles: false, setParticles: vi.fn(), open: vi.fn(),
    modes: ['hrrr', 'gfs', 'compare'], mode: 'hrrr', setMode: vi.fn(), compareView: 'swipe', setCompareView: vi.fn(),
    variables: [{ id: 't2m', label: 'Temperature', available: true }], variable: 't2m', setVariable: vi.fn(),
    manifest: {}, manifestError: null, variableSwitched: null, hafs: {},
  }),
}));
vi.mock('../../src/app/context/ThemeContext', () => ({ useTheme: () => ({ preference: 'auto', setPreference: vi.fn() }) }));
vi.mock('../../src/app/context/PreferencesContext', () => ({
  usePreferences: () => ({
    prefs: { dataPickerAnchor: 'center', timeFormat: '12h', mapPopupMode: 'list', popupSpotlight: false, spotlightOpacity: 50, popupDragHandle: false, stormMotionVectors: false },
    updatePrefs: vi.fn(),
  }),
}));
vi.mock('../../src/app/context/ViewportContext', () => ({ useViewport: () => ({ viewport: {}, setViewport: vi.fn() }) }));
vi.mock('../../src/app/context/MrmsContext', () => ({ useMrmsContext: () => ({ active: true, manifest: {} }) }));
vi.mock('../../src/app/context/RadarSiteContext', () => ({ useRadarSiteContext: () => ({ active: true }) }));
vi.mock('../../src/app/context/SatelliteContext', () => ({ useSatelliteContext: () => ({ active: true }) }));
vi.mock('../../src/app/context/FireDangerContext', () => ({ useFireDangerContext: () => null }));
vi.mock('../../src/app/context/AwcContext', () => ({ useAwcContext: () => null }));
vi.mock('../../src/app/components/Map/MrmsPanel', () => ({ default: () => null }));
vi.mock('../../src/app/components/Map/RadarSitePanel', () => ({ default: () => null }));
vi.mock('../../src/app/components/Map/SatellitePanel', () => ({ default: () => null }));
vi.mock('../../src/app/api/weatherModels', async (importOriginal) => ({
  ...(await importOriginal()),
  WEATHER_MODEL_SERVICE_URL: 'https://models.example',
}));
vi.mock('../../src/app/hooks/useModelForecast', () => ({
  useModelForecast: () => ({
    data: {
      model: { id: 'hrrr', label: 'HRRR' },
      run: { runTime: '2026-10-22T12:00:00Z', stale: false },
      units: { windSpeed: 'mph', relativeHumidity: '%', temperature: '°F' },
      forecast: [{ validTime: '2026-10-22T13:00:00Z', windSpeed: 10, windDirection: 270, relativeHumidity: 20, temperature: 80 }],
    },
  }),
}));

beforeEach(() => {
  window.localStorage.clear();
});

/** Shows the mode so a test can watch it change. */
function ModeProbe() {
  const { simplified } = useSimplifiedMode();
  return <output aria-label="mode">{simplified ? 'simplified' : 'full'}</output>;
}

const withMode = (ui) => render(
  <MemoryRouter>
    <SimplifiedModeProvider>
      {ui}
      <ModeProbe />
    </SimplifiedModeProvider>
  </MemoryRouter>,
);

/** The panel's layer rows (not the Layers button that opens it). */
const layerRows = () => screen.getAllByRole('button', { name: /^Toggle / })
  .filter((b) => b.getAttribute('aria-label') !== 'Toggle layer control');
const rowNames = () => layerRows().map((b) => b.getAttribute('aria-label'));

describe('Simplified Sentinel — first-visit prompt', () => {
  it('asks on the first visit', () => {
    withMode(<SimplifiedPrompt />);
    expect(screen.getByRole('dialog', { name: 'Try Out Simplified Tracking' })).toBeInTheDocument();
    expect(screen.getByLabelText('mode')).toHaveTextContent('full');
  });

  it('turns the mode on from its button, and remembers both the answer and the mode', () => {
    const { unmount } = withMode(<SimplifiedPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn It On' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('mode')).toHaveTextContent('simplified');
    unmount();

    withMode(<SimplifiedPrompt />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('mode')).toHaveTextContent('simplified');
  });

  it('closes from the X without turning the mode on, and does not ask again', () => {
    const { unmount } = withMode(<SimplifiedPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('mode')).toHaveTextContent('full');
    unmount();

    withMode(<SimplifiedPrompt />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape without turning the mode on', () => {
    withMode(<SimplifiedPrompt />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('mode')).toHaveTextContent('full');
  });
});

describe('Simplified Sentinel — hamburger menu', () => {
  it('has a Simplified Sentinel switch that turns the mode on and off', () => {
    withMode(<FutureFeaturesPanel />);
    const toggle = screen.getByRole('button', { name: /Simplified Sentinel/ });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('mode')).toHaveTextContent('simplified');
    fireEvent.click(toggle);
    expect(screen.getByLabelText('mode')).toHaveTextContent('full');
  });

  it('no longer offers Storm Motion Vectors', () => {
    withMode(<FutureFeaturesPanel />);
    expect(screen.queryByText('Storm Motion Vectors')).toBeNull();
  });
});

describe('Simplified Sentinel — layer panel', () => {
  const renderPanel = (props) => render(
    <MemoryRouter>
      <LayerControl routingEntitled {...props} />
    </MemoryRouter>,
  );

  it('keeps only the Wildfire essentials on the Wildfire tab', () => {
    renderPanel({ activeMapTab: 'wildfire', simplified: true });
    expect(rowNames()).toEqual([
      'Toggle Red Flag Warnings', 'Toggle Evacuation Zones', 'Toggle Active Fires', 'Toggle Fire Hotspots',
      'Toggle Wind Particles', 'Toggle Navigation',
    ]);
  });

  it('keeps only the Weather essentials on the Weather tab', () => {
    renderPanel({ activeMapTab: 'weather', simplified: true });
    expect(rowNames()).toEqual([
      'Toggle Composite Radar', 'Toggle Individual Radar Site', 'Toggle Lightning', 'Toggle Wind Particles',
      'Toggle NHC Tropical', 'Toggle Navigation',
    ]);
  });

  it('puts the Wildfire and Weather essentials together on All Hazards', () => {
    renderPanel({ activeMapTab: 'allhazard', simplified: true });
    expect(rowNames()).toEqual([
      'Toggle Evacuation Zones', 'Toggle Active Fires', 'Toggle Fire Hotspots',
      'Toggle Composite Radar', 'Toggle Individual Radar Site', 'Toggle Lightning', 'Toggle Wind Particles',
      'Toggle NHC Tropical', 'Toggle Navigation',
    ]);
  });

  it('switches off a layer that has no row while simplified, and leaves kept layers and drawer parts alone', () => {
    const setLayer = vi.fn();
    const original = useApp.getMockImplementation();
    useApp.mockImplementation(() => ({
      ...original(),
      layers: { satellite: true, spcWeatherOutlooks: true, incidentLocations: true, nhcCone: true },
      setLayer,
    }));
    try {
      renderPanel({ activeMapTab: 'wildfire', simplified: true });
      expect(setLayer).toHaveBeenCalledWith('satellite', false);
      expect(setLayer).toHaveBeenCalledWith('spcWeatherOutlooks', false);
      expect(setLayer).not.toHaveBeenCalledWith('incidentLocations', false);
      expect(setLayer).not.toHaveBeenCalledWith('nhcCone', false);
    } finally {
      useApp.mockImplementation(original);
    }
  });

  it('leaves layers alone in the full view', () => {
    const setLayer = vi.fn();
    const original = useApp.getMockImplementation();
    useApp.mockImplementation(() => ({ ...original(), layers: { satellite: true }, setLayer }));
    try {
      renderPanel({ activeMapTab: 'wildfire' });
      expect(setLayer).not.toHaveBeenCalled();
    } finally {
      useApp.mockImplementation(original);
    }
  });
});

describe('Layer panel — both views', () => {
  const renderPanel = (props) => render(
    <MemoryRouter>
      <LayerControl {...props} />
    </MemoryRouter>,
  );

  it('uses the plain radar and satellite names on the Weather tab', () => {
    renderPanel({ activeMapTab: 'weather' });
    expect(screen.getByRole('button', { name: 'Toggle Composite Radar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle Individual Radar Site' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle Satellite Imagery' })).toBeInTheDocument();
  });

  it('uses the same names on the radar and satellite drawer tabs', () => {
    render(<MapDockSheet activeMapTab="weather" layers={{}} spc={{}} fireWx={{}} smoke={{ forecastHoursMs: [] }} bottomOffset={0} />);
    expect(screen.getByRole('button', { name: 'Open Composite Radar controls' })).toHaveTextContent('Composite Radar');
    expect(screen.getByRole('button', { name: 'Open Individual Radar Site controls' })).toHaveTextContent('Individual Radar Site');
    expect(screen.getByRole('button', { name: 'Open Satellite Imagery controls' })).toHaveTextContent('Satellite Imagery');
  });

  it.each([[false], [true]])('draws no icon beside a row title (simplified: %s)', (simplified) => {
    renderPanel({ activeMapTab: 'allhazard', simplified, routingEntitled: true });
    for (const row of layerRows()) {
      expect(row.querySelector('svg')).toBeNull();
    }
  });

  it('draws no icon before a Models tab row title', () => {
    render(<ModelLayerPanel />);
    const rows = [...screen.getAllByRole('radio', { name: /HRRR|GFS|Compare/ }), screen.getByRole('button', { name: 'Toggle Wind particles' })];
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.firstElementChild).toHaveTextContent(/HRRR|GFS|Compare|Wind particles/);
    }
  });

  it('puts a locked row\'s title first, with no icon before it', () => {
    renderPanel({ activeMapTab: 'wildfire', routingEntitled: false });
    const row = screen.getByText('Navigation').closest('.w-full');
    expect(row.firstElementChild).toHaveTextContent('Navigation');
  });
});

describe('Simplified Sentinel — tab bar', () => {
  it('offers the Models tab in the full view', () => {
    render(<MemoryRouter><MapBottomBar activeMapTab="wildfire" /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Models' })).toBeInTheDocument();
  });

  it('removes the Models tab while simplified', () => {
    render(<MemoryRouter><MapBottomBar activeMapTab="wildfire" simplified /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Models' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Weather' })).toBeInTheDocument();
  });
});

describe('Simplified Sentinel — incident model forecast', () => {
  it('links to the Models tab in the full view', () => {
    withMode(<ModelForecastSummary lat={38} lon={-120} place="Test Fire" />);
    expect(screen.getByRole('link', { name: 'Open in Models' })).toBeInTheDocument();
  });

  it('has no Models link while simplified', () => {
    window.localStorage.clear();
    const { unmount } = withMode(<SimplifiedPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn It On' }));
    unmount();
    withMode(<ModelForecastSummary lat={38} lon={-120} place="Test Fire" />);
    expect(screen.getByText(/Model forecast/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open in Models' })).toBeNull();
  });
});
