/**
 * AccountPage.jsx
 * Protected account-settings page for signed-in reporters.
 * Not linked in any nav — accessible via /account or the header link
 * on the reporter dashboard.
 */

import { useState } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import {
  Flame, User, Mail, Shield, Calendar, Lock,
  CheckCircle2, AlertCircle, LogOut, ChevronLeft,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabaseClient';

export default function AccountPage() {
  const { user, profile, isAuthenticated, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const [resetSent,   setResetSent]   = useState(false);
  const [resetBusy,   setResetBusy]   = useState(false);
  const [resetError,  setResetError]  = useState(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0c0e] flex items-center justify-center text-sentinel-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: '/account' }} replace />;
  }

  const email      = profile?.email  || user?.email  || '—';
  const role       = profile?.role   || 'reporter';
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : null;

  async function handlePasswordReset() {
    setResetError(null);
    setResetBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setResetSent(true);
    } catch (err) {
      setResetError(err?.message || 'Failed to send reset email');
    } finally {
      setResetBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  /* ── Shared input/label styles ── */
  const fieldLabel = 'block text-xs font-semibold text-sentinel-400 uppercase tracking-wider mb-1';
  const fieldValue = 'text-sm text-white';

  return (
    <div className="min-h-screen bg-[#0a0c0e] flex flex-col">

      {/* ── Header ── */}
      <header className="bg-sentinel-900 border-b border-sentinel-700/80 px-5 py-3
                         flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-fire-600/15 border border-fire-500/25
                          flex items-center justify-center">
            <Flame size={16} className="text-fire-400" />
          </div>
          <span className="text-white font-bold text-sm tracking-tight">Sentinel</span>
          <span className="text-sentinel-600 text-sm">|</span>
          <span className="text-sentinel-300 text-sm">Account Settings</span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/submit-report"
            className="flex items-center gap-1.5 text-xs text-sentinel-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={13} />
            Dashboard
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-xs text-sentinel-400 hover:text-white transition-colors"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 max-w-xl mx-auto w-full px-4 sm:px-6 py-10 space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-white">Account Settings</h1>
          <p className="text-sentinel-400 text-sm mt-1">
            Manage your reporter profile and security settings.
          </p>
        </div>

        {/* ── Profile card ── */}
        <section className="rounded-xl bg-sentinel-900 border border-sentinel-700 p-6 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-sentinel-700/60">
            <div className="w-10 h-10 rounded-full bg-fire-600/15 border border-fire-500/25
                            flex items-center justify-center shrink-0">
              <User size={18} className="text-fire-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{email}</p>
              <p className="text-sentinel-400 text-xs capitalize">{role}</p>
            </div>
          </div>

          {/* Email */}
          <div>
            <p className={fieldLabel}>
              <Mail size={11} className="inline mr-1" />Email Address
            </p>
            <p className={fieldValue}>{email}</p>
          </div>

          {/* Role */}
          <div>
            <p className={fieldLabel}>
              <Shield size={11} className="inline mr-1" />Role
            </p>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold
              ${role === 'admin'
                ? 'bg-fire-600/20 border border-fire-600/40 text-fire-300'
                : 'bg-blue-600/15 border border-blue-600/30 text-blue-300'}`}>
              {role}
            </span>
          </div>

          {/* Member since */}
          {memberSince && (
            <div>
              <p className={fieldLabel}>
                <Calendar size={11} className="inline mr-1" />Member Since
              </p>
              <p className={fieldValue}>{memberSince}</p>
            </div>
          )}
        </section>

        {/* ── Security card ── */}
        <section className="rounded-xl bg-sentinel-900 border border-sentinel-700 p-6 space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Lock size={14} className="text-sentinel-400" />
            Security
          </h2>

          <div>
            <p className="text-sm text-sentinel-300 mb-3">
              Change your password by requesting a reset link sent to your email address.
            </p>

            {resetSent ? (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-950/40 border border-green-800/60 text-green-300 text-xs">
                <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                <span>Password reset link sent! Check your email inbox.</span>
              </div>
            ) : (
              <>
                {resetError && (
                  <div className="flex items-start gap-2 mb-3 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{resetError}</span>
                  </div>
                )}
                <button
                  onClick={handlePasswordReset}
                  disabled={resetBusy}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-sentinel-800 border border-sentinel-600
                             text-sentinel-200 hover:bg-sentinel-700 hover:text-white
                             disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {resetBusy ? 'Sending…' : 'Send Password Reset Email'}
                </button>
              </>
            )}
          </div>
        </section>

        {/* ── Sign out ── */}
        <section className="rounded-xl bg-sentinel-900 border border-sentinel-700 p-6">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
            <LogOut size={14} className="text-sentinel-400" />
            Session
          </h2>
          <p className="text-sm text-sentinel-300 mb-4">
            Sign out of your account on this device.
          </p>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-950/40 border border-red-800/60
                       text-red-300 hover:bg-red-900/50 hover:text-red-200 transition-colors"
          >
            Sign Out
          </button>
        </section>

      </div>
    </div>
  );
}
