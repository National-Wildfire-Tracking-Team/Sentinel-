import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { MapPin, Clock, Radio, Flame } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const STATUS_STYLES = {
  active:    { dot: 'bg-red-500 animate-pulse',    badge: 'bg-red-500/15 text-red-400 border-red-500/30',    label: 'Active' },
  contained: { dot: 'bg-yellow-500',                badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', label: 'Contained' },
  out:       { dot: 'bg-green-500',                 badge: 'bg-green-500/15 text-green-400 border-green-500/30',   label: 'Out' },
};

function IncidentCard({ incident }) {
  const style = STATUS_STYLES[incident.status] ?? STATUS_STYLES.active;
  const hasCoords = incident.latitude != null && incident.longitude != null;

  return (
    <div className="bg-sentinel-800 border border-sentinel-700 rounded-xl p-4 hover:border-sentinel-600 transition-colors animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-1 shrink-0">
            <div className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
          </div>
          <div className="min-w-0">
            <h3 className="text-white font-semibold text-sm leading-snug truncate">
              {incident.title}
            </h3>
            {incident.description && (
              <p className="text-sentinel-300 text-xs mt-1 line-clamp-2">
                {incident.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
              {(hasCoords || incident.address) && (
                <span className="flex items-center gap-1 text-sentinel-400 text-xs">
                  <MapPin size={11} />
                  {hasCoords
                    ? `${Number(incident.latitude).toFixed(4)}, ${Number(incident.longitude).toFixed(4)}`
                    : incident.address}
                </span>
              )}
              <span className="flex items-center gap-1 text-sentinel-400 text-xs">
                <Clock size={11} />
                {formatDistanceToNow(new Date(incident.created_at), { addSuffix: true })}
              </span>
              <span className="flex items-center gap-1 text-sentinel-400 text-xs">
                <Radio size={11} />
                reporter
              </span>
            </div>
          </div>
        </div>

        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${style.badge}`}>
          {style.label}
        </span>
      </div>
    </div>
  );
}

export default function IncidentList() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Initial fetch
    async function fetchIncidents() {
      const { data, error } = await supabase
        .from('incidents')
        .select('*')
        .eq('source', 'reporter')
        .order('created_at', { ascending: false });

      if (error) setError(error.message);
      else setIncidents(data ?? []);
      setLoading(false);
    }

    fetchIncidents();

    // Realtime subscription
    const channel = supabase
      .channel('reporter-incidents')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'incidents', filter: "source=eq.reporter" },
        (payload) => {
          setIncidents((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-sentinel-800 border border-sentinel-700 rounded-2xl p-6">
        <div className="text-sentinel-400 text-sm text-center py-8">Loading incidents…</div>
      </div>
    );
  }

  return (
    <div className="bg-sentinel-800 border border-sentinel-700 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Flame size={18} className="text-fire-500" />
          Reporter Incidents
        </h2>
        <span className="text-xs text-sentinel-400 bg-sentinel-700 px-2.5 py-1 rounded-full flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Live
        </span>
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {incidents.length === 0 ? (
        <div className="text-center py-12">
          <Flame size={32} className="text-sentinel-600 mx-auto mb-3" />
          <p className="text-sentinel-400 text-sm">No incidents reported yet.</p>
          <p className="text-sentinel-500 text-xs mt-1">Submit one using the form above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((incident) => (
            <IncidentCard key={incident.id} incident={incident} />
          ))}
        </div>
      )}
    </div>
  );
}
