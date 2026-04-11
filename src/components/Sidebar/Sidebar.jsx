/**
 * Sidebar.jsx
 * Collapsible left panel housing the incident feed and summary stats.
 */

import { useState } from 'react';
import { Flame, TrendingUp, Wind, Navigation, ChevronLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import IncidentFeed from './IncidentFeed';
import StormReportsFeed from './StormReportsFeed';
import HurricaneFeed from './HurricaneFeed';

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
  spcReports = [],
  iemReports = [],
  stormReportsLoading = false,
  stormReportsError = null,
  hurricaneStorms = [],
  hurricanesLoading = false,
  hurricanesError = null,
}) {
  const { sidebarOpen, toggleSidebar, alerts } = useApp();
  const isWeatherTab = activeMapTab === 'weather';
  const [weatherSubTab, setWeatherSubTab] = useState('storms');

  const activeCount  = incidents.filter(i => i.status === 'active').length;
  const rfwCount     = alerts.filter(a => a.type === 'Red Flag Warning').length;
  const totalAcres   = incidents.reduce((sum, i) => sum + (i.acres || 0), 0);
  const acresDisplay = totalAcres >= 1000 ? `${(totalAcres / 1000).toFixed(0)}k` : totalAcres;
  const stormCount = spcReports.length + iemReports.length;
  const tornadoCount = [...spcReports, ...iemReports].filter(r => r.reportType === 'Tornado').length;
  const hurricaneCount = hurricaneStorms.length;

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
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-sentinel-700 shrink-0">
          <div className="flex items-center gap-2">
            <Flame size={16} className="text-fire-500" />
            <h2 className="font-semibold text-white text-sm">Active Weather Alerts</h2>
            {activeCount > 0 && (
              <span className="px-1.5 py-0.5 bg-fire-600/25 text-fire-300 text-xs font-bold rounded-full border border-fire-700/40">
                {activeCount}
              </span>
            )}
            {isWeatherTab && stormCount > 0 && (
              <span className="px-1.5 py-0.5 bg-cyan-600/25 text-cyan-300 text-xs font-bold rounded-full border border-cyan-700/40">
                {stormCount}
              </span>
            )}
            {isWeatherTab && hurricaneCount > 0 && (
              <span className="px-1.5 py-0.5 bg-fuchsia-600/25 text-fuchsia-300 text-xs font-bold rounded-full border border-fuchsia-700/40">
                {hurricaneCount}
              </span>
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
                <StatPill icon={Wind} label="Storm Reports" value={stormCount} color="text-cyan-300" />
                <StatPill icon={Navigation} label="Hurricanes" value={hurricaneCount} color="text-fuchsia-300" />
                <StatPill icon={Flame} label="Tornado" value={tornadoCount} color="text-red-300" />
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

        {/* Weather sub-tabs (storms vs hurricanes) */}
        {isWeatherTab && (
          <div className="px-3 py-1.5 border-b border-sentinel-700 shrink-0">
            <div className="inline-flex rounded-lg border border-sentinel-700 bg-sentinel-800 p-0.5 gap-0.5 w-full">
              <button
                type="button"
                onClick={() => setWeatherSubTab('storms')}
                className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  weatherSubTab === 'storms'
                    ? 'bg-cyan-600/30 text-cyan-200 border border-cyan-500/40'
                    : 'text-sentinel-200 hover:bg-sentinel-700 border border-transparent'
                }`}
              >
                <Wind size={11} />
                Storm Reports
              </button>
              <button
                type="button"
                onClick={() => setWeatherSubTab('hurricanes')}
                className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  weatherSubTab === 'hurricanes'
                    ? 'bg-fuchsia-600/30 text-fuchsia-200 border border-fuchsia-500/40'
                    : 'text-sentinel-200 hover:bg-sentinel-700 border border-transparent'
                }`}
              >
                <Navigation size={11} />
                Hurricanes
                {hurricaneCount > 0 && (
                  <span className="ml-0.5 px-1 py-0 text-[9px] font-bold rounded-full bg-fuchsia-600/40 text-fuchsia-200">
                    {hurricaneCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Feed content – takes remaining height */}
        <div className="flex-1 overflow-hidden">
          {isWeatherTab ? (
            weatherSubTab === 'hurricanes' ? (
              <HurricaneFeed
                storms={hurricaneStorms}
                loading={hurricanesLoading}
                error={hurricanesError}
              />
            ) : (
              <StormReportsFeed
                spcReports={spcReports}
                iemReports={iemReports}
                loading={stormReportsLoading}
                error={stormReportsError}
              />
            )
          ) : (
            <IncidentFeed incidents={incidents} loading={loading} error={error} />
          )}
        </div>
      </aside>
    </>
  );
}
