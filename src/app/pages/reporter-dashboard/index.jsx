/**
 * reporter-dashboard/index.jsx
 * Reporter Dashboard — add, manage, and update wildfire incidents, evacuation
 * zones, and hazard events. Served on its own subdomain
 * (reporter.nationalwildfiretrackingteam.org), route "/".
 *
 * Tabs:
 *  1. Add Incident        — multi-section incident submission form
 *  2. Manage Incidents    — any reporter can edit/update/delete any incident
 *  3. External Incidents  — post updates to IRWIN/WFIGS + CAL FIRE incidents
 *  4. Evac Zones          — draw and manage your own evacuation zone polygons
 *  5. Event Reports       — submit and manage your own hazard events
 */

import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Flame, User, Settings, LogOut, Shield, PlusCircle, Activity, Globe,
  AlertTriangle as TriangleAlert, Siren,
} from 'lucide-react';

import { useAuth } from '../../../shared/context/AuthContext';
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle';
import { getAppOrigin, getMainOrigin } from '../../../shared/utils/getAppOrigin';
import { useFireReports } from '../../hooks/useFireReports';
import { useReporterEvacZones } from '../../hooks/useReporterEvacZones';
import { useHazardEvents } from '../../hooks/useHazardEvents';

import AddIncidentTab from './AddIncidentTab';
import ManageIncidentsTab from './ManageIncidentsTab';
import ExternalIncidentsTab from './ExternalIncidentsTab';
import EvacZonesTab from './EvacZonesTab';
import EventReportsTab from './EventReportsTab';

const TAB_META = {
  add:       { title: 'Add New Incident', subtitle: 'Submit a new wildfire incident. Complete all required (*) fields and click Submit.' },
  manage:    { title: 'Manage Incidents', subtitle: 'Any reporter can edit, post an update to, or delete any incident below — changes are shared across the team.' },
  external:  { title: 'External Incidents', subtitle: 'Post reporter updates to active IRWIN / WFIGS and CAL FIRE incidents from other sources.' },
  evaczones: { title: 'Evacuation Zones', subtitle: 'Draw and publish evacuation zone polygons directly on the live map.' },
  events:    { title: 'Event Reports', subtitle: 'Report a wildfire, flooding, hazmat, or other hazard event as a map pin.' },
};

