import { useState } from 'react';
import { Eye, EyeOff, Flame, X, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function LoginModal({ onClose, onLoginSuccess }) {
  const { signIn, signUp, isSupabaseConfigured } = useAuth();

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError('');
    setLoading(true);
    try {
      const { error: err } = await signIn(email.trim(), password, true);
      if (err) throw err;
      onLoginSuccess?.();
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data, error: err } = await signUp(email.trim(), password);
      if (err) throw err;
      if (data?.session) {
        onLoginSuccess?.();
      } else {
        setMode('login');
      }
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 p-1.5 rounded-full bg-sentinel-700 hover:bg-sentinel-600 text-sentinel-300 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="rounded-2xl border border-sentinel-600 bg-sentinel-900 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 text-center border-b border-sentinel-700/50">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="relative">
                <Flame size={28} className="text-fire-500" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-fire-500 rounded-full animate-pulse" />
              </div>
              <span className="text-2xl font-bold text-white tracking-tight">
                Sentinel
                <span className="text-[0.45em] font-bold tracking-wider text-fire-400 align-super ml-0.5">BETA</span>
              </span>
            </div>
            <p className="text-sentinel-400 text-sm">All Hazard Intelligence Platform</p>
          </div>

          {/* Body */}
          <div className="px-8 py-6">
            {!isSupabaseConfigured && (
              <div className="mb-4 rounded-lg border border-yellow-600/40 bg-yellow-950/40 px-3 py-2 text-xs text-yellow-300">
                Authentication is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable.
              </div>
            )}

            <>
                <h2 className="text-lg font-semibold text-white mb-5 text-center">
                  {mode === 'login' ? 'Sign in to your account' : 'Create an account'}
                </h2>

                <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-sentinel-300 mb-1.5">
                      Email / Username
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                      className="w-full rounded-lg border border-sentinel-600 bg-sentinel-800 px-3 py-2.5 text-sm text-white placeholder-sentinel-500 focus:outline-none focus:border-fire-500 focus:ring-1 focus:ring-fire-500/40 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-sentinel-300 mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        required
                        className="w-full rounded-lg border border-sentinel-600 bg-sentinel-800 px-3 py-2.5 pr-10 text-sm text-white placeholder-sentinel-500 focus:outline-none focus:border-fire-500 focus:ring-1 focus:ring-fire-500/40 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-sentinel-400 hover:text-sentinel-200 transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {mode === 'register' && (
                    <div>
                      <label className="block text-xs font-medium text-sentinel-300 mb-1.5">
                        Confirm Password
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        required
                        className="w-full rounded-lg border border-sentinel-600 bg-sentinel-800 px-3 py-2.5 text-sm text-white placeholder-sentinel-500 focus:outline-none focus:border-fire-500 focus:ring-1 focus:ring-fire-500/40 transition-colors"
                      />
                    </div>
                  )}

                  {error && (
                    <p className="text-xs text-red-400 bg-red-950/40 border border-red-600/40 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !isSupabaseConfigured}
                    className="w-full rounded-lg bg-fire-600 hover:bg-fire-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 size={15} className="animate-spin" />}
                    {mode === 'login' ? 'Sign In' : 'Create Account'}
                  </button>
                </form>

                <div className="mt-5 text-center text-sm text-sentinel-400">
                  {mode === 'login' ? (
                    <>
                      Don&apos;t have an account?{' '}
                      <button
                        onClick={() => { setMode('register'); setError(''); }}
                        className="text-fire-400 hover:text-fire-300 font-medium transition-colors"
                      >
                        Create Account
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{' '}
                      <button
                        onClick={() => { setMode('login'); setError(''); }}
                        className="text-fire-400 hover:text-fire-300 font-medium transition-colors"
                      >
                        Sign In
                      </button>
                    </>
                  )}
                </div>
              </>
          </div>
        </div>
      </div>
    </div>
  );
}
