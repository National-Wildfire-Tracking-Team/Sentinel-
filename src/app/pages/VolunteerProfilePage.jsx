/**
 * VolunteerProfilePage.jsx
 * Create/edit the signed-in user's disaster-response volunteer profile,
 * and view their deployment sign-ups. Having a row here is what makes a
 * user a "volunteer" — no separate account role is used.
 * Route: /volunteer-profile
 */

import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ShieldAlert, User, Phone, AlertCircle, CheckCircle2, CalendarClock,
  Wrench, HeartHandshake, Siren, X,
} from 'lucide-react';

import { useAuth } from '../../shared/context/AuthContext';
import { useVolunteerProfile, saveVolunteerProfile, useMySignups, cancelDeploymentSignup } from '../hooks/useVolunteer';

const inputBase =
  'w-full rounded-lg bg-sentinel-800 border border-sentinel-700 text-white placeholder-sentinel-500 ' +
  'focus:outline-none focus:border-fire-500 focus:ring-1 focus:ring-fire-500/20 transition-colors text-sm px-4 py-2.5';

export default function VolunteerProfilePage() {
  const { user, loading, isAuthenticated } = useAuth();
  const { profile, loading: profileLoading, refresh } = useVolunteerProfile(user?.id);
  const { signups, loading: signupsLoading, refresh: refreshSignups } = useMySignups(user?.id);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        date_of_birth: profile.date_of_birth || '',
        age_confirmed: profile.age_confirmed || false,
        skills: profile.skills || '',
        availability: profile.availability || '',
        emergency_contact_name: profile.emergency_contact_name || '',
        emergency_contact_phone: profile.emergency_contact_phone || '',
      });
    } else if (!profileLoading) {
      setForm({
        full_name: '', phone: '', date_of_birth: '', age_confirmed: false,
        skills: '', availability: '', emergency_contact_name: '', emergency_contact_phone: '',
      });
      setEditing(true);
    }
  }, [profile, profileLoading]);

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-sentinel-300">Loading…</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: '/volunteer-profile' }} replace />;
  }

  async function handleSave(e) {
    e.preventDefault();
    setError(null);
    if (!form.full_name.trim() || !form.phone.trim()) {
      setError('Full name and phone number are required.');
      return;
    }
    if (!form.age_confirmed) {
      setError('You must confirm you are 16 years or older to volunteer with NWTT Disaster Response.');
      return;
    }
    setSaving(true);
    try {
      await saveVolunteerProfile(user.id, form);
      await refresh();
      setEditing(false);
    } catch (err) {
      setError(err?.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelSignup(signupId) {
    setCancellingId(signupId);
    try {
      await cancelDeploymentSignup(signupId);
      await refreshSignups();
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-sentinel-900">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert size={22} className="text-fire-500" />
          <h1 className="text-2xl font-bold text-white">Volunteer Profile</h1>
        </div>
        <p className="text-sentinel-300 text-sm mb-8">
          This information is used to coordinate disaster-response deployments and reach you in an emergency.
        </p>

        {profileLoading || !form ? (
          <div className="text-sentinel-300 text-sm py-12 text-center">Loading…</div>
        ) : editing ? (
          <form onSubmit={handleSave} className="space-y-5 p-6 rounded-2xl bg-sentinel-800/60 border border-sentinel-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-2">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
                  <input
                    required
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    className={`${inputBase} pl-10`}
                    placeholder="Your full name"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-2">
                  Phone <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
                  <input
                    required
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className={`${inputBase} pl-10`}
                    placeholder="(555) 555-5555"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-2">
                Date of Birth
              </label>
              <div className="relative">
                <CalendarClock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
                <input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                  className={`${inputBase} pl-10`}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-2">
                Skills & Certifications
              </label>
              <textarea
                rows={3}
                value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
                className={inputBase}
                placeholder="e.g. EMT certified, radio operator, photography, GIS..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-2">
                Availability
              </label>
              <input
                value={form.availability}
                onChange={(e) => setForm({ ...form, availability: e.target.value })}
                className={inputBase}
                placeholder="e.g. Weekends, on-call, flexible"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-2">
                  Emergency Contact Name
                </label>
                <input
                  value={form.emergency_contact_name}
                  onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })}
                  className={inputBase}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-2">
                  Emergency Contact Phone
                </label>
                <input
                  type="tel"
                  value={form.emergency_contact_phone}
                  onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })}
                  className={inputBase}
                />
              </div>
            </div>

            <label className="flex items-start gap-3 text-sm text-sentinel-200 cursor-pointer">
              <input
                type="checkbox"
                checked={form.age_confirmed}
                onChange={(e) => setForm({ ...form, age_confirmed: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded border-sentinel-600 bg-sentinel-800 text-fire-600 focus:ring-fire-500/40"
              />
              I confirm that I am 16 years of age or older.
            </label>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="btn-glass-fire px-6 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Profile'}
              </button>
              {profile && (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-6 py-2.5 rounded-xl bg-sentinel-700 text-white font-semibold text-sm hover:bg-sentinel-600 transition-colors border border-sentinel-600"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        ) : (
          <>
            <div className="p-6 rounded-2xl bg-sentinel-800/60 border border-sentinel-700 mb-8">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
                  <CheckCircle2 size={16} />
                  Volunteer Profile Complete
                </div>
                <button
                  onClick={() => setEditing(true)}
                  className="text-sentinel-300 hover:text-fire-400 text-sm transition-colors"
                >
                  Edit
                </button>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-sentinel-400 text-xs uppercase tracking-wider mb-1">Name</dt>
                  <dd className="text-white">{profile.full_name}</dd>
                </div>
                <div>
                  <dt className="text-sentinel-400 text-xs uppercase tracking-wider mb-1">Phone</dt>
                  <dd className="text-white">{profile.phone}</dd>
                </div>
                {profile.skills && (
                  <div className="sm:col-span-2">
                    <dt className="text-sentinel-400 text-xs uppercase tracking-wider mb-1">Skills</dt>
                    <dd className="text-sentinel-200 whitespace-pre-wrap">{profile.skills}</dd>
                  </div>
                )}
                {profile.availability && (
                  <div className="sm:col-span-2">
                    <dt className="text-sentinel-400 text-xs uppercase tracking-wider mb-1">Availability</dt>
                    <dd className="text-sentinel-200">{profile.availability}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">My Deployment Sign-Ups</h2>
              <Link to="/deployments" className="text-fire-400 hover:text-fire-300 text-sm transition-colors">
                Browse deployments →
              </Link>
            </div>

            {signupsLoading ? (
              <div className="text-sentinel-300 text-sm py-8 text-center">Loading…</div>
            ) : signups.length === 0 ? (
              <div className="text-sentinel-400 text-sm py-8 text-center rounded-2xl bg-sentinel-800/40 border border-sentinel-700">
                You haven't signed up for any deployments yet.
              </div>
            ) : (
              <div className="space-y-3">
                {signups.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-start justify-between gap-4 p-4 rounded-xl bg-sentinel-800/60 border border-sentinel-700"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Siren size={14} className="text-fire-400 shrink-0" />
                        <h3 className="font-semibold text-white truncate">{s.deployment?.title || 'Deployment'}</h3>
                      </div>
                      <p className="text-xs text-sentinel-400">
                        {s.deployment?.hazard_type} · {s.deployment?.location} ·{' '}
                        {s.deployment?.start_date ? new Date(s.deployment.start_date).toLocaleDateString() : ''}
                      </p>
                      {s.role_interest && (
                        <p className="text-xs text-sentinel-300 mt-1 inline-flex items-center gap-1">
                          <Wrench size={11} /> {s.role_interest}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleCancelSignup(s.id)}
                      disabled={cancellingId === s.id}
                      className="shrink-0 flex items-center gap-1 text-xs text-sentinel-400 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      <X size={13} />
                      {cancellingId === s.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-10 p-6 rounded-2xl bg-gradient-to-br from-fire-600/10 to-transparent border border-fire-600/20 flex items-center gap-4">
              <HeartHandshake size={24} className="text-fire-400 shrink-0" />
              <p className="text-sentinel-200 text-sm">
                Thank you for volunteering with NWTT Disaster Response. Your readiness helps
                communities recover faster.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
