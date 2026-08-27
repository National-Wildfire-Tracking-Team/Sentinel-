/**
 * Sidebar.jsx
 * Collapsible left panel housing the incident feed and summary stats.
 */

import { memo, useState } from 'react';
import { Flame, TrendingUp, Wind, CloudSun, ShieldAlert, AlertTriangle, Waves } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import IncidentFeed from './IncidentFeed';
import WeatherAlertsFeed from './WeatherAlertsFeed';
import TropicalWeatherFeed from './TropicalWeatherFeed';
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
  weatherAlertsLoading = false,
  weatherAlertsError = null,
  onReopenBanner,
  weatherAlertFilter = 'all',
  onWeatherAlertFilterChange,
  onWeatherAlertsRefresh,
  nhcInvests = [],
  nhcCyclones = [],
}) {
  const { sidebarOpen, alerts } = useApp();
  const [allHazardFeedTab, setAllHazardFeedTab] = useState('fires');
  const [weatherFeedTab, setWeatherFeedTab] = useState('alerts');
  const isWeatherTab = activeMapTab === 'weather';
  const isAllHazardTab = activeMapTab === 'allhazard';
  const nhcActiveCount = nhcInvests.length + nhcCyclones.length;

  const activeCount  = incidents.filter(i => i.status === 'active').length;
  const rfwCount     = alerts.filter(a => a.type === 'Red Flag Warning').length;
  const totalAcres   = incidents.reduce((sum, i) => sum + (i.acres || 0), 0);
  const acresDisplay = totalAcres >= 1000 ? `${(totalAcres / 1000).toFixed(0)}k` : totalAcres;
  const alertsCount = alerts.length;
  const severeCount = alerts.filter(a => a.severity === 'Extreme' || a.severity === 'Severe').length;
  const warningCount = alerts.filter(a => typeof a.type === 'string' && a.type.includes('Warning')).length;

  return (
    <>
      {/* Sidebar panel */}
      <aside
        className={`
          absolute inset-y-0 left-0
          z-40
          flex flex-col
          bg-sentinel-900/95 backdrop-blur-sm
          border-r border-sentinel-700
          transition-transform duration-300 ease-in-out
          w-full sm:w-80
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Sidebar header — left-padded on mobile to clear the floating corner-button column, which only shifts out of the way at sm+ */}
        <div className={`flex items-center pl-20 pr-4 sm:px-4 py-3 border-b shrink-0 ${isAllHazardTab ? 'border-red-900/60 bg-gradient-to-r from-fire-900/30 to-sky-900/20' : 'border-sentinel-700'}`}>
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
        </div>

        {/* Summary stats strip — same mobile left-padding as the header, for the same reason */}
        <div className={`pl-20 pr-3 sm:px-3 py-2 border-b shrink-0 ${isAllHazardTab ? 'border-red-900/50' : 'border-sentinel-700'}`}>
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

        {/* Address search – jumps the map to any place/zip and shows active alerts there */}
        <AddressAlertSearch />

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
              <button
                type="button"
                onClick={() => setAllHazardFeedTab('tropical')}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[xs] font-semibold rounded-md transition-colors ${
                  allHazardFeedTab === 'tropical'
                    ? 'bg-cyan-700 text-white'
                    : 'text-sentinel-300 hover:bg-sentinel-700'
                }`}
              >
                <Waves size={11} />
                Tropical {nhcActiveCount > 0 && <span className="opacity-70">({nhcActiveCount})</span>}
              </button>
            </div>
          </div>
        )}

        {/* Weather-tab sub-feed tabs */}
        {isWeatherTab && (
          <div className="px-3 pt-2 pb-1 shrink-0">
            <div className="inline-flex w-full rounded-lg border border-sentinel-700 bg-sentinel-800/70 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setWeatherFeedTab('alerts')}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[xs] font-semibold rounded-md transition-colors ${
                  weatherFeedTab === 'alerts'
                    ? 'bg-sky-700 text-white'
                    : 'text-sentinel-300 hover:bg-sentinel-700'
                }`}
              >
                <ShieldAlert size={11} />
                Alerts {alertsCount > 0 && <span className="opacity-70">({alertsCount})</span>}
              </button>
              <button
                type="button"
                onClick={() => setWeatherFeedTab('tropical')}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[xs] font-semibold rounded-md transition-colors ${
                  weatherFeedTab === 'tropical'
                    ? 'bg-cyan-700 text-white'
                    : 'text-sentinel-300 hover:bg-sentinel-700'
                }`}
              >
                <Waves size={11} />
                Tropical {nhcActiveCount > 0 && <span className="opacity-70">({nhcActiveCount})</span>}
              </button>
            </div>
          </div>
        )}

        {/* Feed – takes remaining height */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {isAllHazardTab ? (
            allHazardFeedTab === 'fires' ? (
              <IncidentFeed incidents={incidents} loading={loading} error={error} />
            ) : allHazardFeedTab === 'tropical' ? (
              <TropicalWeatherFeed invests={nhcInvests} cyclones={nhcCyclones} />
            ) : (
              <WeatherAlertsFeed
                alerts={alerts}
                loading={weatherAlertsLoading}
                error={weatherAlertsError}
                activeFilter={weatherAlertFilter}
                onFilterChange={onWeatherAlertFilterChange}
                onRefresh={onWeatherAlertsRefresh}
              />
            )
          ) : isWeatherTab ? (
            weatherFeedTab === 'tropical' ? (
              <TropicalWeatherFeed invests={nhcInvests} cyclones={nhcCyclones} />
            ) : (
              <WeatherAlertsFeed
                alerts={alerts}
                loading={weatherAlertsLoading}
                error={weatherAlertsError}
                activeFilter={weatherAlertFilter}
                onFilterChange={onWeatherAlertFilterChange}
                onRefresh={onWeatherAlertsRefresh}
              />
            )
          ) : (
            <IncidentFeed incidents={incidents} loading={loading} error={error} />
          )}
        </div>
      </aside>
    </>
  );
});
export default Sidebar;
