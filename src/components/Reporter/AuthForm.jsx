import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Flame, LogIn, UserPlus, AlertCircle } from 'lucide-react';

export default function AuthForm() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMessage('Check your email to confirm your account, then log in.');
    }

    setLoading(false);
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-fire-600/15 border border-fire-600/30 mb-4">
            <Flame size={28} className="text-fire-500" />
          </div>
          <h1 className="text-2xl font-bold text-white">Reporter Portal</h1>
          <p className="text-sentinel-300 text-sm mt-1">
            Submit and track wildfire incidents
          </p>
        </div>

        {/* Card */}
        <div className="bg-sentinel-800 border border-sentinel-700 rounded-2xl p-8">
          {/* Mode toggle */}
          <div className="flex rounded-xl bg-sentinel-700 p-1 mb-6">
            <button
              onClick={() => { setMode('login'); setError(''); setMessage(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'login'
                  ? 'bg-sentinel-600 text-white shadow'
                  : 'text-sentinel-300 hover:text-white'
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); setMessage(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'signup'
                  ? 'bg-sentinel-600 text-white shadow'
                  : 'text-sentinel-300 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-sentinel-200 mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="reporter@example.com"
                className="w-full px-4 py-2.5 rounded-xl bg-sentinel-700 border border-sentinel-600 text-white placeholder-sentinel-400 focus:outline-none focus:border-fire-500 transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-sentinel-200 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl bg-sentinel-700 border border-sentinel-600 text-white placeholder-sentinel-400 focus:outline-none focus:border-fire-500 transition-colors text-sm"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            {message && (
              <div className="text-green-400 text-sm bg-green-400/10 border border-green-400/20 rounded-xl px-4 py-3">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-fire-600 hover:bg-fire-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors mt-2"
            >
              {mode === 'login'
                ? <><LogIn size={16} /> {loading ? 'Logging in…' : 'Log In'}</>
                : <><UserPlus size={16} /> {loading ? 'Creating account…' : 'Create Account'}</>
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
