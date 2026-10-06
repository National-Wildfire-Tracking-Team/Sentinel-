/**
 * ReporterRegisterPage.jsx
 * Account creation for the reporter portal, served on its own subdomain
 * (reporter.nationalwildfiretrackingteam.org). Not linked anywhere in the
 * public navigation — access by direct URL only.
 * Route: /register (on the reporter.* subdomain)
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mail, Lock, Eye, EyeOff, Flame, AlertCircle, CheckCircle2, ShieldCheck, User,
} from 'lucide-react';

import { useAuth } from '../../shared/context/AuthContext';
import { isExistingAccountSignUp } from '../../shared/utils/authEmail';
import ResendConfirmation from '../components/Auth/ResendConfirmation';

export default function ReporterRegisterPage() {
  const { signUp, isSupabaseConfigured } = useAuth();
  const navigate = useNavigate();

  const [fullName,        setFullName]        = useState('');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [error,           setError]           = useState(null);
  const [busy,            setBusy]            = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const passwordStrength = (() => {
    if (password.length === 0) return null;
    if (password.length < 6) return { level: 'weak', label: 'Too short', color: 'bg-red-500' };
    if (password.length < 10) return { level: 'fair', label: 'Fair', color: 'bg-yellow-500' };
    if (/[A-Z]/.test(password) && /[0-9]/.test(password)) return { level: 'strong', label: 'Strong', color: 'bg-green-500' };
    return { level: 'good', label: 'Good', color: 'bg-blue-500' };
  })();

  const inputBase =
    'w-full rounded-lg bg-sentinel-800 border border-sentinel-600 text-white placeholder-sentinel-500 ' +
    'focus:outline-none focus:border-fire-600 focus:ring-1 focus:ring-fire-600/20 transition-colors text-sm';

  async function handleRegister(e) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      const metadata = { intended_role: 'reporter' };
      if (fullName.trim()) metadata.full_name = fullName.trim();

      const { data, error: err } = await signUp(email, password, metadata);
      if (err) throw err;
      if (isExistingAccountSignUp(data)) {
        setError('An account with this email already exists. Sign in instead, or use "Forgot password" to reset it.');
        return;
      }

      // When Supabase has email confirmation enabled, signUp returns a user but
      // no active session. Detect this and show a confirmation prompt instead of
      // navigating to the dashboard (which would just redirect back to login).
      if (data?.session) {
        navigate('/', { replace: true });
      } else {
        setConfirmationSent(true);
      }
    } catch (err) {
      setError(err?.message || 'Registration failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (confirmationSent) {
    return (
      <div className="min-h-screen bg-sentinel-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-10">
            <div className="w-14 h-14 rounded-2xl bg-fire-600/10 border border-fire-600/30 flex items-center justify-center mb-4 shadow-lg shadow-fire-600/10">
              <Flame size={28} className="text-fire-500" />
            </div>
            <h1 className="text-white text-2xl font-bold tracking-tight">Check Your Email</h1>
            <p className="text-sentinel-300 text-sm mt-1">One more step to activate your account</p>
          </div>

          <div className="bg-sentinel-800 border border-sentinel-600 rounded-2xl p-8 shadow-2xl">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-full bg-green-950/40 border border-green-800/60 flex items-center justify-center">
                <Mail size={22} className="text-green-400" />
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Confirmation email sent</p>
                <p className="text-sentinel-300 text-sm">
                  We sent a confirmation link to{' '}
                  <span className="text-white font-medium">{email}</span>.
                  Click the link in that email to verify your address and activate your reporter account.
                </p>
              </div>
              <div className="w-full mt-2 p-3 rounded-lg bg-amber-950/30 border border-amber-800/50 text-amber-200 text-xs text-left">
                <strong>Important:</strong> You must confirm your email before you can sign in.
                If you don&apos;t see the email, check your spam or junk folder.
              </div>
              <ResendConfirmation email={email} />
              <Link
                to="/login"
                className="btn-glass-fire mt-2 w-full py-3 rounded-lg font-semibold text-sm text-center block"
              >
                Go to Sign In
              </Link>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 mt-6 text-sentinel-500 text-xs">
            <ShieldCheck size={13} />
            <span>Authorized personnel only</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sentinel-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo mark */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-fire-600/10 border border-fire-600/30 flex items-center justify-center mb-4 shadow-lg shadow-fire-600/10">
            <Flame size={28} className="text-fire-500" />
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Create Reporter Account</h1>
          <p className="text-sentinel-300 text-sm mt-1">Join the NWTT incident reporting network</p>
        </div>

        <div className="bg-sentinel-800 border border-sentinel-600 rounded-2xl p-8 shadow-2xl">

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
                Full Name <span className="text-sentinel-500 font-normal normal-case">(optional)</span>
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sentinel-500 pointer-events-none" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  autoComplete="name"
                  className={`${inputBase} pl-10 pr-4 py-3`}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-2">
                Email Address <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sentinel-500 pointer-events-none" />
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
              <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-2">
                Password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sentinel-500 pointer-events-none" />
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
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sentinel-500 hover:text-sentinel-300 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {passwordStrength && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-sentinel-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${passwordStrength.color}`}
                      style={{
                        width: passwordStrength.level === 'weak' ? '25%'
                          : passwordStrength.level === 'fair' ? '50%'
                          : passwordStrength.level === 'good' ? '75%'
                          : '100%',
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-sentinel-300">{passwordStrength.label}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-2">
                Confirm Password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sentinel-500 pointer-events-none" />
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
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sentinel-500 hover:text-sentinel-300 transition-colors"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <p className="mt-1.5 text-xs text-red-400">Passwords do not match</p>
              )}
              {confirmPassword.length > 0 && password === confirmPassword && (
                <p className="mt-1.5 text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle2 size={11} /> Passwords match
                </p>
              )}
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
              className="btn-glass-fire w-full py-3 rounded-lg font-semibold text-sm
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-sentinel-700 text-center">
            <p className="text-sm text-sentinel-300">
              Already have an account?{' '}
              <Link to="/login" className="text-fire-400 hover:text-fire-300 font-medium transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* Security note */}
        <div className="flex items-center justify-center gap-2 mt-6 text-sentinel-500 text-xs">
          <ShieldCheck size={13} />
          <span>Authorized personnel only</span>
        </div>

      </div>
    </div>
  );
}
