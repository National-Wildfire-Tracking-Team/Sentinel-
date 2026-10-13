/**
 * Header.jsx
 * Top navigation bar with logo, title, status, last-updated indicator,
 * and a login/user button that opens the auth modal flow.
 */

import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { useAppStatus } from '../../context/AppStatusContext';
import { formatRelativeTime } from '../../utils/formatUtils';
import { Flame, RefreshCw } from 'lucide-react';

const ONE_MINUTE_MS = 60_000;
const JUST_NOW_VISIBLE_MS = 5_000;
const DONATE_URL = 'https://givebutter.com/national-wildfire-tracking-team-dvi6jx';

const Header = memo(function Header({ onRefresh }) {
  const { lastRefreshed, isLoading } = useAppStatus();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showRecentRefreshIndicator, setShowRecentRefreshIndicator] = useState(false);
  const hideRecentIndicatorTimeoutRef = useRef(null);

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

  return (
    <>
      <header className="relative z-40 flex items-center justify-between h-14 px-4 bg-white/95 dark:bg-sentinel-900/95 backdrop-blur-sm border-b border-sentinel-200 dark:border-sentinel-700 shrink-0">
        {/* Left – Logo + title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Flame size={22} className="text-fire-600" />
            </div>
            <span className="inline-flex items-center font-bold text-sentinel-900 dark:text-white text-lg tracking-tight">
              Sentinel
            </span>
            <span className="hidden sm:inline text-sentinel-500 dark:text-sentinel-400 text-sm font-light">
              All Hazard Intelligence
            </span>
          </div>
        </div>

        {/* Right – Status indicators */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Donate — our own button (Givebutter's widget can't drop its heart
              icon from code), in the Sentinel button's tint pattern but green:
              15% fill, 30% border. Opens the donation page. */}
          <a
            href={DONATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex px-4 py-1.5 rounded-lg text-sm font-semibold
                       bg-green-600/15 border border-green-600/30 hover:bg-green-600/25
                       text-sentinel-800 dark:text-sentinel-100 hover:text-sentinel-900 dark:hover:text-white
                       active:scale-[0.97] transition-[transform,background-color,color] duration-100"
          >
            Donate
          </a>

          {/* Last updated */}
          <span
            className={`hidden md:inline text-xs text-sentinel-500 dark:text-sentinel-400 whitespace-nowrap overflow-hidden transition-all duration-300 ${
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
                       text-sentinel-600 dark:text-sentinel-300 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-sentinel-700
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
            aria-label="Refresh data"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>
    </>
  );
});

export default Header;
