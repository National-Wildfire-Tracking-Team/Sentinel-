/**
 * AuthCallbackPage.jsx
 * Landing page for every link Supabase emails (see authEmail.js), on both
 * the app and reporter subdomains:
 *   - sign-up / email-change confirmation → "Email verified", continue
 *   - password recovery                   → choose a new password
 *   - expired / already-used link         → explain, offer a resend
 *
 * The Supabase client has already consumed the URL hash and signed the
 * visitor in by the time this renders; initialAuthRedirect is what that
 * hash said, captured before the client cleared it.
 */

import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  AlertCircle, CheckCircle2, Eye, EyeOff, Flame, KeyRound, Loader2,
} from 'lucide-react';

import { useAuth } from '../../shared/context/AuthContext';
import { initialAuthRedirect } from '../../shared/api/supabaseClient';
import ResendConfirmation from '../components/Auth/ResendConfirmation';

const inputBase =
  'w-full rounded-lg bg-sentinel-800 border border-sentinel-600 text-white placeholder-sentinel-500 ' +
  'focus:outline-none focus:border-fire-500 focus:ring-1 focus:ring-fire-500/40 transition-colors text-sm';

const primaryButton =
  'btn-glass-fire w-full py-3 rounded-lg font-semibold text-sm ' +
  'disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2';

function Shell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-sentinel-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-fire-600/10 border border-fire-600/30 flex items-center justify-center mb-4">
            <Flame size={28} className="text-fire-500" />
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight text-center">{title}</h1>
          {subtitle && <p className="text-sentinel-300 text-sm mt-1 text-center">{subtitle}</p>}
        </div>
        <div className="bg-sentinel-800 border border-sentinel-600 rounded-2xl p-8 shadow-2xl">
          {children}
        </div>
      </div>
    </div>
  );
}

function InvalidLink({ description, recovery }) {
  const [email, setEmail] = useState('');
  return (
    <Shell title="Link expired" subtitle="This link is invalid, expired, or was already used">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-sm">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{description || 'Email links can only be used once and expire after a while.'}</span>
        </div>
        {recovery ? (
          <Link to="/login" className={primaryButton}>Request a new reset link</Link>
        ) : (
          <>
            <p className="text-sentinel-300 text-sm">
              If you already confirmed your email, just sign in. Otherwise, enter your email to get a new confirmation link.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className={`${inputBase} px-3 py-2.5`}
            />
            <ResendConfirmation email={email} />
            <Link to="/login" className={primaryButton}>Go to Sign In</Link>
          </>
        )}
      </div>
    </Shell>
  );
}

function SetNewPassword() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await updatePassword(password);
      if (err) throw err;
      setDone(true);
    } catch (err) {
      setError(err?.message || 'Could not update your password');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Shell title="Password updated" subtitle="You're signed in with your new password">
        <div className="flex flex-col items-center gap-4">
          <CheckCircle2 size={36} className="text-green-400" />
          <Link to="/" className={primaryButton}>Continue</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password" subtitle="Enter a new password for your account">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="relative">
          <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sentinel-500" />
          <input
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            required
            className={`${inputBase} pl-9 pr-10 py-2.5`}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sentinel-400 hover:text-sentinel-200"
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <input
          type={show ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          autoComplete="new-password"
          required
          className={`${inputBase} px-3 py-2.5`}
        />
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-sm">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy && <Loader2 size={15} className="animate-spin" />}
          Update Password
        </button>
      </form>
    </Shell>
  );
}

export default function AuthCallbackPage() {
  const { session, loading } = useAuth();
  const redirect = initialAuthRedirect;

  if (!redirect) return <Navigate to="/" replace />;

  if (redirect.error) {
    return <InvalidLink description={redirect.errorDescription} recovery={redirect.type === 'recovery'} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sentinel-900">
        <Loader2 size={28} className="animate-spin text-fire-500" aria-label="Loading" />
      </div>
    );
  }

  // The hash looked valid but the client couldn't turn it into a session.
  if (!session) return <InvalidLink recovery={redirect.type === 'recovery'} />;

  if (redirect.type === 'recovery') return <SetNewPassword />;

  return (
    <Shell
      title={redirect.type === 'email_change' ? 'Email updated' : 'Email verified'}
      subtitle="Your account is active and you're signed in"
    >
      <div className="flex flex-col items-center gap-4">
        <CheckCircle2 size={36} className="text-green-400" />
        <p className="text-sentinel-300 text-sm text-center">
          Thanks for confirming <span className="text-white font-medium">{session.user?.email}</span>.
        </p>
        <Link to="/" className={primaryButton}>Continue</Link>
      </div>
    </Shell>
  );
}
