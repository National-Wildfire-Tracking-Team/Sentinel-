/**
 * Header.jsx
 * Top navigation bar with logo, title, status, last-updated indicator,
 * and a login/user button that opens the auth modal flow.
 */

import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { formatRelativeTime } from '../../utils/formatUtils';
import { Flame, LogOut, Menu, RefreshCw, User } from 'lucide-react';
import LoginModal from '../Auth/LoginModal';
import MapAddressSearchPanel from '../Auth/MapAddressSearchPanel';

const ONE_MINUTE_MS = 60_000;
const JUST_NOW_VISIBLE_MS = 5_000;

const Header = memo(function Header({ onRefresh }) {
  const { toggleSidebar, lastRefreshed, isLoading } = useApp();
  const { isAuthenticated, user, signOut } = useAuth();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showRecentRefreshIndicator, setShowRecentRefreshIndicator] = useState(false);
  const hideRecentIndicatorTimeoutRef = useRef(null);

  // Auth modal state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAddressSetup, setShowAddressSetup] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
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

  // Close user menu on outside click
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
      if (hideRecentIndicatorTimeoutRef.current) {
        window.clearTimeout(hideRecentIndicatorTimeoutRef.current);
      }
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

  const handleAddressSetupReturn = () => {
    setShowAddressSetup(false);
  };

const userInitial = user?.email ? user.email[0].toUpperCase() : '?';

  return (
    <>
      <header className="relative z-40 flex items-center justify-between h-14 px-4 bg-sentinel-900/95 backdrop-blur-sm border-b border-sentinel-700 shrink-0">
        {/* Left – Logo + title */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-md text-sentinel-300 hover:text-white hover:bg-sentinel-700 transition-colors"
            aria-label="Toggle sidebar"
          >
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Flame size={22} className="text-fire-600" />
              {/* pulsing dot for active status */}
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-fire-500 rounded-full animate-pulse" />
            </div>
            <span className="inline-flex items-center font-bold text-white text-lg tracking-tight">
              Sentinel
              <span className="self-start ml-0.5 mt-0.5 text-[0.45em] font-bold tracking-wider text-fire-400">BETA</span>
            </span>
            <span className="hidden sm:inline text-sentinel-400 text-sm font-light">
              All Hazard Intelligence
            </span>
          </div>
        </div>

        {/* Right – Status indicators */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Donation widget */}
          <div className="hidden sm:block">
            <givebutter-widget id="g6WWrD"></givebutter-widget>
          </div>

          {/* Last updated */}
          <span
            className={`hidden md:inline text-xs text-sentinel-400 whitespace-nowrap overflow-hidden transition-all duration-300 ${
              shouldShowIndicator ? 'max-w-40 opacity-100 ml-1' : 'max-w-0 opacity-0 ml-0'
            }`}
            aria-hidden={!shouldShowIndicator}
          >
            {indicatorText}
          </span>

          {/* Manual refresh button */}
          <button
            onClick={handleRefreshClick}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                       text-sentinel-300 hover:text-white hover:bg-sentinel-700
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
            aria-label="Refresh data"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Auth button */}
          {isAuthenticated ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(v => !v)}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-fire-600 hover:bg-fire-500 text-white text-xs font-bold transition-colors"
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
                    <button
                      onClick={() => { setShowUserMenu(false); setShowAddressSetup(true); }}
                      className="w-full text-left px-3 py-2 text-sm text-sentinel-200 hover:bg-sentinel-700 hover:text-white transition-colors flex items-center gap-2"
                    >
                      <User size={13} />
                      Manage My Address
                    </button>
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                         bg-fire-600 hover:bg-fire-500 text-white
                         transition-colors"
            >
              <User size={13} />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* Login modal */}
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      )}

      {/* Address search panel (shown after login on the live map) */}
      {showAddressSetup && (
        <MapAddressSearchPanel
          onClose={handleAddressSetupReturn}
        />
      )}
    </>
  );
});

export default Header;
