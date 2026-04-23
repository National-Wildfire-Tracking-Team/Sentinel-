/**
 * useReporterEvacZones.js
 * Hooks and helpers for reporter-drawn evacuation zones stored in Supabase.
 * Active zones are readable by everyone (public map); CRUD requires reporter/admin role.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../api/supabaseClient';

const TABLE = 'reporter_evac_zones';

/**
 * Fetch reporter-drawn evac zones.
 * @param {'active'|'all'} status
 *   'active'  → only zones in status='active' (public map view)
 *   'all'     → all zones belonging to the current user (dashboard view)
 */
export function useReporterEvacZones(status = 'active') {
  const [zones, setZones]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setZones([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    let q = supabase
      .from(TABLE)
      .select('id, user_id, title, description, zone_type, geometry, incident_name, county, state, status, effective_at, expires_at, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (status !== 'all') q = q.eq('status', status);

    const { data, error: err } = await q;
    if (err) {
      setError(err);
      setZones([]);
    } else {
      setError(null);
      setZones(data || []);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  // Realtime: re-apply local filter on any change
  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    const channel = supabase
      .channel(`reporter_evac_zones_${status}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE },
        (payload) => {
          setZones((prev) => {
            const row = payload.new || payload.old;
            if (!row) return prev;
            const matches = (z) => status === 'all' || z.status === status;

            if (payload.eventType === 'DELETE') {
              return prev.filter((z) => z.id !== row.id);
            }
            if (payload.eventType === 'INSERT') {
              if (!matches(row)) return prev;
              if (prev.some((z) => z.id === row.id)) return prev;
              return [row, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              const existed = prev.some((z) => z.id === row.id);
              if (matches(row)) {
                return existed
                  ? prev.map((z) => (z.id === row.id ? { ...z, ...row } : z))
                  : [row, ...prev];
              }
              return prev.filter((z) => z.id !== row.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [status]);

  return { zones, loading, error, refresh: load };
}

/**
 * Convert a list of reporter_evac_zones rows to a GeoJSON FeatureCollection.
 * Each row's `geometry` field is already a GeoJSON Polygon/MultiPolygon object.
 */
export function reporterEvacZonesToGeoJSON(zones) {
  const features = (zones || []).flatMap((zone) => {
    if (!zone.geometry || !zone.geometry.type) return [];
    return [{
      type: 'Feature',
      geometry: zone.geometry,
      properties: {
        id:            zone.id,
        title:         zone.title,
        description:   zone.description,
        zone_type:     zone.zone_type,
        incident_name: zone.incident_name,
        county:        zone.county,
        state:         zone.state,
        status:        zone.status,
        effective_at:  zone.effective_at,
        expires_at:    zone.expires_at,
        created_at:    zone.created_at,
        user_id:       zone.user_id,
        source:        'reporter',
      },
    }];
  });
  return { type: 'FeatureCollection', features };
}

/** Create a new reporter-drawn evac zone. */
export async function createReporterEvacZone({
  userId, title, description, zoneType, geometry, incidentName, county, state, expiresAt,
}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id:       userId,
      title:         title.trim(),
      description:   description?.trim() ?? '',
      zone_type:     zoneType,
      geometry,
      incident_name: incidentName?.trim() || null,
      county:        county?.trim() || null,
      state:         state?.trim() || null,
      expires_at:    expiresAt || null,
      status:        'active',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Update metadata for an existing zone (no geometry change). */
export async function updateReporterEvacZone(id, fields) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

  const allowed = ['title', 'description', 'zone_type', 'incident_name', 'county', 'state', 'expires_at', 'status', 'geometry'];
  const updates = {};
  for (const key of allowed) {
    if (key in fields) updates[key] = fields[key];
  }
  if (Object.keys(updates).length === 0) throw new Error('No fields to update.');

  const { error } = await supabase.from(TABLE).update(updates).eq('id', id);
  if (error) throw error;
  return { id, ...updates };
}

/** Lift (deactivate) a zone. */
export async function liftReporterEvacZone(id) {
  return updateReporterEvacZone(id, { status: 'lifted' });
}

/** Delete a reporter-drawn evac zone permanently. */
export async function deleteReporterEvacZone(id) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
  return { id };
}
