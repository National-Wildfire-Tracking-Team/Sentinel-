/**
 * MapCornerButtons.jsx
 * Three stacked circular buttons in the top-left corner of the map:
 * future-features panel, incident sidebar, and locate-me.
 *
 * Locate-me ("Go to My Current Location") also drives near-me mode: with
 * Home Setup completed, it centers the saved radius on the user's live GPS
 * position and filters incidents/alerts to it. Without Home Setup it just
 * shows the user where they are and prompts them to finish setup — it
 * never guesses a radius.
 * (The account button lives top-right — see AccountButton.jsx.)
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { Menu, LocateFixed, Home, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAppStatus } from '../../context/AppStatusContext';
import { useViewport } from '../../context/ViewportContext';
import { useHomeSetup } from '../../context/HomeSetupContext';
import { zoomForRadius } from '../../utils/radiusFilter';

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
          : 'bg-white/90 dark:bg-sentinel-900/90 border-sentinel-200 dark:border-sentinel-600 text-sentinel-700 dark:text-white hover:bg-sentinel-100 dark:hover:bg-sentinel-700'
      }`}
    >
      {children}
    </button>
  );
}

const MapCornerButtons = memo(function MapCornerButtons({ onReopenBanner }) {
  const {
    sidebarOpen, toggleSidebar,
    futurePanelOpen, toggleFuturePanel,
    layerPanelOpen,
    locationGranted, grantLocation,
  } = useApp();
  const { setUserLocation, userLocation } = useAppStatus();
  const { setViewport } = useViewport();
  const { home, isHomeSetupComplete, homeSetupLoading, activateNearby, openHomeSetup } = useHomeSetup();

  const [locationError, setLocationError] = useState(null);
  const [setupPromptOpen, setSetupPromptOpen] = useState(false);

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

    // With Home Setup, frame the whole radius and switch the feed to near-me
    // mode (which re-centers the radius as live GPS updates arrive).
    // Without it, just show the user where they are and nudge them to set up.
    const focusOn = (location) => {
      if (isHomeSetupComplete) {
        setViewport({ ...location, zoom: zoomForRadius(location.latitude, home.radiusMiles) });
        activateNearby();
        setSetupPromptOpen(false);
      } else {
        setViewport({ ...location, zoom: 12 });
        // Still fetching a signed-in user's saved setup — don't nag yet.
        if (!homeSetupLoading) setSetupPromptOpen(true);
      }
    };

    // We're already tracking a live position — recenter on it immediately
    // instead of making the user wait on (and risk a timeout from) a brand
    // new GPS fix. A fresh fix is still requested below to update the dot.
    if (locationGranted && userLocation) {
      focusOn(userLocation);
    }

    const onSuccess = ({ coords }) => {
      const location = { latitude: coords.latitude, longitude: coords.longitude };
      setUserLocation(location);
      grantLocation();
      focusOn(location);
    };

    const onError = (err) => {
      // A high-accuracy fix with no cache tolerance often times out on desktops
      // or indoors — retry once with a looser, cache-friendly request before
      // giving up (unless the user has denied permission outright).
      if (err?.code !== 1) {
        navigator.geolocation.getCurrentPosition(onSuccess, () => {
          setLocationError(GEOLOCATION_ERROR_MESSAGES[err?.code] || 'Could not get your location.');
        }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
        return;
      }
      setLocationError(GEOLOCATION_ERROR_MESSAGES[err?.code] || 'Could not get your location.');
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 15000,
    });
  }, [setViewport, setUserLocation, grantLocation, locationGranted, userLocation,
    isHomeSetupComplete, homeSetupLoading, home, activateNearby]);

  const handleOpenHomeSetup = useCallback(() => {
    setSetupPromptOpen(false);
    openHomeSetup();
  }, [openHomeSetup]);

  // Finishing setup elsewhere (e.g. from the sidebar strip) retires the prompt.
  useEffect(() => {
    if (isHomeSetupComplete) setSetupPromptOpen(false);
  }, [isHomeSetupComplete]);

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

      {/* Also brings back the alert banner under the header if it was dismissed. */}
      <CornerButton
        active={sidebarOpen}
        onClick={() => { toggleSidebar(); onReopenBanner?.(); }}
        ariaLabel="Open incident sidebar"
      >
        <span className="text-lg font-black leading-none">!</span>
      </CornerButton>

      <div className="relative">
        <CornerButton active={locationGranted} onClick={handleLocateMe} ariaLabel="Go to my current location">
          <LocateFixed size={18} />
        </CornerButton>

        {locationError && (
          <div
            role="alert"
            className="absolute top-0 left-full ml-2 w-56 rounded-lg border border-sentinel-200 dark:border-sentinel-600 bg-white dark:bg-sentinel-900/95 px-3 py-2 text-xs text-sentinel-900 dark:text-white shadow-xl"
          >
            {locationError}
          </div>
        )}

        {!locationError && setupPromptOpen && (
          <div
            role="status"
            className="absolute top-0 left-full ml-2 w-64 rounded-lg border border-sentinel-200 dark:border-sentinel-600 bg-white dark:bg-sentinel-900/95 p-3 text-sentinel-900 dark:text-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Home size={14} className="text-fire-500" />
                Set Up Your Home Location
              </div>
              <button
                type="button"
                onClick={() => setSetupPromptOpen(false)}
                aria-label="Dismiss"
                className="text-sentinel-400 hover:text-sentinel-700 dark:hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
            <p className="mt-1.5 text-xs leading-snug text-sentinel-600 dark:text-sentinel-200">
              Choose your home location and alert radius to get personalized wildfire incidents,
              NWS alerts, and SPC/WPC risk information near you.
            </p>
            <button
              type="button"
              onClick={handleOpenHomeSetup}
              className="mt-2.5 w-full rounded-md bg-fire-600 hover:bg-fire-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              Set Up Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export default MapCornerButtons;
