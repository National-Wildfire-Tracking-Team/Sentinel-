/**
 * MapCornerButtons.jsx
 * Four stacked circular buttons in the top-left corner of the map:
 * future-features panel, incident sidebar, account center, and locate-me.
 */

import { memo, useCallback } from 'react';
import { Menu, LocateFixed, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';

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
          : 'bg-black/90 border-zinc-700 text-white hover:bg-zinc-800'
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
    locationGranted, grantLocation, setUserLocation,
    setViewport,
  } = useApp();
  const { isAuthenticated, user } = useAuth();

  const userInitial = user?.email ? user.email[0].toUpperCase() : '?';

  // Only ever asks for location permission here, on click — never automatically.
  // Once granted, every subsequent click just re-centers the map (the browser
  // won't re-prompt), and location tracking (the live dot) keeps running.
  const handleLocateMe = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = { latitude: coords.latitude, longitude: coords.longitude };
        setViewport({ ...location, zoom: 12 });
        setUserLocation(location);
        grantLocation();
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [setViewport, setUserLocation, grantLocation]);

  // When a left overlay panel (sidebar or future-features) is open, slide the
  // button column out from over the panel to the right, over the map itself.
  const panelOpen = sidebarOpen || futurePanelOpen;

  return (
    <div
      className={`absolute top-4 z-50 flex flex-col gap-3 transition-[left] duration-300 ease-in-out ${
        panelOpen ? 'left-4 sm:left-[336px]' : 'left-4'
      }`}
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

      <CornerButton active={locationGranted} onClick={handleLocateMe} ariaLabel="Center map on my location">
        <LocateFixed size={18} />
      </CornerButton>
    </div>
  );
});

export default MapCornerButtons;
