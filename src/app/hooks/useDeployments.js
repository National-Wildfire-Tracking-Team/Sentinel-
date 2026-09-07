/**
 * useDeployments.js
 * Reading and (admin) managing the disaster-response deployments board.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../shared/api/supabaseClient';

const DEPLOYMENT_COLUMNS =
  'id, title, hazard_type, description, location, start_date, start_time, end_date, capacity, status, created_at';

/** List deployments, optionally filtered by status ('all' = no filter). */
export function useDeployments(status = 'upcoming') {
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setDeployments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = supabase
      .from('deployments')
      .select(DEPLOYMENT_COLUMNS)
      .order('start_date', { ascending: true });

    if (status !== 'all') q = q.eq('status', status);

    const { data, error: err } = await q;
    if (err) {
      setError(err);
      setDeployments([]);
    } else {
      setError(null);
      setDeployments(data || []);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  return { deployments, loading, error, refresh: load };
}

/** Admin action: create a new deployment. */
export async function createDeployment(fields) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { data, error } = await supabase
    .from('deployments')
    .insert(fields)
    .select(DEPLOYMENT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/** Admin action: update a deployment's fields (title, dates, status, etc). */
export async function updateDeployment(id, fields) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { error } = await supabase.from('deployments').update(fields).eq('id', id);
  if (error) throw error;
  return { id, ...fields };
}

/** Admin action: permanently delete a deployment. */
export async function deleteDeployment(id) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { error } = await supabase.from('deployments').delete().eq('id', id);
  if (error) throw error;
  return { id };
}

/** Admin action: list every sign-up for a deployment, with volunteer contact info. */
export async function getDeploymentSignups(deploymentId) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { data, error } = await supabase
    .from('deployment_signups')
    .select('id, role_interest, notes, created_at, user_id, volunteer_profiles(full_name, phone)')
    .eq('deployment_id', deploymentId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}
