/**
 * Header.jsx
 * Top navigation bar with logo, title, status, last-updated indicator,
 * and a login/user button that opens the auth modal flow.
 */

import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { useApp } from '../../context/AppContext';
import { formatRelativeTime } from '../../utils/formatUtils';
import { Flame, RefreshCw, Bell, AlertTriangle } from 'lucide-react';

const ONE_MINUTE_MS = 60_000;
const JUST_NOW_VISIBLE_MS = 5_000;
const GIVEBUTTER_WIDGET_ID = 'j1X43O';

function NotificationBell({ history = [], unreadCount = 0, onOpen }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = () => {
    setOpen((o) => {
      const next = !o;
      if (next) onOpen?.();
      return next;
    });
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative flex items-center justify-center w-8 h-8 rounded-md text-sentinel-600 dark:text-sentinel-300 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-sentinel-700 transition-colors"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full bg-fire-600 text-white text-[9px] font-bold leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-80 max-w-[85vw] rounded-xl border border-sentinel-200 dark:border-zinc-700 bg-white dark:bg-black/95 shadow-2xl overflow-hidden animate-fade-in z-50">
          <div className="px-3 py-2.5 border-b border-sentinel-200 dark:border-zinc-700">
            <span className="text-xs font-bold text-sentinel-900 dark:text-white uppercase tracking-wider">
              Notifications
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            {history.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-sentinel-500 dark:text-sentinel-400">
                No notifications yet. Track a fire or save a zip code to get alerted here.
              </p>
            ) : (
              history.map((evt) => (
                <div
                  key={evt.key}
                  className={`flex items-start gap-2 px-3 py-2.5 border-b border-sentinel-100 dark:border-zinc-800 last:border-0 ${
                    evt.read ? '' : 'bg-fire-50 dark:bg-fire-950/20'
                  }`}
                >
                  <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-sentinel-900 dark:text-white truncate">{evt.locationName}</p>
                    <p className="text-[11px] text-sentinel-500 dark:text-sentinel-400 leading-snug">{evt.title}</p>
                    <p className="text-[10px] text-sentinel-400 dark:text-sentinel-500 mt-0.5">
                      {formatRelativeTime(evt.timestamp)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const Header = memo(function Header({ onRefresh, notificationHistory, notificationUnreadCount, onOpenNotifications }) {
  const { lastRefreshed, isLoading } = useApp();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showRecentRefreshIndicator, setShowRecentRefreshIndicator] = useState(false);
  const hideRecentIndicatorTimeoutRef = useRef(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const existingScript = document.querySelector('script[src*="givebutter.com"]');
    if (existingScript) return;

    const script = document.createElement('script');
    script.src = 'https://widgets.givebutter.com/latest.umd.cjs?acct=Or6BK2q5Cpxxn9Xl&p=other';
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
              {/* pulsing dot for active status */}
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-fire-500 rounded-full animate-pulse" />
            </div>
            <span className="inline-flex items-center font-bold text-sentinel-900 dark:text-white text-lg tracking-tight">
              Sentinel
              <span className="self-start ml-0.5 mt-0.5 text-[0.45em] font-bold tracking-wider text-fire-400">BETA</span>
            </span>
            <span className="hidden sm:inline text-sentinel-500 dark:text-sentinel-400 text-sm font-light">
              All Hazard Intelligence
            </span>
          </div>
        </div>

        {/* Right – Status indicators */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Donation widget */}
          <div className="hidden sm:block">
            <givebutter-widget id={GIVEBUTTER_WIDGET_ID}></givebutter-widget>
          </div>

          {/* Last updated */}
          <span
            className={`hidden md:inline text-xs text-sentinel-500 dark:text-sentinel-400 whitespace-nowrap overflow-hidden transition-all duration-300 ${
              shouldShowIndicator ? 'max-w-40 opacity-100 ml-1' : 'max-w-0 opacity-0 ml-0'
            }`}
            aria-hidden={!shouldShowIndicator}
          >
            {indicatorText}
          </span>

          {/* Notification bell */}
          <NotificationBell
            history={notificationHistory}
            unreadCount={notificationUnreadCount}
            onOpen={onOpenNotifications}
          />

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
