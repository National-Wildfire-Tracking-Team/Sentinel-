/**
 * DeploymentsPage.jsx
 * Browse upcoming disaster-response deployments and sign up for one.
 * Public read (anyone can browse); signing up requires an account and a
 * completed volunteer profile.
 * Route: /deployments
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert, MapPin, Calendar, Clock, Users, AlertCircle, CheckCircle2, X,
} from 'lucide-react';

import { useAuth } from '../../shared/context/AuthContext';
import { useDeployments } from '../hooks/useDeployments';
import { useVolunteerProfile, useMySignups, signUpForDeployment, cancelDeploymentSignup } from '../hooks/useVolunteer';
import { RESPONSE_ROLES } from '../data/disasterResponseOptions';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';

export default function DeploymentsPage() {
  useDocumentTitle('Upcoming Deployments - Sentinel');

  const { user, isAuthenticated } = useAuth();
  const { deployments, loading, error } = useDeployments('upcoming');
  const { profile } = useVolunteerProfile(user?.id);
  const { signups, refresh: refreshSignups } = useMySignups(user?.id);

  const [openId, setOpenId] = useState(null);
  const [roleInterest, setRoleInterest] = useState(RESPONSE_ROLES[0]);
  const [notes, setNotes] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [formError, setFormError] = useState(null);

  const signupByDeployment = useMemo(() => {
    const map = new Map();
    for (const s of signups) {
      if (s.deployment?.id) map.set(s.deployment.id, s.id);
    }
    return map;
  }, [signups]);

  function openSignupForm(deploymentId) {
    setFormError(null);
    setNotes('');
    setRoleInterest(RESPONSE_ROLES[0]);
    setOpenId(deploymentId);
  }

  async function handleSignUp(deploymentId) {
    setFormError(null);
    setBusyId(deploymentId);
    try {
      await signUpForDeployment({ deploymentId, userId: user.id, roleInterest, notes });
      await refreshSignups();
      setOpenId(null);
    } catch (err) {
      setFormError(err?.message || 'Could not sign up. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(signupId) {
    setBusyId(signupId);
    try {
      await cancelDeploymentSignup(signupId);
      await refreshSignups();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-sentinel-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert size={22} className="text-fire-500" />
          <h1 className="text-2xl font-bold text-white">Upcoming Deployments</h1>
        </div>
        <p className="text-sentinel-300 text-sm mb-8">
          Browse active disaster-response deployment opportunities and sign up
          for the ones that fit your availability.
        </p>

        {loading ? (
          <div className="text-sentinel-300 text-sm py-16 text-center">Loading deployments…</div>
        ) : error ? (
          <div className="text-red-300 text-sm py-16 text-center">Could not load deployments.</div>
        ) : deployments.length === 0 ? (
          <div className="text-sentinel-400 text-sm py-16 text-center rounded-2xl bg-sentinel-800/40 border border-sentinel-700">
            There are no upcoming deployments at this time. Please check back later.
          </div>
        ) : (
          <div className="space-y-4">
            {deployments.map((d) => {
              const signupId = signupByDeployment.get(d.id);
              const isOpen = openId === d.id;
              return (
                <article key={d.id} className="p-5 rounded-2xl bg-sentinel-800/60 border border-sentinel-700">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h3 className="font-semibold text-white text-lg">{d.title}</h3>
                    <span className="shrink-0 px-2.5 py-0.5 rounded-full bg-fire-600/10 text-fire-400 text-xs font-semibold">
                      {d.hazard_type}
                    </span>
                  </div>

                  {d.description && (
                    <p className="text-sm text-sentinel-200 mb-3 whitespace-pre-wrap">{d.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-sentinel-400 mb-4">
                    {d.location && (
                      <span className="inline-flex items-center gap-1"><MapPin size={12} /> {d.location}</span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={12} /> {new Date(d.start_date).toLocaleDateString()}
                    </span>
                    {d.start_time && (
                      <span className="inline-flex items-center gap-1"><Clock size={12} /> {d.start_time}</span>
                    )}
                    {d.capacity != null && (
                      <span className="inline-flex items-center gap-1"><Users size={12} /> Capacity: {d.capacity}</span>
                    )}
                  </div>

                  {!isAuthenticated ? (
                    <Link
                      to="/login"
                      state={{ from: '/deployments' }}
                      className="inline-block text-sm text-fire-400 hover:text-fire-300 transition-colors"
                    >
                      Sign in to volunteer for this deployment →
                    </Link>
                  ) : !profile ? (
                    <Link
                      to="/volunteer-profile"
                      className="inline-block text-sm text-fire-400 hover:text-fire-300 transition-colors"
                    >
                      Complete your volunteer profile to sign up →
                    </Link>
                  ) : signupId ? (
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 text-sm text-green-400 font-medium">
                        <CheckCircle2 size={15} /> You're signed up
                      </span>
                      <button
                        onClick={() => handleCancel(signupId)}
                        disabled={busyId === signupId}
                        className="inline-flex items-center gap-1 text-xs text-sentinel-400 hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                        <X size={12} /> {busyId === signupId ? 'Cancelling…' : 'Cancel'}
                      </button>
                    </div>
                  ) : isOpen ? (
                    <div className="mt-2 p-4 rounded-xl bg-sentinel-900 border border-sentinel-700 space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-1.5">
                          Role Interest
                        </label>
                        <select
                          value={roleInterest}
                          onChange={(e) => setRoleInterest(e.target.value)}
                          className="w-full rounded-lg bg-sentinel-800 border border-sentinel-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-fire-500"
                        >
                          {RESPONSE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-1.5">
                          Notes <span className="text-sentinel-500 font-normal normal-case">(optional)</span>
                        </label>
                        <textarea
                          rows={2}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="w-full rounded-lg bg-sentinel-800 border border-sentinel-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-fire-500"
                        />
                      </div>
                      {formError && (
                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
                          <AlertCircle size={13} className="shrink-0 mt-0.5" />
                          <span>{formError}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleSignUp(d.id)}
                          disabled={busyId === d.id}
                          className="px-5 py-2 rounded-lg bg-fire-600 text-white font-semibold text-sm hover:bg-fire-500 disabled:opacity-50 transition-colors"
                        >
                          {busyId === d.id ? 'Signing up…' : 'Confirm Sign-Up'}
                        </button>
                        <button
                          onClick={() => setOpenId(null)}
                          className="text-sm text-sentinel-400 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => openSignupForm(d.id)}
                      className="px-5 py-2 rounded-lg bg-fire-600 text-white font-semibold text-sm hover:bg-fire-500 transition-colors"
                    >
                      Sign Up
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
