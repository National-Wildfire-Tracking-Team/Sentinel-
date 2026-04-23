/**
 * ReporterLoginPage.jsx
 * Hidden login portal for NWTT reporters.
 * Not linked anywhere in the public navigation — access by direct URL only.
 * Route: /reporter-login
 */

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Mail, Lock, Eye, EyeOff, Flame, AlertCircle, CheckCircle2, ShieldCheck,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabaseClient';

/** Fetch the profile role for a user id immediately after sign-in. */
async function fetchRole(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  return data?.role ?? 'public';
}

export default function ReporterLoginPage() {
  const { signIn, isSupabaseConfigured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe,   setRememberMe]   = useState(false);
  const [error,        setError]        = useState(null);
  const [busy,         setBusy]         = useState(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent,  setResetSent]  = useState(false);

  const redirectTo = location.state?.from || '/reporter-dashboard';

  async function handleSignIn(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data, error: err } = await signIn(email, password, rememberMe);
      if (err) throw err;

      // Verify the signed-in user has a reporter (or admin) role.
      // Regular users (role='public') are not permitted to access this portal.
      const role = await fetchRole(data?.user?.id);
      if (role !== 'reporter' && role !== 'admin') {
        // Sign them back out immediately to keep the session clean.
        await supabase.auth.signOut();
        setError(
          'This portal is for authorized reporters only. ' +
          'If you are a member, please use the regular sign-in page.'
        );
        return;
      }

      navigate(redirectTo, { replace: true });
    } catch (err) {
      const msg = err?.message || '';
      // Supabase returns "Invalid login credentials" for both wrong password
      // AND unconfirmed email. Provide a more helpful hint in either case.
      if (
        msg.toLowerCase().includes('invalid login credentials') ||
        msg.toLowerCase().includes('email not confirmed')
      ) {
        setError(
          'Invalid credentials. If you just registered, please confirm your email address first — check your inbox (and spam folder) for the confirmation link.'
        );
      } else {
        setError(msg || 'Authentication failed');
      }
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
    'w-full rounded-lg bg-[#0d1117] border border-[#30363d] text-white placeholder-[#484f58] ' +
    'focus:outline-none focus:border-[#0096ff] focus:ring-1 focus:ring-[#0096ff]/20 transition-colors text-sm';

  return (
    <div className="min-h-screen bg-[#010409] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo mark */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-[#0096ff]/10 border border-[#0096ff]/30 flex items-center justify-center mb-4 shadow-lg shadow-[#0096ff]/10">
            <Flame size={28} className="text-[#0096ff]" />
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Reporter Portal</h1>
          <p className="text-[#8b949e] text-sm mt-1">Sign in to access the incident dashboard</p>
        </div>

        <div className="bg-[#0d1117] border border-[#30363d] rounded-2xl p-8 shadow-2xl">

          {!forgotMode ? (
            <>
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
                  <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#484f58] pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="reporter@example.com"
                      autoComplete="email"
                      className={`${inputBase} pl-10 pr-4 py-3`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#484f58] pointer-events-none" />
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
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#8b949e] transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                      className="w-4 h-4 rounded border-[#30363d] bg-[#0d1117] accent-[#0096ff] cursor-pointer"
                    />
                    <span className="text-sm text-[#8b949e]">Remember me</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => { setForgotMode(true); setError(null); setResetEmail(email); }}
                    className="text-sm font-medium text-[#0096ff] hover:text-[#58a6ff] transition-colors"
                  >
                    Forgot password?
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
                  className="w-full py-3 rounded-lg font-semibold text-sm text-white bg-[#0096ff] hover:bg-[#0080db] 
                             disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {busy ? 'Signing in…' : 'Sign In'}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-[#21262d] text-center">
                <p className="text-sm text-[#8b949e]">
                  Don&apos;t have an account?{' '}
                  <Link to="/reporter-register" className="text-[#0096ff] hover:text-[#58a6ff] font-medium transition-colors">
                    Create reporter account
                  </Link>
                </p>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setForgotMode(false); setResetSent(false); setError(null); }}
                className="text-xs text-[#8b949e] hover:text-white mb-6 flex items-center gap-1 transition-colors"
              >
                ← Back to sign in
              </button>

              <h2 className="text-xl font-bold text-white mb-1">Reset Password</h2>
              <p className="text-[#8b949e] text-sm mb-6">
                Enter your email and we&apos;ll send you a reset link.
              </p>

              {!resetSent ? (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="relative">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#484f58] pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="reporter@example.com"
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
                    className="w-full py-3 rounded-lg font-semibold text-sm text-white bg-[#0096ff] hover:bg-[#0080db]
                               disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
        </div>

        {/* Security note — subtle indicator this is a protected area */}
        <div className="flex items-center justify-center gap-2 mt-6 text-[#484f58] text-xs">
          <ShieldCheck size={13} />
          <span>Authorized personnel only</span>
        </div>

      </div>
    </div>
  );
}
