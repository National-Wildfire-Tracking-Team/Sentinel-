/**
 * Sidebar.jsx
 * Collapsible left panel housing the incident feed and summary stats.
 */

import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, TrendingUp, Wind, ChevronLeft, CloudSun, ShieldAlert, ArrowLeft, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import IncidentFeed from './IncidentFeed';
import WeatherAlertsFeed from './WeatherAlertsFeed';
import AddressAlertSearch from './AddressAlertSearch';

function StatPill({ icon: Icon, label, value, color = 'text-white', onClick, className = '' }) {
  const base = `flex flex-col items-center gap-0.5 px-3 py-2 bg-sentinel-800 rounded-lg border border-sentinel-700 min-w-[70px] ${className}`;
  const inner = (
    <>
      <Icon size={14} className={color} />
      <span className={`text-base font-bold ${color}`}>{value}</span>
      <span className="text-sentinel-300 text-[xs] text-center leading-tight">{label}</span>
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className={`${base} hover:bg-sentinel-700 transition-colors cursor-pointer`}>
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}

const Sidebar = memo(function Sidebar({
  incidents,
  loading,
  error,
  activeMapTab = 'wildfire',
  onTabChange,
  weatherAlertsLoading = false,
  weatherAlertsError = null,
  onReopenBanner,
  weatherAlertFilter = 'all',
  onWeatherAlertFilterChange,
}) {
  const { sidebarOpen, toggleSidebar, alerts } = useApp();
  const [allHazardFeedTab, setAllHazardFeedTab] = useState('fires');
  const isWeatherTab = activeMapTab === 'weather';
  const isAllHazardTab = activeMapTab === 'allhazard';

  const activeCount  = incidents.filter(i => i.status === 'active').length;
  const rfwCount     = alerts.filter(a => a.type === 'Red Flag Warning').length;
  const totalAcres   = incidents.reduce((sum, i) => sum + (i.acres || 0), 0);
  const acresDisplay = totalAcres >= 1000 ? `${(totalAcres / 1000).toFixed(0)}k` : totalAcres;
  const alertsCount = alerts.length;
  const severeCount = alerts.filter(a => a.severity === 'Extreme' || a.severity === 'Severe').length;
  const warningCount = alerts.filter(a => typeof a.type === 'string' && a.type.includes('Warning')).length;

  return (
    <>
      {/* Collapsed toggle button */}
      {!sidebarOpen && (
        <button
          onClick={toggleSidebar}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-30
                     flex items-center justify-center w-10 h-16
                     bg-sentinel-800 border border-l-0 border-sentinel-700
                     rounded-r-lg text-sentinel-200 hover:text-white
                     hover:bg-sentinel-700 transition-colors shadow-lg"
          aria-label="Open sidebar"
        >
          <ChevronLeft size={14} className="rotate-180" />
        </button>
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed lg:relative
          top-0 left-0
          h-full
          z-40
          flex flex-col
          bg-sentinel-900/95 backdrop-blur-sm
          border-r border-sentinel-700
          transition-transform duration-300 ease-in-out
          w-full sm:w-80 lg:w-80
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Back to NWTT Home */}
        <div className="px-3 pt-2 pb-1 shrink-0">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-sentinel-200 hover:text-fire-300 transition-colors"
          >
            <ArrowLeft size={12} />
            Back to NWTT Home
          </Link>
        </div>

        {/* Map mode tabs */}
        <div className="px-3 pt-1 pb-2 border-b border-sentinel-700/70 shrink-0">
          {/* All Hazard featured tab */}
          <button
            type="button"
            onClick={() => onTabChange?.('allhazard')}
            className={`w-full mb-1.5 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold rounded-xl transition-all duration-200 border ${
              isAllHazardTab
                ? 'bg-gradient-to-r from-fire-600 via-red-600 to-sky-700 text-white border-red-500/50 shadow-lg shadow-red-900/30'
                : 'text-sentinel-200 hover:text-white border-sentinel-700 hover:border-red-600/50 hover:bg-sentinel-700/60'
            }`}
            aria-pressed={isAllHazardTab}
          >
            <AlertTriangle size={13} className={isAllHazardTab ? 'text-yellow-300' : 'text-sentinel-400'} />
            <span>All Hazards</span>
            {isAllHazardTab && (
              <span className="ml-auto px-1.5 py-0.5 rounded-md text-[xs] font-black uppercase tracking-widest bg-white/20 text-white">
                LIVE
              </span>
            )}
          </button>

          {/* Wildfire + Weather row */}
          <div className="inline-flex w-full rounded-xl border border-sentinel-700 bg-sentinel-800 p-1 gap-1">
            <button
              type="button"
              onClick={() => onTabChange?.('wildfire')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeMapTab === 'wildfire'
                  ? 'bg-fire-600 text-white'
                  : 'text-sentinel-200 hover:bg-sentinel-700'
              }`}
              aria-pressed={activeMapTab === 'wildfire'}
            >
              <Flame size={13} />
              Wildfire
            </button>

            <button
              type="button"
              onClick={() => onTabChange?.('weather')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeMapTab === 'weather'
                  ? 'bg-sky-600 text-white'
                  : 'text-sentinel-200 hover:bg-sentinel-700'
              }`}
              aria-pressed={activeMapTab === 'weather'}
            >
              <CloudSun size={13} />
              Weather
            </button>
          </div>
        </div>

        {/* Sidebar header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${isAllHazardTab ? 'border-red-900/60 bg-gradient-to-r from-fire-900/30 to-sky-900/20' : 'border-sentinel-700'}`}>
          <div className="flex items-center gap-2">
            {isAllHazardTab ? (
              <>
                <div className="relative">
                  <AlertTriangle size={16} className="text-yellow-400" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                </div>
                <h2 className="font-bold text-white text-sm tracking-wide">All Hazards</h2>
                <span className="px-1.5 py-0.5 bg-red-600/30 text-red-300 text-[xs] font-bold rounded-full border border-red-700/40">
                  {activeCount + alertsCount}
                </span>
              </>
            ) : isWeatherTab ? (
              <>
                <CloudSun size={16} className="text-sky-400" />
                <h2 className="font-semibold text-white text-sm">Weather &amp; Radar</h2>
                {alertsCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-sky-600/25 text-sky-300 text-xs font-bold rounded-full border border-sky-700/40">
                    {alertsCount}
                  </span>
                )}
              </>
            ) : (
              <>
                <Flame size={16} className="text-fire-500" />
                <h2 className="font-semibold text-white text-sm">Active Incidents</h2>
              </>
            )}
          </div>

          <button
            onClick={toggleSidebar}
            className="p-1 text-sentinel-200 hover:text-white hover:bg-sentinel-700 rounded transition-colors"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        {/* Summary stats strip */}
        <div className={`px-3 py-2 border-b shrink-0 ${isAllHazardTab ? 'border-red-900/50' : 'border-sentinel-700'}`}>
          <div className="flex justify-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {isAllHazardTab ? (
              <>
                <StatPill icon={Flame}       label="Fires"     value={activeCount}   color="text-fire-400"   className="flex-1" />
                <StatPill icon={TrendingUp}  label="Acres"     value={acresDisplay}  color="text-orange-400" className="flex-1" />
                <StatPill icon={CloudSun}    label="Alerts"    value={alertsCount}   color="text-sky-300"    className="flex-1" />
                <StatPill icon={ShieldAlert} label="Severe"    value={severeCount}   color="text-red-300"    className="flex-1" />
              </>
            ) : isWeatherTab ? (
              <>
                <StatPill icon={CloudSun}    label="Active Alerts" value={alertsCount}  color="text-sky-300"   className="flex-1" />
                <StatPill icon={ShieldAlert} label="Severe"        value={severeCount}  color="text-red-300"   className="flex-1" />
                <StatPill icon={Wind}        label="Warnings"      value={warningCount} color="text-amber-300" className="flex-1" />
              </>
            ) : (
              <>
                <StatPill icon={Flame}      label="Active"     value={activeCount}  color="text-fire-400"    className="flex-1" />
                <StatPill icon={TrendingUp} label="Acres"      value={acresDisplay} color="text-orange-400"  className="flex-1" />
                <StatPill icon={Wind}       label="Red Flags"  value={rfwCount}     color="text-red-400"     className="flex-1" onClick={rfwCount > 0 ? onReopenBanner : undefined} />
              </>
            )}
          </div>
        </div>

        {/* Address alert search – weather and all-hazard tabs */}
        {(isWeatherTab || isAllHazardTab) && <AddressAlertSearch />}

        {/* All Hazard sub-feed tabs */}
        {isAllHazardTab && (
          <div className="px-3 pt-2 pb-1 shrink-0">
            <div className="inline-flex w-full rounded-lg border border-sentinel-700 bg-sentinel-800/70 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setAllHazardFeedTab('fires')}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[xs] font-semibold rounded-md transition-colors ${
                  allHazardFeedTab === 'fires'
                    ? 'bg-fire-700 text-white'
                    : 'text-sentinel-300 hover:bg-sentinel-700'
                }`}
              >
                <Flame size={11} />
                Fires {activeCount > 0 && <span className="opacity-70">({activeCount})</span>}
              </button>
              <button
                type="button"
                onClick={() => setAllHazardFeedTab('alerts')}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[xs] font-semibold rounded-md transition-colors ${
                  allHazardFeedTab === 'alerts'
                    ? 'bg-sky-700 text-white'
                    : 'text-sentinel-300 hover:bg-sentinel-700'
                }`}
              >
                <ShieldAlert size={11} />
                Alerts {alertsCount > 0 && <span className="opacity-70">({alertsCount})</span>}
              </button>
            </div>
          </div>
        )}

        {/* Feed – takes remaining height */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {isAllHazardTab ? (
            allHazardFeedTab === 'fires' ? (
              <IncidentFeed incidents={incidents} loading={loading} error={error} />
            ) : (
              <WeatherAlertsFeed
                alerts={alerts}
                loading={weatherAlertsLoading}
                error={weatherAlertsError}
                activeFilter={weatherAlertFilter}
                onFilterChange={onWeatherAlertFilterChange}
              />
            )
          ) : isWeatherTab ? (
            <WeatherAlertsFeed
              alerts={alerts}
              loading={weatherAlertsLoading}
              error={weatherAlertsError}
              activeFilter={weatherAlertFilter}
              onFilterChange={onWeatherAlertFilterChange}
            />
          ) : (
            <IncidentFeed incidents={incidents} loading={loading} error={error} />
          )}
        </div>
      </aside>
    </>
  );
});
export default Sidebar;
