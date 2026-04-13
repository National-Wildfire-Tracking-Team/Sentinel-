/**
 * Header.jsx
 * Top navigation bar with logo, title, status, and last-updated indicator.
 */

import { useApp } from '../../context/AppContext';
import { formatRelativeTime } from '../../utils/formatUtils';
import { Flame, Menu, RefreshCw, Wifi, WifiOff } from 'lucide-react';

export default function Header({ onRefresh, isOnline = true }) {
  const { toggleSidebar, lastRefreshed, isLoading } = useApp();

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
          <span className="font-bold text-white text-lg tracking-tight leading-none">
            Sentinel
          </span>
          <span className="hidden sm:inline text-sentinel-400 text-sm font-light">
            All Hazard Intelligence
          </span>
        </div>
      </div>

      {/* Right – Status indicators */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Online / offline indicator */}
        <div className={`hidden sm:flex items-center gap-1.5 text-xs font-medium ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
          {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
          <span className="hidden md:inline">{isOnline ? 'Live' : 'Offline'}</span>
        </div>

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
