/**
 * ResendConfirmation.jsx
 * "Didn't get the email? Resend" control for unconfirmed sign-ups. Supabase
 * rate-limits resends to one per address per minute, so the button cools
 * down for that long after each send.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../../shared/context/AuthContext';

const COOLDOWN_SECONDS = 60;

export default function ResendConfirmation({ email, className = '' }) {
  const { resendConfirmation } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleResend() {
    const addr = (email || '').trim();
    if (!addr) {
      setError('Enter your email address first.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await resendConfirmation(addr);
      if (err) throw err;
      setSent(true);
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setError(err?.message || 'Could not resend the confirmation email.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`text-xs text-sentinel-400 ${className}`}>
      <span>{sent ? 'Sent — check your inbox. ' : "Didn't get the email? "}</span>
      <button
        type="button"
        onClick={handleResend}
        disabled={busy || cooldown > 0}
        className="inline-flex items-center gap-1 font-medium text-fire-400 hover:text-fire-300 disabled:text-sentinel-500 disabled:cursor-not-allowed transition-colors"
      >
        {busy && <Loader2 size={12} className="animate-spin" />}
        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend confirmation email'}
      </button>
      {error && <p className="mt-1 text-red-400">{error}</p>}
    </div>
  );
}
