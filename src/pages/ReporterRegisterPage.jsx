/**
 * ReporterRegisterPage.jsx
 * Dedicated sign-up page for NWTT field reporters.
 * Passes intended_role='reporter' in signup metadata so the Supabase trigger
 * creates the profile with role='reporter' instead of the default 'public'.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mail, Lock, Eye, EyeOff, Flame, AlertCircle, Radio,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';

export default function ReporterRegisterPage() {
  const { signUp, isSupabaseConfigured } = useAuth();
  const navigate = useNavigate();

  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [error,           setError]           = useState(null);
  const [busy,            setBusy]            = useState(false);

  const inputBase =
    'w-full rounded-lg bg-sentinel-800 border border-sentinel-700 text-white placeholder-sentinel-500 ' +
    'focus:outline-none focus:border-fire-500 focus:ring-1 focus:ring-fire-500/20 transition-colors text-sm';

  async function handleRegister(e) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setBusy(true);
    try {
      const { error: err } = await signUp(email, password, { intended_role: 'reporter' });
      if (err) throw err;

      navigate('/submit-report', { replace: true });
    } catch (err) {
      setError(err?.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

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
            <span className="text-fire-300 text-xs font-semibold uppercase tracking-wider">Reporter Registration</span>
          </div>
          <p className="text-sentinel-200/70 leading-relaxed text-sm">
            Join the NWTT field reporter network. Submit real-time wildfire incident
            data directly to the national intelligence platform.
          </p>

          <div className="mt-14 grid grid-cols-3 gap-3">
            {[
              { value: 'Free',  label: 'Account'   },
              { value: 'Live',  label: 'Reporting'  },
              { value: 'Team',  label: 'Network'    },
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

      {/* ══════════════════ RIGHT PANEL — Register form ══════════════════ */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-[#0d1117] p-8">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <Flame size={20} className="text-fire-400" />
            <span className="text-white font-bold text-sm">Sentinel NWTT</span>
          </div>

          <>
              <div className="flex items-center gap-3 mb-1">
                <Radio size={22} className="text-fire-400" />
                <h2 className="text-3xl font-bold text-white">Reporter Sign Up</h2>
              </div>
              <p className="text-sentinel-400 text-sm mb-8">
                Create a reporter account to submit wildfire incidents to the NWTT platform.
              </p>

              {!isSupabaseConfigured && (
                <div className="mb-5 p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs">
                  Supabase is not configured — add{' '}
                  <code>VITE_SUPABASE_URL</code> and{' '}
                  <code>VITE_SUPABASE_ANON_KEY</code> to your{' '}
                  <code>.env</code> file.
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-5">

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
                      placeholder="Min. 6 characters"
                      autoComplete="new-password"
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

                <div>
                  <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                      className={`${inputBase} pl-10 pr-11 py-3`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sentinel-400 hover:text-white transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
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
                  {busy ? 'Creating account…' : 'Create Reporter Account'}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-sentinel-400">
                Already have a reporter account?{' '}
                <Link to="/reporter-login" className="text-fire-400 hover:text-fire-300 font-medium transition-colors">
                  Sign in
                </Link>
              </p>
            </>

          <div className="mt-8 text-center space-y-2">
            <div>
              <Link to="/register" className="text-xs text-sentinel-500 hover:text-sentinel-300 transition-colors">
                Looking for a public account instead?
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
