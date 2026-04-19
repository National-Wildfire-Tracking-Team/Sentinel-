/**
 * ReporterLoginPage.jsx
 * Dedicated login portal for NWTT reporters.
 * Mirrors the general LoginPage style but targets the reporter workflow.
 */

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Mail, Lock, Eye, EyeOff, Flame, AlertCircle, CheckCircle2, Radio,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabaseClient';

export default function ReporterLoginPage() {
  const { signIn, isSupabaseConfigured } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe,   setRememberMe]   = useState(false);
  const [error,        setError]        = useState(null);
  const [busy,         setBusy]         = useState(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent,  setResetSent]  = useState(false);

  const redirectTo = location.state?.from || '/submit-report';

  async function handleSignIn(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await signIn(email, password, rememberMe);
      if (err) throw err;
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err?.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const addr = resetEmail.trim() || email.trim();
      const { error: err } = await supabase.auth.resetPasswordForEmail(addr);
      if (err) throw err;
      setResetSent(true);
    } catch (err) {
      setError(err?.message || 'Failed to send reset email');
    } finally {
      setBusy(false);
    }
  }

  const inputBase =
    'w-full rounded-lg bg-sentinel-800 border border-sentinel-700 text-white placeholder-sentinel-500 ' +
    'focus:outline-none focus:border-fire-500 focus:ring-1 focus:ring-fire-500/20 transition-colors text-sm';

  return (
    <div className="min-h-screen flex">

      {/* ══════════════════ LEFT PANEL — Branding ══════════════════ */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col items-center justify-center overflow-hidden">

        <div className="absolute inset-0 bg-gradient-to-br from-[#0d0500] via-[#1a0800] to-[#0d0500]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-72 bg-gradient-to-t from-orange-900/40 to-transparent" />

        <div className="relative z-10 text-center px-12 max-w-lg">
          <div className="flex items-center justify-center mb-8">
            <div className="w-20 h-20 rounded-2xl border border-fire-500/40 bg-fire-600/15
                            flex items-center justify-center shadow-lg shadow-fire-900/50">
              <Flame size={44} className="text-fire-400" />
            </div>
          </div>

          <h1 className="text-5xl font-black text-white tracking-tight mb-2">Sentinel</h1>
          <p className="text-fire-400 font-semibold tracking-wide uppercase text-sm mb-2">
            National Wildfire Tracking Team
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-fire-600/15 border border-fire-500/30 mb-6">
            <Radio size={12} className="text-fire-400" />
            <span className="text-fire-300 text-xs font-semibold uppercase tracking-wider">Reporter Portal</span>
          </div>
          <p className="text-sentinel-200/70 leading-relaxed text-sm">
            Secure login for verified NWTT field reporters. Submit real-time wildfire
            incident data directly to the intelligence platform.
          </p>

          <div className="mt-14 grid grid-cols-3 gap-3">
            {[
              { value: '24/7',  label: 'Monitoring' },
              { value: 'Live',  label: 'Reporting'  },
              { value: 'Rapid', label: 'Response'   },
            ].map(({ value, label }) => (
              <div
                key={label}
                className="py-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm"
              >
                <div className="text-xl font-bold text-white">{value}</div>
                <div className="text-xs text-sentinel-300 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════ RIGHT PANEL — Login form ══════════════════ */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-[#0d1117] p-8">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <Flame size={20} className="text-fire-400" />
            <span className="text-white font-bold text-sm">Sentinel NWTT</span>
          </div>

          {!forgotMode ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <Radio size={18} className="text-fire-400" />
                <h2 className="text-3xl font-bold text-white">Reporter Login</h2>
              </div>
              <p className="text-sentinel-400 text-sm mb-8">
                Sign in to access the NWTT reporter dashboard
              </p>

              {!isSupabaseConfigured && (
                <div className="mb-5 p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs">
                  Supabase is not configured — add{' '}
                  <code>VITE_SUPABASE_URL</code> and{' '}
                  <code>VITE_SUPABASE_ANON_KEY</code> to your{' '}
                  <code>.env</code> file.
                </div>
              )}

              <form onSubmit={handleSignIn} className="space-y-5">

                <div>
                  <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      className={`${inputBase} pl-10 pr-4 py-3`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className={`${inputBase} pl-10 pr-11 py-3`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sentinel-400 hover:text-white transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-sentinel-600 bg-sentinel-800 accent-fire-500 cursor-pointer"
                    />
                    <span className="text-sm text-sentinel-300">Remember me</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => { setForgotMode(true); setError(null); setResetEmail(email); }}
                    className="text-sm font-medium text-fire-400 hover:text-fire-300 transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy || !isSupabaseConfigured}
                  className="w-full py-3 rounded-lg font-bold text-sm tracking-widest uppercase text-white
                             bg-fire-600 hover:bg-fire-500 disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all"
                >
                  {busy ? 'Signing in…' : 'Reporter Sign In'}
                </button>
              </form>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setForgotMode(false); setResetSent(false); setError(null); }}
                className="text-xs text-sentinel-400 hover:text-white mb-6 flex items-center gap-1 transition-colors"
              >
                ← Back to login
              </button>

              <h2 className="text-2xl font-bold text-white mb-1">Reset Password</h2>
              <p className="text-sentinel-400 text-sm mb-8">
                Enter your email and we&apos;ll send you a password reset link.
              </p>

              {!resetSent ? (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="relative">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      className={`${inputBase} pl-10 pr-4 py-3`}
                    />
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-3 rounded-lg font-bold text-sm tracking-widest uppercase text-white
                               bg-fire-600 hover:bg-fire-500 disabled:opacity-50 disabled:cursor-not-allowed
                               transition-all"
                  >
                    {busy ? 'Sending…' : 'Send Reset Link'}
                  </button>
                </form>
              ) : (
                <div className="flex items-start gap-2 p-4 rounded-lg bg-green-950/40 border border-green-800/60 text-green-300 text-sm">
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  <span>Reset link sent! Check your email inbox.</span>
                </div>
              )}
            </>
          )}

          <p className="mt-6 text-center text-sm text-sentinel-400">
            New reporter?{' '}
            <Link to="/reporter-register" className="text-fire-400 hover:text-fire-300 font-medium transition-colors">
              Create a reporter account
            </Link>
          </p>

          <div className="mt-4 text-center space-y-2">
            <div>
              <Link to="/login" className="text-xs text-sentinel-500 hover:text-sentinel-300 transition-colors">
                Not a reporter? Sign in here
              </Link>
            </div>
            <div>
              <Link to="/" className="text-xs text-sentinel-500 hover:text-sentinel-300 transition-colors">
                ← Back to home
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
