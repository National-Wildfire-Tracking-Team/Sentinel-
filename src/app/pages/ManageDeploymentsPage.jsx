/**
 * ManageDeploymentsPage.jsx
 * Admin-only: create, edit, cancel deployments and view who has signed up.
 * Route: /admin/deployments
 */

import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ShieldCheck, Plus, Trash2, Users, AlertCircle, X,
} from 'lucide-react';

import { useAuth } from '../../shared/context/AuthContext';
import { useDeployments, createDeployment, updateDeployment, deleteDeployment, getDeploymentSignups } from '../hooks/useDeployments';
import { HAZARD_TYPES } from '../data/disasterResponseOptions';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';

const EMPTY_FORM = {
  title: '', hazard_type: HAZARD_TYPES[0], description: '', location: '',
  start_date: '', start_time: '', end_date: '', capacity: '', status: 'upcoming',
};

const inputBase =
  'w-full rounded-lg bg-sentinel-800 border border-sentinel-700 text-white placeholder-sentinel-500 ' +
  'focus:outline-none focus:border-fire-500 focus:ring-1 focus:ring-fire-500/20 transition-colors text-sm px-3 py-2';

export default function ManageDeploymentsPage() {
  useDocumentTitle('Manage Deployments - Sentinel');

  const { isAdmin, loading, profileLoading, user } = useAuth();
  const { deployments, loading: deploymentsLoading, refresh } = useDeployments('all');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [rosterFor, setRosterFor] = useState(null);
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  if (loading || profileLoading) {
    return <div className="max-w-5xl mx-auto px-4 py-16 text-sentinel-300">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: '/admin/deployments' }} replace />;
  }
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-white mb-2">Admin Access Required</h1>
        <p className="text-sentinel-300 text-sm mb-4">
          Your account does not have the <code>admin</code> role. Contact an
          existing administrator to be promoted.
        </p>
        <Link to="/" className="text-fire-400 hover:text-fire-300 text-sm">← Back to Sentinel</Link>
      </div>
    );
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim() || !form.start_date) {
      setError('Title and start date are required.');
      return;
    }
    setSaving(true);
    try {
      await createDeployment({
        title: form.title.trim(),
        hazard_type: form.hazard_type,
        description: form.description.trim(),
        location: form.location.trim(),
        start_date: form.start_date,
        start_time: form.start_time,
        end_date: form.end_date || null,
        capacity: form.capacity ? Number(form.capacity) : null,
        status: form.status,
        created_by: user.id,
      });
      await refresh();
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      setError(err?.message || 'Could not create deployment.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id, status) {
    await updateDeployment(id, { status });
    await refresh();
  }

  async function handleDelete(id) {
    await deleteDeployment(id);
    await refresh();
    if (rosterFor === id) setRosterFor(null);
  }

  async function handleViewRoster(id) {
    if (rosterFor === id) {
      setRosterFor(null);
      return;
    }
    setRosterFor(id);
    setRosterLoading(true);
    try {
      const rows = await getDeploymentSignups(id);
      setRoster(rows);
    } finally {
      setRosterLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={22} className="text-fire-500" />
          <h1 className="text-2xl font-bold text-white">Manage Deployments</h1>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-fire-600 text-white text-sm font-semibold hover:bg-fire-500 transition-colors"
        >
          <Plus size={15} /> New Deployment
        </button>
      </div>
      <p className="text-sentinel-300 text-sm mb-6">{deployments.length} total</p>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-8 p-5 rounded-2xl bg-sentinel-800/60 border border-sentinel-700 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-1.5">Title *</label>
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-1.5">Hazard Type</label>
              <select value={form.hazard_type} onChange={(e) => setForm({ ...form, hazard_type: e.target.value })} className={inputBase}>
                {HAZARD_TYPES.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-1.5">Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputBase} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-1.5">Location</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={inputBase} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-1.5">Start Date *</label>
              <input required type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-1.5">Start Time</label>
              <input value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} placeholder="e.g. 8:00 AM" className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-1.5">End Date</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-1.5">Capacity</label>
              <input type="number" min="0" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className={inputBase} />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg bg-fire-600 text-white font-semibold text-sm hover:bg-fire-500 disabled:opacity-50 transition-colors">
              {saving ? 'Creating…' : 'Create Deployment'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-sentinel-400 hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {deploymentsLoading ? (
        <div className="text-sentinel-300 text-sm py-12 text-center">Loading…</div>
      ) : deployments.length === 0 ? (
        <div className="text-sentinel-400 text-sm py-12 text-center">No deployments yet.</div>
      ) : (
        <div className="space-y-3">
          {deployments.map((d) => (
            <article key={d.id} className="p-4 bg-sentinel-800/60 border border-sentinel-700 rounded-xl">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-white truncate">{d.title}</h3>
                  <p className="text-xs text-sentinel-400 mt-0.5">
                    {d.hazard_type} · {d.location || 'No location set'} · {new Date(d.start_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={d.status}
                    onChange={(e) => handleStatusChange(d.id, e.target.value)}
                    className="text-xs rounded-lg bg-sentinel-900 border border-sentinel-700 text-white px-2 py-1.5"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <button
                    onClick={() => handleViewRoster(d.id)}
                    className="inline-flex items-center gap-1 text-xs text-sentinel-300 hover:text-fire-400 transition-colors"
                  >
                    <Users size={13} /> Roster
                  </button>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="text-sentinel-400 hover:text-red-400 transition-colors"
                    aria-label="Delete deployment"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {rosterFor === d.id && (
                <div className="mt-3 p-3 rounded-lg bg-sentinel-900 border border-sentinel-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-sentinel-300 uppercase tracking-wider">Sign-Ups</span>
                    <button onClick={() => setRosterFor(null)} className="text-sentinel-500 hover:text-white">
                      <X size={13} />
                    </button>
                  </div>
                  {rosterLoading ? (
                    <p className="text-xs text-sentinel-400">Loading…</p>
                  ) : roster.length === 0 ? (
                    <p className="text-xs text-sentinel-400">No sign-ups yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {roster.map((r) => (
                        <li key={r.id} className="text-xs text-sentinel-200 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className="font-medium text-white">{r.volunteer_profiles?.full_name || 'Unknown'}</span>
                          <span className="text-sentinel-400">{r.volunteer_profiles?.phone}</span>
                          {r.role_interest && <span className="text-fire-400">{r.role_interest}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
