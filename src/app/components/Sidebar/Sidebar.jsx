/**
 * Sidebar.jsx
 * Collapsible left panel housing the incident feed and summary stats.
 */

import { memo, useState } from 'react';
import { Flame, TrendingUp, Wind, CloudSun, ShieldAlert, AlertTriangle, Waves } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAppStatus } from '../../context/AppStatusContext';
import IncidentFeed from './IncidentFeed';
import WeatherAlertsFeed from './WeatherAlertsFeed';
import TropicalWeatherFeed from './TropicalWeatherFeed';
import AddressAlertSearch from './AddressAlertSearch';
import HomeNearbyStrip from './HomeNearbyStrip';
import HomeSetupPanel from './HomeSetupPanel';
import { useHomeSetup } from '../../context/HomeSetupContext';
import { filterFeedIncidents } from './incidentFeedFilter';

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

const NO_OUTLOOKS = { spcOutlooks: [], wpcOutlooks: [], loading: false };

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
  nhcLoading = false,
  // False when every Tropical (NHC) layer switch is off, so nothing is fetched
  nhcEnabled = true,
  // Near-me mode: alerts already filtered to the user's radius (null = off)
  nearbyAlerts = null,
  nearbyOutlooks = NO_OUTLOOKS,
  // Models tab body (WeatherModelsPanel), rendered in place of the feeds
  modelsPanel = null,
}) {
  const { sidebarOpen, feedFilter } = useApp();
  const { alerts: allAlerts } = useAppStatus();
  const { homeSetupOpen } = useHomeSetup();
  const alerts = nearbyAlerts ?? allAlerts;
  const [allHazardFeedTab, setAllHazardFeedTab] = useState('fires');
  const [weatherFeedTab, setWeatherFeedTab] = useState('alerts');
  const isWeatherTab = activeMapTab === 'weather';
  const isAllHazardTab = activeMapTab === 'allhazard';
  const isModelsTab = activeMapTab === 'models';
  const nhcActiveCount = nhcInvests.length + nhcCyclones.length;

  // Same fires the feed lists for the All / Active toggle, so counts match it
  const shownFires   = filterFeedIncidents(incidents, feedFilter);
  const fireCount    = shownFires.length;
  const fireLabel    = feedFilter === 'focused' ? 'Active' : 'Fires';
  const rfwCount     = alerts.filter(a => a.type === 'Red Flag Warning').length;
  const totalAcres   = shownFires.reduce((sum, i) => sum + (i.acres || 0), 0);
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
          sm:max-[1199px]:bottom-[var(--map-bottom-stack,0px)] sm:max-[1199px]:border-b sm:max-[1199px]:rounded-br-2xl
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Sidebar header — left-padded on mobile to clear the floating corner-button column, which only shifts out of the way at sm+ */}
        <div className={`flex items-center pl-20 pr-4 sm:px-4 py-3 border-b shrink-0 ${isAllHazardTab ? 'border-red-900/60' : 'border-sentinel-700'}`}>
          <div className="flex items-center gap-2">
            {isModelsTab ? (
              <>
                <Wind size={16} className="text-indigo-300" />
                <h2 className="font-semibold text-white text-sm">Weather Models</h2>
                <span className="px-1.5 py-0.5 rounded border border-dashed border-sentinel-500 text-sentinel-300 text-[11px]">
                  Model forecast
                </span>
              </>
            ) : isAllHazardTab ? (
              <>
                <div className="relative">
                  <AlertTriangle size={16} className="text-yellow-400" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                </div>
                <h2 className="font-bold text-white text-sm tracking-wide">All Hazards</h2>
                <span className="px-1.5 py-0.5 bg-red-600/30 text-red-300 text-[xs] font-bold rounded-full border border-red-700/40">
                  {fireCount + alertsCount}
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
                <h2 className="font-semibold text-white text-sm">Active Incidents</h2>
              </>
            )}
          </div>
        </div>

        {isModelsTab ? modelsPanel : (<>
        {/* Summary stats strip — same mobile left-padding as the header, for the same reason */}
        <div className={`pl-20 pr-16 sm:px-3 py-2 border-b shrink-0 ${isAllHazardTab ? 'border-red-900/50' : 'border-sentinel-700'}`}>
          <div className="flex justify-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {isAllHazardTab ? (
              <>
                <StatPill icon={Flame}       label={fireLabel} value={fireCount}   color="text-fire-400"   className="flex-1" />
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
                <StatPill icon={Flame}      label={fireLabel}  value={fireCount}  color="text-fire-400"    className="flex-1" />
                <StatPill icon={TrendingUp} label="Acres"      value={acresDisplay} color="text-orange-400"  className="flex-1" />
                <StatPill icon={Wind}       label="Red Flags"  value={rfwCount}     color="text-red-400"     className="flex-1" onClick={rfwCount > 0 ? onReopenBanner : undefined} />
              </>
            )}
          </div>
        </div>

        {/* Home Setup / near-me radius status */}
        {!homeSetupOpen && <HomeNearbyStrip nearbyOutlooks={nearbyOutlooks} />}

        {homeSetupOpen ? <HomeSetupPanel /> : (<>
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
                    ? 'bg-fire-600/25 ring-1 ring-inset ring-fire-600/50 text-white'
                    : 'text-sentinel-300 hover:bg-sentinel-700'
                }`}
              >
                <Flame size={11} />
                Fires {fireCount > 0 && <span className="opacity-70">({fireCount})</span>}
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
              <TropicalWeatherFeed invests={nhcInvests} cyclones={nhcCyclones} loading={nhcLoading} enabled={nhcEnabled} />
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
              <TropicalWeatherFeed invests={nhcInvests} cyclones={nhcCyclones} loading={nhcLoading} enabled={nhcEnabled} />
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
        </>)}
        </>)}
      </aside>
    </>
  );
});
export default Sidebar;
