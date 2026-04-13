/**
 * LoginPage.jsx
 * Email + password sign-in / sign-up via Supabase Auth.
 */

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Flame, LogIn, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react';

import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { signIn, signUp, isSupabaseConfigured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState(null);
  const [info, setInfo]         = useState(null);
  const [busy, setBusy]         = useState(false);

  const redirectTo = location.state?.from || '/submit-report';

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);

    try {
      if (mode === 'signin') {
        const { error: err } = await signIn(email, password);
        if (err) throw err;
        navigate(redirectTo, { replace: true });
      } else {
        const { data, error: err } = await signUp(email, password);
        if (err) throw err;
        if (data?.session) {
          // Email confirmation is disabled – already logged in
          navigate(redirectTo, { replace: true });
        } else {
          setInfo('Check your email to confirm your account, then sign in.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError(err?.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
      <div className="flex items-center gap-2 mb-6">
        <Flame size={22} className="text-fire-500" />
        <h1 className="text-2xl font-bold text-white">
          {mode === 'signin' ? 'Reporter Sign In' : 'Create Reporter Account'}
        </h1>
      </div>

      <p className="text-sentinel-300 text-sm mb-6">
        Sign in to submit wildfire reports to the NWTT platform. All submissions
        are reviewed by a moderator before appearing on the public map.
      </p>

      {!isSupabaseConfigured && (
        <div className="mb-4 p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs">
          Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> to your <code>.env</code> file.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-semibold text-sentinel-200 uppercase mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-sentinel-800 border border-sentinel-700
                       text-white placeholder-sentinel-400 focus:border-fire-500 focus:outline-none"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-semibold text-sentinel-200 uppercase mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-sentinel-800 border border-sentinel-700
                       text-white placeholder-sentinel-400 focus:border-fire-500 focus:outline-none"
            placeholder="At least 6 characters"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {info && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-green-950/40 border border-green-800/60 text-green-300 text-xs">
            <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
            <span>{info}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !isSupabaseConfigured}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg
                     bg-fire-600 hover:bg-fire-500 disabled:opacity-50 disabled:cursor-not-allowed
                     text-white font-semibold transition-colors"
        >
          {mode === 'signin' ? <LogIn size={15} /> : <UserPlus size={15} />}
          {busy ? 'Working…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-sentinel-300">
        {mode === 'signin' ? (
          <>
            Don&apos;t have an account?{' '}
            <button
              onClick={() => { setMode('signup'); setError(null); setInfo(null); }}
              className="text-fire-400 hover:text-fire-300 font-medium"
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button
              onClick={() => { setMode('signin'); setError(null); setInfo(null); }}
              className="text-fire-400 hover:text-fire-300 font-medium"
            >
              Sign in
            </button>
          </>
        )}
      </div>

      <div className="mt-8 text-center">
        <Link to="/" className="text-xs text-sentinel-400 hover:text-white">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
