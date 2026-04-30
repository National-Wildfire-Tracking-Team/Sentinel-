/**
 * Sidebar.jsx
 * Collapsible left panel housing the incident feed and summary stats.
 */

import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Flame, TrendingUp, Wind, ChevronLeft, CloudSun, ShieldAlert, ArrowLeft } from 'lucide-react';
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
      <span className="text-sentinel-300 text-[10px] text-center leading-tight">{label}</span>
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
  const isWeatherTab = activeMapTab === 'weather';

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
                     flex items-center justify-center w-6 h-12
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
          relative z-20 flex flex-col
          bg-sentinel-900/95 backdrop-blur-sm
          border-r border-sentinel-700
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-72 sm:w-80' : 'w-0 overflow-hidden'}
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

        {/* Map mode tabs — matches layer panel accent (fire vs sky) */}
        <div className="px-3 pt-1 pb-2.5 border-b border-sentinel-700/70 shrink-0">
          <div
            className="relative grid w-full grid-cols-2 gap-0 rounded-xl border border-sentinel-600 bg-sentinel-800/90 p-1 shadow-inner"
            role="tablist"
            aria-label="Map mode"
          >
            <button
              type="button"
              role="tab"
              onClick={() => onTabChange?.('wildfire')}
              className={`relative z-10 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                activeMapTab === 'wildfire'
                  ? 'text-white shadow-md shadow-black/25'
                  : 'text-sentinel-400 hover:text-sentinel-200'
              }`}
              aria-pressed={activeMapTab === 'wildfire'}
              aria-selected={activeMapTab === 'wildfire'}
            >
              {activeMapTab === 'wildfire' && (
                <span
                  className="absolute inset-0 rounded-lg bg-gradient-to-b from-fire-500 to-fire-600 border border-fire-400/40 -z-10"
                  aria-hidden
                />
              )}
              <Flame size={14} className={activeMapTab === 'wildfire' ? 'text-white' : 'opacity-80'} />
              Wildfire
            </button>

            <button
              type="button"
              role="tab"
              onClick={() => onTabChange?.('weather')}
              className={`relative z-10 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                activeMapTab === 'weather'
                  ? 'text-white shadow-md shadow-black/25'
                  : 'text-sentinel-400 hover:text-sentinel-200'
              }`}
              aria-pressed={activeMapTab === 'weather'}
              aria-selected={activeMapTab === 'weather'}
            >
              {activeMapTab === 'weather' && (
                <span
                  className="absolute inset-0 rounded-lg bg-gradient-to-b from-sky-500 to-sky-600 border border-sky-400/40 -z-10"
                  aria-hidden
                />
              )}
              <CloudSun size={14} className={activeMapTab === 'weather' ? 'text-white' : 'opacity-80'} />
              Weather
            </button>
          </div>
        </div>

        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-sentinel-700 shrink-0">
          <div className="flex items-center gap-2">
            {isWeatherTab ? (
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
        <div className="px-3 py-2 border-b border-sentinel-700 shrink-0">
          <div className="flex justify-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {isWeatherTab ? (
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

        {/* Address alert search – weather tab only */}
        {isWeatherTab && <AddressAlertSearch />}

        {/* Feed – takes remaining height */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {isWeatherTab ? (
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
