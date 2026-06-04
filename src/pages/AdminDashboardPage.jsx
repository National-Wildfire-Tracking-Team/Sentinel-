/**
 * AdminDashboardPage.jsx
 * Admin-only page for viewing all community-submitted fire reports.
 * Reports are automatically published on the live map when submitted —
 * no moderation step is required.
 */

import { Link, Navigate } from 'react-router-dom';
import { Flame, ShieldCheck, MapPin } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useFireReports } from '../hooks/useFireReports';

export default function AdminDashboardPage() {
  const { isAdmin, loading, profileLoading, user } = useAuth();

  const { reports, loading: reportsLoading } = useFireReports('all');
  const formatCoordinate = (value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue.toFixed(4) : '—';
  };

  if (loading || profileLoading) {
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck size={22} className="text-fire-500" />
        <h1 className="text-2xl font-bold text-white">Admin – Fire Reports</h1>
      </div>
      <p className="text-sentinel-300 text-sm mb-6">
        All reporter-submitted fires are automatically published on the live map. ({reports.length} total)
      </p>

      {/* List */}
      {reportsLoading ? (
        <div className="text-sentinel-300 text-sm py-12 text-center">Loading reports…</div>
      ) : reports.length === 0 ? (
        <div className="text-sentinel-400 text-sm py-12 text-center">
          No reports submitted yet.
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <article
              key={r.id}
              className="p-4 bg-sentinel-800/60 border border-sentinel-700 rounded-xl"
            >
              <div className="flex items-center gap-2 min-w-0 mb-2">
                <Flame size={14} className="text-fire-400 shrink-0" />
                <h3 className="font-semibold text-white truncate">{r.title}</h3>
              </div>

              <p className="text-sm text-sentinel-200 whitespace-pre-wrap mb-3">
                {r.description}
              </p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-sentinel-400">
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} />
                  {formatCoordinate(r.latitude)}°, {formatCoordinate(r.longitude)}°
                </span>
                <span>
                  Submitted {new Date(r.created_at).toLocaleString()}
                </span>
                <span className="truncate">Reporter: {r.user_id?.slice(0, 8)}…</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
