/**
 * useVolunteer.js
 * Volunteer profile management and deployment sign-up actions for the
 * disaster-response program. A user "is a volunteer" simply by having a
 * volunteer_profiles row — there is no separate account role for it.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../shared/api/supabaseClient';

/** Load (and refresh) the signed-in user's volunteer profile, if any. */
export function useVolunteerProfile(userId) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('volunteer_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (err) {
      setError(err);
      setProfile(null);
    } else {
      setError(null);
      setProfile(data);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return { profile, loading, error, refresh: load };
}

/** Create or update the signed-in user's volunteer profile. */
export async function saveVolunteerProfile(userId, fields) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { data, error } = await supabase
    .from('volunteer_profiles')
    .upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** List the signed-in user's deployment sign-ups, with deployment details joined in. */
export function useMySignups(userId) {
  const [signups, setSignups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !userId) {
      setSignups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('deployment_signups')
      .select(
        'id, role_interest, notes, created_at, ' +
        'deployment:deployments(id, title, hazard_type, location, start_date, start_time, status)'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (err) {
      setError(err);
      setSignups([]);
    } else {
      setError(null);
      setSignups(data || []);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return { signups, loading, error, refresh: load };
}

/** Sign the current user up for a deployment. Requires a volunteer profile to already exist. */
export async function signUpForDeployment({ deploymentId, userId, roleInterest = '', notes = '' }) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { data, error } = await supabase
    .from('deployment_signups')
    .insert({ deployment_id: deploymentId, user_id: userId, role_interest: roleInterest, notes })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

/** Cancel one of the current user's deployment sign-ups. */
export async function cancelDeploymentSignup(signupId) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { error } = await supabase.from('deployment_signups').delete().eq('id', signupId);
  if (error) throw error;
  return { id: signupId };
}
