/**
 * Approved reporter incidents (public.fire_reports), kept live over Supabase realtime like the
 * web's useFireReports('approved'): a reporter adding a fire or posting acreage / containment on
 * the dashboard updates the app within seconds.
 */
import { useEffect, useState } from 'react';

import type { FireReport } from '@/data/fireReports';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const COLUMNS = 'id, title, description, latitude, longitude, status, created_at, user_id';

export function useFireReports(): FireReport[] {
  const [reports, setReports] = useState<FireReport[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    supabase
      .from('fire_reports')
      .select(COLUMNS)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!cancelled && !error) setReports((data ?? []) as FireReport[]);
      });

    const channel = supabase
      .channel('fire_reports_approved')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fire_reports' }, payload => {
        const row = (payload.new && 'id' in payload.new ? payload.new : payload.old) as FireReport;
        if (!row?.id) return;
        setReports(prev => {
          if (payload.eventType === 'DELETE') return prev.filter(r => r.id !== row.id);
          const others = prev.filter(r => r.id !== row.id);
          // A report that's no longer approved drops out; an edit replaces the old row.
          if (row.status !== 'approved') return others;
          const existing = prev.find(r => r.id === row.id);
          return [{ ...existing, ...row }, ...others];
        });
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return reports;
}
