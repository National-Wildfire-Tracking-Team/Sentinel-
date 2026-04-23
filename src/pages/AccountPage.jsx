/**
 * AccountPage.jsx
 * Protected account-settings page for signed-in reporters.
 * Not linked in any nav — accessible via /account or the header link
 * on the reporter dashboard.
 */

import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Flame, User, Mail, Shield, Calendar, Lock,
  CheckCircle2, AlertCircle, LogOut, ChevronLeft, MapPin,
  CreditCard, Zap, ExternalLink, Star,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabaseClient';
import { useSavedLocations } from '../hooks/useSavedLocations';
import { usePlan, PLANS } from '../hooks/usePlan';

export default function AccountPage() {
  const { user, profile, isAuthenticated, loading, signOut } = useAuth();
  const { planId, plan, subscription, isPaid, cancelAtPeriodEnd, currentPeriodEnd } = usePlan();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { locations } = useSavedLocations();

  const [resetSent, setResetSent] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState(null);

  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState(null);

  const checkoutResult = searchParams.get('checkout');

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

  const email = profile?.email || user?.email || '—';
  const role = profile?.role || 'reporter';
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

  async function handleManageBilling() {
    setPortalError(null);
    setPortalBusy(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('stripe-portal', {
        headers: authSession?.access_token
          ? { Authorization: `Bearer ${authSession.access_token}` }
          : undefined,
      });
      if (res.error || !res.data?.url) {
        throw new Error(res.data?.error ?? res.error?.message ?? 'Failed to open billing portal.');
      }
      window.location.href = res.data.url;
    } catch (err) {
      setPortalError(err.message);
    } finally {
      setPortalBusy(false);
    }
  }

  /* ── Shared input/label styles ── */
  const fieldLabel = 'block text-xs font-semibold text-sentinel-400 uppercase tracking-wider mb-1';
  const fieldValue = 'text-sm text-white';

  const planColors = {
    free: 'bg-sentinel-700/50 border-sentinel-600 text-sentinel-200',
    pro: 'bg-fire-600/20 border-fire-600/40 text-fire-300',
    team: 'bg-emerald-700/20 border-emerald-600/40 text-emerald-300',
  };

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
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs text-sentinel-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={13} />
            Back
          </button>
          <button
            onClick={() => navigate('/sentinel')}
            className="flex items-center gap-1.5 text-xs bg-fire-600/15 border border-fire-500/25 text-fire-400 hover:bg-fire-600/25 hover:text-fire-300 transition-colors px-2.5 py-1.5 rounded-md"
          >
            <MapPin size={12} />
            Back to Sentinel
          </button>
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
            Manage your profile, billing, and security settings.
          </p>
        </div>

        {/* ── Checkout result banners ── */}
        {checkoutResult === 'success' && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-green-950/40 border border-green-800/60 text-green-300 text-sm">
            <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
            <span>Subscription activated! Your plan has been upgraded.</span>
          </div>
        )}
        {checkoutResult === 'canceled' && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-sentinel-800 border border-sentinel-600 text-sentinel-300 text-sm">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>Checkout was canceled. No charges were made.</span>
          </div>
        )}

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

        {/* ── Billing / Plan card ── */}
        <section className="rounded-xl bg-sentinel-900 border border-sentinel-700 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <CreditCard size={14} className="text-fire-400" />
              Plan &amp; Billing
            </h2>
            <Link
              to="/pricing"
              className="text-xs text-fire-400 hover:text-fire-300 transition-colors"
            >
              View plans →
            </Link>
          </div>

          {/* Current plan badge */}
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${planColors[planId]}`}>
              {planId === 'pro' && <Zap size={11} />}
              {planId === 'team' && <Star size={11} />}
              {plan.label}
            </span>
            {subscription?.status && subscription.status !== 'active' && (
              <span className="text-xs text-yellow-400 capitalize">{subscription.status}</span>
            )}
          </div>

          {/* Period info */}
          {isPaid && currentPeriodEnd && (
            <p className="text-xs text-sentinel-400">
              {cancelAtPeriodEnd
                ? `Access until ${new Date(currentPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
                : `Renews ${new Date(currentPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`}
            </p>
          )}

          {/* Plan features summary */}
          <ul className="text-xs text-sentinel-300 space-y-1">
            <li>• {plan.savedLocationsLimit} saved locations</li>
            {plan.priorityAlerts && <li>• Priority alert delivery</li>}
            {plan.advancedLayers && <li>• Advanced radar &amp; satellite layers</li>}
            {plan.apiAccess && <li>• API access</li>}
            {plan.teamMembers > 1 && <li>• Up to {plan.teamMembers} team members</li>}
          </ul>

          {/* Billing portal or upgrade CTA */}
          {portalError && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{portalError}</span>
            </div>
          )}
          <div className="flex gap-2 flex-wrap pt-1">
            {isPaid ? (
              <button
                onClick={handleManageBilling}
                disabled={portalBusy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold
                           bg-sentinel-700 border border-sentinel-600 text-sentinel-200
                           hover:bg-sentinel-600 hover:text-white transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ExternalLink size={12} />
                {portalBusy ? 'Opening…' : 'Manage Billing'}
              </button>
            ) : (
              <Link
                to="/pricing"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold
                           bg-fire-600/15 border border-fire-500/30 text-fire-400
                           hover:bg-fire-600/25 hover:text-fire-300 transition-colors"
              >
                <Zap size={12} />
                Upgrade to Pro — $9.99/mo
              </Link>
            )}
          </div>
        </section>

        {/* ── Saved Zip Codes card ── */}
        <section className="rounded-xl bg-sentinel-900 border border-sentinel-700 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <MapPin size={14} className="text-emerald-400" />
              Saved Zip Codes
            </h2>
            <button
              onClick={() => navigate('/manage-zipcodes')}
              className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Manage →
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-sentinel-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(((locations?.length || 0) / plan.savedLocationsLimit) * 100, 100)}%` }}
              />
            </div>
            <span className="text-xs text-sentinel-300 shrink-0">
              {locations?.length || 0} / {plan.savedLocationsLimit} used
            </span>
          </div>

          {(!locations || locations.length === 0) ? (
            <p className="text-xs text-sentinel-400">
              No zip codes saved yet.{' '}
              <button
                onClick={() => navigate('/manage-zipcodes')}
                className="text-emerald-400 hover:text-emerald-300 transition-colors underline underline-offset-2"
              >
                Add your first zip code
              </button>{' '}
              to get real-time fire &amp; weather alerts.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {locations.map(loc => (
                <li key={loc.id} className="flex items-center gap-2 text-xs text-sentinel-300">
                  <MapPin size={11} className="text-emerald-400 shrink-0" />
                  <span className="font-medium text-white">{loc.name}</span>
                  {loc.address && loc.address !== loc.name && (
                    <span className="text-sentinel-400 truncate">{loc.address}</span>
                  )}
                </li>
              ))}
            </ul>
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
