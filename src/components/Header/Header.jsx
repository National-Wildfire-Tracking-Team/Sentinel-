/**
 * Header.jsx
 * Top navigation bar with logo, title, status, and last-updated indicator.
 */

import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { formatRelativeTime } from '../../utils/formatUtils';
import { NavLink, useNavigate } from 'react-router-dom';
import { Flame, Menu, RefreshCw } from 'lucide-react';

export default function Header({ onRefresh }) {
  const { toggleSidebar, lastRefreshed, isLoading } = useApp();
  const { isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
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

        {/* Auth actions */}
        {isAuthenticated ? (
          <button
            onClick={handleSignOut}
            className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium text-sentinel-300 hover:text-white hover:bg-sentinel-700 transition-colors"
          >
            Sign Out
          </button>
        ) : (
          <div className="hidden sm:flex items-center gap-2">
            <NavLink
              to="/login"
              className={({ isActive }) =>
                `inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-fire-600/15 text-fire-400'
                    : 'text-sentinel-200 hover:text-white hover:bg-sentinel-700'
                }`
              }
            >
              Sign In
            </NavLink>
            <NavLink
              to="/register"
              className={({ isActive }) =>
                `inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  isActive
                    ? 'border-[#0096ff] bg-[#0096ff]/20 text-[#0096ff]'
                    : 'border-[#0096ff]/50 text-[#0096ff] hover:bg-[#0096ff]/10 hover:border-[#0096ff]'
                }`
              }
            >
              Sign Up
            </NavLink>
          </div>
        )}

        {/* Last updated */}
        {lastRefreshed && (
          <span className="hidden md:inline text-xs text-sentinel-400">
            Updated {formatRelativeTime(lastRefreshed)}
          </span>
        )}

        {/* Manual refresh button */}
        <button
          onClick={onRefresh}
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
      </div>
    </header>
  );
}
