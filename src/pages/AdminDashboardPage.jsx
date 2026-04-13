/**
 * AdminDashboardPage.jsx
 * Admin-only page for reviewing pending fire reports.
 * Lists all reports (filterable by status) and lets admins approve or reject
 * each one. Uses realtime subscriptions via useFireReports so the list stays
 * in sync across sessions.
 */

import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Check, X, Clock, Flame, ShieldCheck, MapPin } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useFireReports, setReportStatus } from '../hooks/useFireReports';

const STATUS_TABS = [
  { key: 'pending',  label: 'Pending',  icon: Clock },
  { key: 'approved', label: 'Approved', icon: Check },
  { key: 'rejected', label: 'Rejected', icon: X },
];

function StatusBadge({ status }) {
  const styles = {
    pending:  'bg-amber-950/40 border-amber-800/60 text-amber-300',
    approved: 'bg-green-950/40 border-green-800/60 text-green-300',
    rejected: 'bg-red-950/40 border-red-800/60 text-red-300',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border ${styles[status] || ''}`}>
      {status}
    </span>
  );
}

export default function AdminDashboardPage() {
  const { isAdmin, loading, user } = useAuth();
  const [tab, setTab] = useState('pending');
  const [actioning, setActioning] = useState({}); // id -> 'approve'|'reject'
  const [error, setError] = useState(null);

  const { reports, loading: reportsLoading, refresh } = useFireReports(tab);

  const counts = useMemo(() => ({
    // Rough counts from the current tab's list; the other tabs update when clicked.
    [tab]: reports.length,
  }), [tab, reports.length]);

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-16 text-sentinel-300">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: '/admin' }} replace />;
  }
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-white mb-2">Admin Access Required</h1>
        <p className="text-sentinel-300 text-sm mb-4">
          Your account does not have the <code>admin</code> role. Contact an
          existing administrator to be promoted.
        </p>
        <Link to="/" className="text-fire-400 hover:text-fire-300 text-sm">← Back to home</Link>
      </div>
    );
  }

  async function handleAction(id, nextStatus) {
    setActioning(prev => ({ ...prev, [id]: nextStatus }));
    setError(null);
    try {
      await setReportStatus(id, nextStatus);
      // Realtime subscription will remove it from the pending list automatically,
      // but call refresh() as a safety net.
      refresh();
    } catch (err) {
      setError(err?.message || 'Action failed');
    } finally {
      setActioning(prev => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck size={22} className="text-fire-500" />
        <h1 className="text-2xl font-bold text-white">Admin – Review Fire Reports</h1>
      </div>
      <p className="text-sentinel-300 text-sm mb-6">
        Approve reports to publish them on the live map, or reject false / duplicate submissions.
      </p>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4 border-b border-sentinel-700">
        {STATUS_TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'text-fire-400 border-fire-500'
                  : 'text-sentinel-300 border-transparent hover:text-white'
              }`}
            >
              <Icon size={13} />
              {label}
              {active && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-fire-600/20 text-fire-300">
                  {counts[tab]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* List */}
      {reportsLoading ? (
        <div className="text-sentinel-300 text-sm py-12 text-center">Loading reports…</div>
      ) : reports.length === 0 ? (
        <div className="text-sentinel-400 text-sm py-12 text-center">
          No {tab} reports.
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <article
              key={r.id}
              className="p-4 bg-sentinel-800/60 border border-sentinel-700 rounded-xl"
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Flame size={14} className="text-fire-400 shrink-0" />
                  <h3 className="font-semibold text-white truncate">{r.title}</h3>
                </div>
                <StatusBadge status={r.status} />
              </div>

              <p className="text-sm text-sentinel-200 whitespace-pre-wrap mb-3">
                {r.description}
              </p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-sentinel-400 mb-3">
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} />
                  {Number(r.latitude).toFixed(4)}°, {Number(r.longitude).toFixed(4)}°
                </span>
                <span>
                  Submitted {new Date(r.created_at).toLocaleString()}
                </span>
                <span className="truncate">Reporter: {r.user_id?.slice(0, 8)}…</span>
              </div>

              {r.status === 'pending' && (
                <div className="flex items-center gap-2">
                  <button
                    disabled={!!actioning[r.id]}
                    onClick={() => handleAction(r.id, 'approved')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                               bg-green-600/20 border border-green-700/60 text-green-300
                               hover:bg-green-600/30 disabled:opacity-50 text-sm"
                  >
                    <Check size={13} />
                    {actioning[r.id] === 'approved' ? 'Approving…' : 'Approve'}
                  </button>
                  <button
                    disabled={!!actioning[r.id]}
                    onClick={() => handleAction(r.id, 'rejected')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                               bg-red-600/20 border border-red-700/60 text-red-300
                               hover:bg-red-600/30 disabled:opacity-50 text-sm"
                  >
                    <X size={13} />
                    {actioning[r.id] === 'rejected' ? 'Rejecting…' : 'Reject'}
                  </button>
                </div>
              )}

              {r.status !== 'pending' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAction(r.id, 'pending')}
                    disabled={!!actioning[r.id]}
                    className="text-xs text-sentinel-400 hover:text-white"
                  >
                    Re-open (set to pending)
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
