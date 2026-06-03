/**
 * Header.jsx
 * Floating white pill navigation bar styled after WeatherWise.
 * Left: amber hamburger circle. Center: white pill with logo + tabs.
 * Right: alert count badge + auth.
 */

import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { formatRelativeTime } from '../../utils/formatUtils';
import {
  Flame, LogOut, MapPin, Menu, RefreshCw, Settings, User,
  Search, Radar, Satellite, Globe, BarChart2, Layers,
  Home as HomeIcon, AlertTriangle, CloudLightning,
} from 'lucide-react';
import LoginModal from '../Auth/LoginModal';
import MapAddressSearchPanel from '../Auth/MapAddressSearchPanel';

const ONE_MINUTE_MS = 60_000;
const JUST_NOW_VISIBLE_MS = 5_000;
const GIVEBUTTER_WIDGET_SRC = 'https://widgets.givebutter.com/latest.umd.cjs?acct=Or6BK2q5Cpxxn9Xl&p=other';

const WEATHER_TABS = [
  { id: 'home',      label: 'Home',      Icon: HomeIcon   },
  { id: 'radar',     label: 'Radar',     Icon: Radar      },
  { id: 'composite', label: 'Composite', Icon: Layers     },
  { id: 'satellite', label: 'Satellite', Icon: Satellite  },
  { id: 'models',    label: 'Models',    Icon: BarChart2  },
  { id: 'outlooks',  label: 'Outlooks',  Icon: Globe      },
];

const WILDFIRE_TABS = [
  { id: 'overview',  label: 'Overview',  Icon: HomeIcon       },
  { id: 'hotspots',  label: 'Hotspots',  Icon: Flame          },
  { id: 'satellite', label: 'Satellite', Icon: Satellite      },
  { id: 'outlooks',  label: 'Outlooks',  Icon: CloudLightning },
];

