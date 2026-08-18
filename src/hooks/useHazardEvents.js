/**
 * useHazardEvents.js
 * Hooks for reading and subscribing to community-submitted hazard events
 * (wildfire, flooding, hazmat, other) stored in Supabase. Uses realtime
 * subscriptions so new/updated events appear on the map instantly.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../api/supabaseClient';

export const HAZARD_CATEGORIES = ['wildfire', 'flooding', 'hazmat', 'other'];

/**
 * Subscribes to hazard events matching a given status filter.
 * @param {'active'|'resolved'|'all'} status
 * @returns {{ events, loading, error, refresh }}
 */
export function useHazardEvents(status = 'active') {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = supabase
      .from('hazard_events')
      .select('id, category, title, description, severity, latitude, longitude, status, created_at, user_id')
      .order('created_at', { ascending: false });

    if (status !== 'all') q = q.eq('status', status);

    const { data, error: err } = await q;
    if (err) {
      setError(err);
      setEvents([]);
    } else {
      setError(null);
      setEvents(data || []);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription – listen for any change and re-filter locally
  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    const channel = supabase
      .channel(`hazard_events_${status}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hazard_events' },
        (payload) => {
          setEvents(prev => {
            const row = payload.new || payload.old;
            if (!row) return prev;

            const matches = (r) => status === 'all' || r.status === status;

            if (payload.eventType === 'DELETE') {
              return prev.filter(e => e.id !== row.id);
            }
            if (payload.eventType === 'INSERT') {
              if (!matches(row)) return prev;
              if (prev.some(e => e.id === row.id)) return prev;
              return [row, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              const existed = prev.some(e => e.id === row.id);
              if (matches(row)) {
                return existed
                  ? prev.map(e => (e.id === row.id ? { ...e, ...row } : e))
                  : [row, ...prev];
              }
              return prev.filter(e => e.id !== row.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [status]);

  return { events, loading, error, refresh: load };
}

/** Convert a list of hazard_events rows into a GeoJSON FeatureCollection. */
export function hazardEventsToGeoJSON(events) {
  return {
    type: 'FeatureCollection',
    features: (events || [])
      .filter(e => Number.isFinite(Number(e.latitude)) && Number.isFinite(Number(e.longitude)))
      .map(e => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [Number(e.longitude), Number(e.latitude)],
        },
        properties: {
          id:          e.id,
          category:    e.category,
          title:       e.title,
          description: e.description,
          severity:    e.severity,
          status:      e.status,
          created_at:  e.created_at,
          user_id:     e.user_id,
        },
      })),
  };
}

/** Submit a new hazard event (reporter or admin). */
export async function submitHazardEvent({ category, title, description, severity, latitude, longitude, userId }) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  if (!HAZARD_CATEGORIES.includes(category)) throw new Error(`Invalid category: ${category}`);

  const { data, error } = await supabase
    .from('hazard_events')
    .insert({
      category,
      title,
      description: description || '',
      severity: severity || 'moderate',
      latitude,
      longitude,
      status: 'active',
      user_id: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Edit the core fields of an existing hazard event (own, or admin). */
export async function updateHazardEvent(id, { category, title, description, severity, latitude, longitude, status }) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

  const updates = {};
  if (category    !== undefined) updates.category    = category;
  if (title       !== undefined) updates.title       = title;
  if (description !== undefined) updates.description = description;
  if (severity    !== undefined) updates.severity    = severity;
  if (latitude    !== undefined) updates.latitude    = latitude;
  if (longitude   !== undefined) updates.longitude   = longitude;
  if (status      !== undefined) updates.status      = status;

  if (Object.keys(updates).length === 0) {
    throw new Error('No fields to update.');
  }

  const { data, error } = await supabase
    .from('hazard_events')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Delete a hazard event (own, or admin). */
export async function deleteHazardEvent(id) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { error } = await supabase
    .from('hazard_events')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return { id };
}