export default function ReporterDashboardPage() {
  const { user, profile, loading, profileLoading, signOut } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('add');

  useDocumentTitle(`${TAB_META[activeTab].title} - NWTT`);

  const { zones: allEvacZones, loading: evacZonesLoading, refresh: refreshEvacZones } = useReporterEvacZones('all');
  const { reports: allReports, loading: reportsLoading, refresh: refreshReports } = useFireReports('all');
  const { events: allHazardEvents, refresh: refreshHazardEvents } = useHazardEvents('all');

  const manageableReports = useMemo(
    () => allReports.filter((r) => r.status !== 'rejected'),
    [allReports],
  );
  const myOwnEvacZones = useMemo(
    () => allEvacZones.filter((z) => z.user_id === user?.id),
    [allEvacZones, user?.id],
  );
  const myHazardEvents = useMemo(
    () => allHazardEvents.filter((ev) => ev.user_id === user?.id),
    [allHazardEvents, user?.id],
  );

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-sentinel-900 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-fire-600 border-t-transparent animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: '/' }} replace />;
  }

  if (!profile || (profile.role !== 'reporter' && profile.role !== 'admin')) {
    return (
      <div className="min-h-screen bg-sentinel-900 flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-red-900/30 border border-red-700/50 flex items-center justify-center mb-4">
              <Shield size={32} className="text-red-400" />
            </div>
            <h1 className="text-white text-2xl font-bold tracking-tight">Access Denied</h1>
            <p className="text-sentinel-300 text-sm mt-2">
              The Reporter Dashboard is only available to authorized reporters.
            </p>
          </div>
          <div className="bg-sentinel-800 border border-sentinel-600 rounded-2xl p-6 shadow-2xl text-left">
            <p className="text-sentinel-300 text-sm mb-4">
              Your account (<span className="text-white font-medium">{profile?.email ?? user.email}</span>)
              does not have reporter access. This area is restricted to users with the{' '}
              <span className="text-fire-400 font-medium">reporter</span> role.
            </p>
            <p className="text-sentinel-300 text-sm mb-6">
              If you believe this is an error or would like to become a reporter,
              please contact the NWTT team.
            </p>
            <div className="flex flex-col gap-3">
              <a
                href={getAppOrigin()}
                className="w-full py-2.5 rounded-lg font-semibold text-sm text-white bg-fire-600 hover:bg-fire-700 transition-all text-center"
              >
                Go to Live Tracker
              </a>
              <a
                href={getMainOrigin()}
                className="w-full py-2.5 rounded-lg font-semibold text-sm text-sentinel-300 border border-sentinel-600 hover:border-sentinel-300 hover:text-white transition-all text-center"
              >
                Back to Home
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const meta = TAB_META[activeTab];

  return (
    <div className="min-h-screen bg-sentinel-900 flex flex-col">

      {/* ── Top bar ── */}
      <header className="bg-sentinel-800 border-b border-sentinel-700 px-5 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-fire-600/10 border border-fire-600/25 flex items-center justify-center">
            <Flame size={15} className="text-fire-500" />
          </div>
          <span className="text-white font-bold text-sm tracking-tight">Sentinel</span>
          <span className="text-sentinel-600 text-sm">|</span>
          <span className="text-sentinel-300 text-sm">Reporter Dashboard</span>
          <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-fire-600/10 border border-fire-600/20">
            <Shield size={10} className="text-fire-500" />
            <span className="text-fire-500 text-[10px] font-semibold uppercase tracking-wider">Restricted</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-sentinel-300">
            <User size={12} />
            <span className="max-w-[180px] truncate">{profile?.email || user.email}</span>
          </div>
          <a
            href={`${getAppOrigin()}/account`}
            className="flex items-center gap-1.5 text-xs text-sentinel-300 hover:text-white transition-colors"
            title="Account Settings"
          >
            <Settings size={13} />
            <span className="hidden sm:inline">Account</span>
          </a>
          <button
            onClick={async () => { await signOut(); navigate('/login'); }}
            className="flex items-center gap-1.5 text-xs text-sentinel-300 hover:text-white transition-colors"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* ── Content area ── */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8">

        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">{meta.title}</h1>
          <p className="text-sentinel-300 text-sm mt-1">{meta.subtitle}</p>
        </div>

        {/* Tab bar */}
        <div
          role="tablist"
          aria-label="Reporter dashboard sections"
          className="flex gap-1 p-1 mb-8 rounded-xl bg-sentinel-800 border border-sentinel-700 w-fit flex-wrap"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'add'}
            onClick={() => setActiveTab('add')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors
              ${activeTab === 'add'
                ? 'bg-fire-600 text-white shadow'
                : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700'}`}
          >
            <PlusCircle size={13} />
            Add Incident
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'manage'}
            onClick={() => { setActiveTab('manage'); refreshReports(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors
              ${activeTab === 'manage'
                ? 'bg-fire-600 text-white shadow'
                : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700'}`}
          >
            <Activity size={13} />
            Manage Incidents
            {manageableReports.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                {manageableReports.length}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'external'}
            onClick={() => setActiveTab('external')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors
              ${activeTab === 'external'
                ? 'bg-fire-600 text-white shadow'
                : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700'}`}
          >
            <Globe size={13} />
            <span className="hidden sm:inline">External Incidents</span>
            <span className="sm:hidden">External</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'evaczones'}
            onClick={() => { setActiveTab('evaczones'); refreshEvacZones(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors
              ${activeTab === 'evaczones'
                ? 'bg-red-600 text-white shadow'
                : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700'}`}
          >
            <TriangleAlert size={13} />
            <span className="hidden sm:inline">Evac Zones</span>
            <span className="sm:hidden">Evac</span>
            {myOwnEvacZones.filter((z) => z.status === 'active').length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                {myOwnEvacZones.filter((z) => z.status === 'active').length}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'events'}
            onClick={() => { setActiveTab('events'); refreshHazardEvents(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors
              ${activeTab === 'events'
                ? 'bg-purple-600 text-white shadow'
                : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700'}`}
          >
            <Siren size={13} />
            <span className="hidden sm:inline">Event Reports</span>
            <span className="sm:hidden">Events</span>
            {myHazardEvents.filter((ev) => ev.status === 'active').length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                {myHazardEvents.filter((ev) => ev.status === 'active').length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'add' && (
          <AddIncidentTab userId={user.id} profile={profile} onSubmitted={refreshReports} />
        )}
        {activeTab === 'manage' && (
          <ManageIncidentsTab
            reports={manageableReports}
            loading={reportsLoading}
            profile={profile}
            userId={user.id}
            onRefresh={refreshReports}
          />
        )}
        {activeTab === 'external' && (
          <ExternalIncidentsTab profile={profile} userId={user.id} />
        )}
        {activeTab === 'evaczones' && (
          <EvacZonesTab
            zones={myOwnEvacZones}
            loading={evacZonesLoading}
            userId={user.id}
            onRefresh={refreshEvacZones}
          />
        )}
        {activeTab === 'events' && (
          <EventReportsTab
            events={myHazardEvents}
            userId={user.id}
            onRefresh={refreshHazardEvents}
          />
        )}
      </div>
    </div>
  );
}
