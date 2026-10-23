import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SimplifiedModeProvider, useSimplifiedMode } from '../../src/app/context/SimplifiedModeContext';
import MapCornerButtons from '../../src/app/components/MapControls/MapCornerButtons';

const setViewport = vi.fn();
const activateNearby = vi.fn();

vi.mock('../../src/app/context/AppContext', () => ({
  useApp: () => ({
    sidebarOpen: false,
    toggleSidebar: vi.fn(),
    futurePanelOpen: false,
    toggleFuturePanel: vi.fn(),
    layerPanelOpen: false,
    locationGranted: true,
    grantLocation: vi.fn(),
  }),
}));
vi.mock('../../src/app/context/AppStatusContext', () => ({
  useAppStatus: () => ({ setUserLocation: vi.fn(), userLocation: { latitude: 39.5, longitude: -105.5 } }),
}));
vi.mock('../../src/app/context/ViewportContext', () => ({ useViewport: () => ({ setViewport }) }));
vi.mock('../../src/app/context/HomeSetupContext', () => ({
  useHomeSetup: () => ({
    home: { radiusMiles: 25 },
    isHomeSetupComplete: true,
    homeSetupLoading: false,
    activateNearby,
    openHomeSetup: vi.fn(),
  }),
}));

/** Stands in for the menu's Simplified Sentinel switch. */
function ModeSwitch() {
  const { simplified, setSimplified } = useSimplifiedMode();
  return <button type="button" onClick={() => setSimplified(!simplified)}>Switch mode</button>;
}

const renderButtons = () => render(
  <SimplifiedModeProvider>
    <ModeSwitch />
    <MapCornerButtons />
  </SimplifiedModeProvider>,
);
const switchMode = () => fireEvent.click(screen.getByRole('button', { name: 'Switch mode' }));

beforeEach(() => {
  window.localStorage.clear();
  setViewport.mockClear();
  activateNearby.mockClear();
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: vi.fn() },
  });
});

describe('Simplified Sentinel — hazard sidebar', () => {
  it('shows the sidebar button in the full view', () => {
    renderButtons();
    expect(screen.getByRole('button', { name: 'Open incident sidebar' })).toBeInTheDocument();
  });

  it('hides the sidebar button while simplified, and brings it back when turned off', () => {
    renderButtons();
    switchMode();
    expect(screen.queryByRole('button', { name: 'Open incident sidebar' })).toBeNull();
    switchMode();
    expect(screen.getByRole('button', { name: 'Open incident sidebar' })).toBeInTheDocument();
  });

  it('centers on the user without the near-me filter while simplified', () => {
    renderButtons();
    switchMode();
    fireEvent.click(screen.getByRole('button', { name: 'Go to my current location' }));
    expect(activateNearby).not.toHaveBeenCalled();
    expect(setViewport).toHaveBeenCalledWith({ latitude: 39.5, longitude: -105.5, zoom: 12 });
  });

  it('switches to the near-me filter in the full view', () => {
    renderButtons();
    fireEvent.click(screen.getByRole('button', { name: 'Go to my current location' }));
    expect(activateNearby).toHaveBeenCalled();
  });
});
