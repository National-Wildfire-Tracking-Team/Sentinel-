/**
 * MapCornerButtons.jsx
 * Four stacked circular buttons in the top-left corner of the map:
 * future-features panel, incident sidebar, account center, and locate-me.
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { Menu, LocateFixed, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';

const GEOLOCATION_ERROR_MESSAGES = {
  1: 'Location permission denied. Enable location access for this site in your browser settings.',
  2: 'Your location is currently unavailable. Try again in a moment.',
  3: 'Getting your location timed out. Try again.',
};

function CornerButton({ active, onClick, ariaLabel, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`flex items-center justify-center w-11 h-11 rounded-full border shadow-xl backdrop-blur-sm transition-colors ${
        active
          ? 'bg-fire-600 border-fire-500 text-white'
          : 'bg-white/90 dark:bg-black/90 border-sentinel-200 dark:border-zinc-700 text-sentinel-700 dark:text-white hover:bg-sentinel-100 dark:hover:bg-zinc-800'
      }`}
    >
      {children}
    </button>
  );
}

const MapCornerButtons = memo(function MapCornerButtons() {
  const {
    sidebarOpen, toggleSidebar,
    futurePanelOpen, toggleFuturePanel,
    accountPanelOpen, toggleAccountPanel,
    layerPanelOpen,
    locationGranted, grantLocation, setUserLocation,
    setViewport,
  } = useApp();
  const { isAuthenticated, user } = useAuth();

  const userInitial = user?.email ? user.email[0].toUpperCase() : '?';

  const [locationError, setLocationError] = useState(null);

  useEffect(() => {
    if (!locationError) return undefined;
    const timer = setTimeout(() => setLocationError(null), 6000);
    return () => clearTimeout(timer);
  }, [locationError]);

  // Only ever asks for location permission here, on click — never automatically.
  // Once granted, every subsequent click just re-centers the map (the browser
  // won't re-prompt), and location tracking (the live dot) keeps running.
  const handleLocateMe = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationError('Location is not supported in this browser.');
      return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setLocationError('Location requires a secure (https) connection.');
      return;
    }
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = { latitude: coords.latitude, longitude: coords.longitude };
        setViewport({ ...location, zoom: 12 });
        setUserLocation(location);
        grantLocation();
      },
      (err) => {
        setLocationError(GEOLOCATION_ERROR_MESSAGES[err?.code] || 'Could not get your location.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [setViewport, setUserLocation, grantLocation]);

  // When a left overlay panel (sidebar or future-features) is open, slide the
  // button column out from over the panel to the right, over the map itself.
  // On phones those panels are full-width (no room to shift into), so this
  // column stays put and remains the only way to close them — the panels
  // themselves reserve top-left space instead (see Sidebar/FutureFeaturesPanel).
  const panelOpen = sidebarOpen || futurePanelOpen;

  // The layer control's popover (bottom toolbar) is wide enough on phones to
  // reach under this column, but it has its own always-visible toggle button
  // in the bottom bar, so it's safe to fade this column out of the way there.
  return (
    <div
      className={`absolute top-4 z-50 flex flex-col gap-3 transition-[left,opacity] duration-300 ease-in-out ${
        panelOpen ? 'left-4 sm:left-[336px]' : 'left-4'
      } ${layerPanelOpen ? 'opacity-0 pointer-events-none sm:opacity-100 sm:pointer-events-auto' : ''}`}
    >
      <CornerButton active={futurePanelOpen} onClick={toggleFuturePanel} ariaLabel="Open more features panel">
        <Menu size={19} />
      </CornerButton>

      <CornerButton active={sidebarOpen} onClick={toggleSidebar} ariaLabel="Open incident sidebar">
        <span className="text-lg font-black leading-none">!</span>
      </CornerButton>

      <div data-account-trigger>
        <CornerButton active={accountPanelOpen} onClick={toggleAccountPanel} ariaLabel="Open account center">
          {isAuthenticated ? (
            <span className="text-xs font-bold leading-none">{userInitial}</span>
          ) : (
            <User size={18} />
          )}
        </CornerButton>
      </div>

      <div className="relative">
        <CornerButton active={locationGranted} onClick={handleLocateMe} ariaLabel="Center map on my location">
          <LocateFixed size={18} />
        </CornerButton>

        {locationError && (
          <div
            role="alert"
            className="absolute top-0 left-full ml-2 w-56 rounded-lg border border-sentinel-200 dark:border-zinc-700 bg-white dark:bg-black/95 px-3 py-2 text-xs text-sentinel-900 dark:text-white shadow-xl"
          >
            {locationError}
          </div>
        )}
      </div>
    </div>
  );
});

export default MapCornerButtons;
