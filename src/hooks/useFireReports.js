/**
 * useFireReports.js
 * Hooks for reading and subscribing to community-submitted fire reports
 * stored in Supabase. Uses realtime subscriptions so approved reports
 * appear on the map the instant an admin approves them.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../api/supabaseClient';

/**
 * Subscribes to reports matching a given status filter.
 * @param {'approved'|'pending'|'rejected'|'all'} status
 * @returns {{ reports, loading, error, refresh }}
 */
export function useFireReports(status = 'approved') {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setReports([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = supabase
      .from('fire_reports')
      .select('id, title, description, latitude, longitude, status, created_at, user_id')
      .order('created_at', { ascending: false });

    if (status !== 'all') q = q.eq('status', status);

    const { data, error: err } = await q;
    if (err) {
      setError(err);
      setReports([]);
    } else {
      setError(null);
      setReports(data || []);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription – listen for any change and re-filter locally
  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    const channel = supabase
      .channel(`fire_reports_${status}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fire_reports' },
        (payload) => {
          setReports(prev => {
            const row = payload.new || payload.old;
            if (!row) return prev;

            const matches = (r) => status === 'all' || r.status === status;

            if (payload.eventType === 'DELETE') {
              return prev.filter(r => r.id !== row.id);
            }
            if (payload.eventType === 'INSERT') {
              if (!matches(row)) return prev;
              if (prev.some(r => r.id === row.id)) return prev;
              return [row, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              const existed = prev.some(r => r.id === row.id);
              if (matches(row)) {
                return existed
                  ? prev.map(r => (r.id === row.id ? { ...r, ...row } : r))
                  : [row, ...prev];
              }
              // no longer matches → drop it
              return prev.filter(r => r.id !== row.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [status]);

  return { reports, loading, error, refresh: load };
}

/** Convert a list of fire_reports rows into a GeoJSON FeatureCollection. */
export function reportsToGeoJSON(reports) {
  return {
    type: 'FeatureCollection',
    features: (reports || [])
      .filter(r => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)))
      .map(r => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [Number(r.longitude), Number(r.latitude)],
        },
        properties: {
          id:          r.id,
          title:       r.title,
          description: r.description,
          status:      r.status,
          created_at:  r.created_at,
          user_id:     r.user_id,
        },
      })),
  };
}

/** Submit a new report as approved (no reporter moderation queue). */
export async function submitFireReport({ title, description, latitude, longitude, userId }) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured');
  }
  const { error } = await supabase
    .from('fire_reports')
    .insert({
      title,
      description,
      latitude,
      longitude,
      status: 'approved',
      user_id: userId,
    });
  if (error) throw error;
  return { title, description, latitude, longitude, status: 'approved', user_id: userId };
}

/** Admin action: set the status of a report. */
export async function setReportStatus(id, status) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { error } = await supabase
    .from('fire_reports')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
  return { id, status };
}

/**
 * Reporter action: create a new fire_reports entry tracking an NIFC-sourced fire.
 * Called when a reporter posts the first community update for a fire that only
 * exists in the NIFC/IRWIN feeds (not yet in our database).
 */
export async function createNIFCFireUpdate({
  fireName, latitude, longitude, userId, acreage, notes, nifcId,
}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

  const acreageLine = acreage?.toString().trim()
    ? `Acreage: ${acreage.toString().trim()}`
    : null;
  const noteLine = notes?.trim() ? `Notes: ${notes.trim()}` : null;

  if (!acreageLine && !noteLine) {
    throw new Error('Please provide acreage or notes for the update.');
  }

  const timestamp = new Date().toLocaleString();
  const description = [
    `SOURCE: NIFC${nifcId ? ` (${nifcId})` : ''}`,
    '',
    `UPDATE (${timestamp})`,
    acreageLine,
    noteLine,
  ].filter((line) => line !== null).join('\n');

  const { error } = await supabase
    .from('fire_reports')
    .insert({
      title: fireName,
      description,
      latitude,
      longitude,
      status: 'approved',
      user_id: userId,
    });

  if (error) throw error;
  return {
    title: fireName,
    description,
    latitude,
    longitude,
    status: 'approved',
    user_id: userId,
  };
}

/** Reporter action: append an operational update (acreage/notes) to a report. */
export async function appendFireReportUpdate({ id, description, acreage, notes }) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

  const acreageLine = acreage?.toString().trim()
    ? `Acreage: ${acreage.toString().trim()}`
    : null;
  const noteLine = notes?.trim() ? `Notes: ${notes.trim()}` : null;

  if (!acreageLine && !noteLine) {
    throw new Error('Please provide acreage or notes for the update.');
  }

  const timestamp = new Date().toLocaleString();
  const updateBlock = [
    `UPDATE (${timestamp})`,
    acreageLine,
    noteLine,
  ].filter(Boolean).join('\n');

  const nextDescription = `${description}\n\n${updateBlock}`;

  const { error } = await supabase
    .from('fire_reports')
    .update({ description: nextDescription })
    .eq('id', id);

  if (error) throw error;
  return { id, description: nextDescription };
}
