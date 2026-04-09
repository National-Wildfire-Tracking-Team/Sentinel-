import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import AuthForm from '../components/Reporter/AuthForm';
import IncidentForm from '../components/Reporter/IncidentForm';
import IncidentList from '../components/Reporter/IncidentList';
import { LogOut, User } from 'lucide-react';

export default function ReporterPage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-sentinel-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <AuthForm />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Reporter Portal</h1>
          <p className="text-sentinel-300 text-sm mt-0.5">Submit and monitor wildfire incidents in real time.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-sentinel-400 bg-sentinel-800 border border-sentinel-700 px-3 py-1.5 rounded-full">
            <User size={12} />
            {session.user.email}
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-sentinel-300 hover:text-white bg-sentinel-800 hover:bg-sentinel-700 border border-sentinel-700 px-3 py-1.5 rounded-full transition-colors"
          >
            <LogOut size={12} />
            Log out
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="mb-6">
        <IncidentForm userId={session.user.id} />
      </div>

      {/* List */}
      <IncidentList />
    </div>
  );
}
