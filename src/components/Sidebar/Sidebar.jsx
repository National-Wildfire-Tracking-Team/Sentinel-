/**
 * Sidebar.jsx
 * Collapsible left panel housing the incident feed and summary stats.
 */

import { Flame, TrendingUp, Wind, ChevronLeft, CloudSun, ShieldAlert, Radar } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import IncidentFeed from './IncidentFeed';
import WeatherAlertsFeed from './WeatherAlertsFeed';
import AddressAlertSearch from './AddressAlertSearch';

function StatPill({ icon: Icon, label, value, color = 'text-white' }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 py-2 bg-sentinel-800 rounded-lg border border-sentinel-700 min-w-[70px]">
      <Icon size={14} className={color} />
      <span className={`text-base font-bold ${color}`}>{value}</span>
      <span className="text-sentinel-300 text-[10px] text-center leading-tight">{label}</span>
    </div>
  );
}

export default function Sidebar({
  incidents,
  loading,
  error,
  activeMapTab = 'wildfire',
  onTabChange,
  weatherAlertsLoading = false,
  weatherAlertsError = null,
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
        {/* Map mode tabs */}
        <div className="px-3 pt-3 pb-2 border-b border-sentinel-700/70 shrink-0">
          <div className="inline-flex w-full rounded-xl border border-sentinel-700 bg-sentinel-800 p-1 gap-1">
            <button
              type="button"
              onClick={() => onTabChange?.('wildfire')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
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
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
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
                {activeCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-fire-600/25 text-fire-300 text-xs font-bold rounded-full border border-fire-700/40">
                    {activeCount}
                  </span>
                )}
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
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {isWeatherTab ? (
              <>
                <StatPill icon={CloudSun}    label="Active Alerts" value={alertsCount}  color="text-sky-300" />
                <StatPill icon={ShieldAlert} label="Severe"        value={severeCount}  color="text-red-300" />
                <StatPill icon={Wind}        label="Warnings"      value={warningCount} color="text-amber-300" />
                <StatPill icon={Radar}       label="NEXRAD"        value="Live"         color="text-emerald-300" />
              </>
            ) : (
              <>
                <StatPill icon={Flame}     label="Active"       value={activeCount}  color="text-fire-400" />
                <StatPill icon={TrendingUp} label="Acres"        value={acresDisplay} color="text-orange-400" />
                <StatPill icon={Wind}      label="Red Flags"    value={rfwCount}     color="text-red-400" />
              </>
            )}
          </div>
        </div>

        {/* Address alert search – weather tab */}
        {isWeatherTab && <AddressAlertSearch />}

        {/* Feed – takes remaining height */}
        <div className="flex-1 overflow-hidden">
          {isWeatherTab ? (
            <WeatherAlertsFeed
              alerts={alerts}
              loading={weatherAlertsLoading}
              error={weatherAlertsError}
            />
          ) : (
            <IncidentFeed incidents={incidents} loading={loading} error={error} />
          )}
        </div>
      </aside>
    </>
  );
}
