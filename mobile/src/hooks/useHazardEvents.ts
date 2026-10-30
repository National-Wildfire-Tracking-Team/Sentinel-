/**
 * Active reporter event reports (public.hazard_events: wildfire, hazmat, hazard, flooding), kept
 * live over realtime like the web's useHazardEvents('active'). The web shows them on every tab.
 */
import { useEffect, useMemo, useState } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

interface HazardEvent {
  id: string;
  category: string;
  title: string;
  description: string | null;
  severity: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  status: string;
  created_at: string;
}

const COLUMNS = 'id, category, title, description, severity, latitude, longitude, status, created_at';

export const HAZARD_CATEGORY_LABELS: Record<string, string> = {
  wildfire: 'Wildfire',
  hazmat: 'Hazmat',
  hazard: 'Hazard',
  flooding: 'Flooding',
};

/** Legacy 'other' is now 'hazard' (useHazardEvents.js normalizeHazardCategory). */
const normalizeCategory = (c: string) => (c === 'other' ? 'hazard' : c);

export function useHazardEvents(): GeoJSON.FeatureCollection {
  const [events, setEvents] = useState<HazardEvent[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    supabase
      .from('hazard_events')
      .select(COLUMNS)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!cancelled && !error) setEvents((data ?? []) as HazardEvent[]);
      });

    const channel = supabase
      .channel('hazard_events_active')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hazard_events' }, payload => {
        const row = (payload.new && 'id' in payload.new ? payload.new : payload.old) as HazardEvent;
        if (!row?.id) return;
        setEvents(prev => {
          const others = prev.filter(e => e.id !== row.id);
          if (payload.eventType === 'DELETE' || row.status !== 'active') return others;
          return [{ ...prev.find(e => e.id === row.id), ...row }, ...others];
        });
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return useMemo(
    () => ({
      type: 'FeatureCollection',
      features: events
        .filter(e => Number.isFinite(Number(e.latitude)) && Number.isFinite(Number(e.longitude)))
        .map(e => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [Number(e.longitude), Number(e.latitude)] },
          properties: {
            id: e.id,
            category: normalizeCategory(e.category),
            title: e.title,
            description: e.description,
            severity: e.severity,
            created_at: e.created_at,
          },
        })),
    }),
    [events],
  );
}