const Header = memo(function Header({
  onRefresh,
  activeMapTab = 'wildfire',
  onTabChange,
  activeSubTab = 'overview',
  onSubTabChange,
  alertCount = 0,
}) {
  const { toggleSidebar, lastRefreshed, isLoading } = useApp();
  const { isAuthenticated, user, signOut } = useAuth();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showRecentRefreshIndicator, setShowRecentRefreshIndicator] = useState(false);
  const hideRecentIndicatorTimeoutRef = useRef(null);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAddressSetup, setShowAddressSetup] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const existingScript = document.querySelector(`script[src="${GIVEBUTTER_WIDGET_SRC}"]`);
    if (existingScript) return;
    const script = document.createElement('script');
    script.src = GIVEBUTTER_WIDGET_SRC;
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!lastRefreshed) return;
    const refreshedMs = new Date(lastRefreshed).getTime();
    if (Number.isNaN(refreshedMs)) return;
    if (hideRecentIndicatorTimeoutRef.current) {
      window.clearTimeout(hideRecentIndicatorTimeoutRef.current);
      hideRecentIndicatorTimeoutRef.current = null;
    }
    if (Date.now() - refreshedMs < ONE_MINUTE_MS) {
      setShowRecentRefreshIndicator(true);
      hideRecentIndicatorTimeoutRef.current = window.setTimeout(() => {
        setShowRecentRefreshIndicator(false);
        hideRecentIndicatorTimeoutRef.current = null;
      }, JUST_NOW_VISIBLE_MS);
    }
  }, [lastRefreshed]);

  useEffect(() => () => {
    if (hideRecentIndicatorTimeoutRef.current) {
      window.clearTimeout(hideRecentIndicatorTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!showUserMenu) return;
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showUserMenu]);

  const refreshAgeMs = useMemo(() => {
    if (!lastRefreshed) return null;
    const refreshedMs = new Date(lastRefreshed).getTime();
    if (Number.isNaN(refreshedMs)) return null;
    return Math.max(nowMs - refreshedMs, 0);
  }, [lastRefreshed, nowMs]);

  const isUpdatedOneMinuteOrLater = refreshAgeMs !== null && refreshAgeMs >= ONE_MINUTE_MS;
  const shouldShowIndicator = Boolean(lastRefreshed) && (isUpdatedOneMinuteOrLater || showRecentRefreshIndicator);
  const indicatorText = isUpdatedOneMinuteOrLater
    ? `Updated ${formatRelativeTime(lastRefreshed)}`
    : 'Updated just now';

  const handleRefreshClick = () => {
    if (!shouldShowIndicator) {
      if (hideRecentIndicatorTimeoutRef.current) window.clearTimeout(hideRecentIndicatorTimeoutRef.current);
      setShowRecentRefreshIndicator(true);
      hideRecentIndicatorTimeoutRef.current = window.setTimeout(() => {
        setShowRecentRefreshIndicator(false);
        hideRecentIndicatorTimeoutRef.current = null;
      }, JUST_NOW_VISIBLE_MS);
    }
    onRefresh?.();
  };

  const handleLoginSuccess = () => {
    setShowLoginModal(false);
    setShowAddressSetup(true);
  };

  const userInitial = user?.email ? user.email[0].toUpperCase() : '?';
  const isWeatherMode = activeMapTab === 'weather';
  const tabs = isWeatherMode ? WEATHER_TABS : WILDFIRE_TABS;
  const activeAccent = isWeatherMode ? 'bg-sky-600 text-white shadow-sm' : 'bg-orange-600 text-white shadow-sm';
  const displayAlertCount = alertCount > 99 ? '99+' : alertCount;

  return (
    <>
      <header className="relative z-40 flex items-center justify-between h-[60px] px-3 bg-[#0d1520] shrink-0">

        {/* Amber hamburger circle */}
        <button
          onClick={toggleSidebar}
          className="shrink-0 w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-400 flex items-center justify-center transition-colors shadow-lg"
          aria-label="Toggle sidebar"
        >
          <Menu size={18} className="text-white" />
        </button>

        {/* Centered white pill */}
        <div className="flex-1 flex justify-center px-3 min-w-0">
          <nav className="flex items-center bg-white rounded-2xl shadow-xl px-2 py-1.5 gap-0.5 max-w-3xl min-w-0">

            {/* Logo */}
            <div className="flex items-center gap-1.5 pr-3 mr-1 border-r border-gray-200 shrink-0">
              <Flame size={17} className="text-orange-500" />
              <span className="font-bold text-gray-900 text-sm tracking-tight">Sentinel</span>
              <span className="text-[8px] bg-orange-100 text-orange-600 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                BETA
              </span>
            </div>

            {/* Search */}
            <button
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
              aria-label="Search"
            >
              <Search size={14} />
            </button>

            {/* Mode + sub-tabs */}
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSubTabChange?.(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  activeSubTab === tab.id
                    ? activeAccent
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <tab.Icon size={13} />
                <span className="hidden md:inline">{tab.label}</span>
              </button>
            ))}

            {/* Refresh — tucked inside pill on the right */}
            <button
              onClick={handleRefreshClick}
              disabled={isLoading}
              className="ml-1 pl-2 border-l border-gray-200 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0 disabled:opacity-40"
              aria-label="Refresh data"
              title={shouldShowIndicator ? indicatorText : 'Refresh'}
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </nav>
        </div>

        {/* Right side: alert badge + auth */}
        <div className="shrink-0 flex items-center gap-2">
          {/* Donation widget */}
          <div className="hidden lg:block">
            <givebutter-widget id="g6WWrD"></givebutter-widget>
          </div>

          {/* Alert count badge */}
          {alertCount > 0 && (
            <button
              onClick={() => onTabChange?.('weather')}
              className="relative w-10 h-10 rounded-full bg-red-500 hover:bg-red-400 flex flex-col items-center justify-center transition-colors shadow-lg gap-0.5"
              title={`${alertCount} active weather alert${alertCount !== 1 ? 's' : ''}`}
            >
              <AlertTriangle size={12} className="text-white" />
              <span className="text-white text-[10px] font-bold leading-none">{displayAlertCount}</span>
            </button>
          )}

          {/* Auth */}
          {isAuthenticated ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(v => !v)}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-colors shadow"
                aria-label="User menu"
                title={user?.email}
              >
                {userInitial}
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-sentinel-600 bg-sentinel-800 shadow-2xl z-50 overflow-hidden">
                  <div className="px-3 py-2.5 border-b border-sentinel-700">
                    <p className="text-xs font-medium text-white truncate">{user?.email}</p>
                    <p className="text-[10px] text-sentinel-400 mt-0.5">Signed in</p>
                  </div>
                  <div className="py-1">
                    <Link
                      to="/manage-zipcodes"
                      onClick={() => setShowUserMenu(false)}
                      className="w-full text-left px-3 py-2 text-sm text-sentinel-200 hover:bg-sentinel-700 hover:text-white transition-colors flex items-center gap-2"
                    >
                      <MapPin size={13} />
                      Manage My Zip Codes
                    </Link>
                    <Link
                      to="/account"
                      onClick={() => setShowUserMenu(false)}
                      className="w-full text-left px-3 py-2 text-sm text-sentinel-200 hover:bg-sentinel-700 hover:text-white transition-colors flex items-center gap-2"
                    >
                      <Settings size={13} />
                      Account Settings
                    </Link>
                    <button
                      onClick={() => { setShowUserMenu(false); signOut(); }}
                      className="w-full text-left px-3 py-2 text-sm text-sentinel-200 hover:bg-sentinel-700 hover:text-white transition-colors flex items-center gap-2"
                    >
                      <LogOut size={13} />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white transition-colors shadow"
            >
              <User size={13} />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      )}

      {showAddressSetup && (
        <MapAddressSearchPanel onClose={() => setShowAddressSetup(false)} />
      )}
    </>
  );
});

export default Header;
