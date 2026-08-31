/**
 * incidentPhotos.js
 * Uploads reporter-attached photos for an incident report or update to the
 * public "incident-photos" Storage bucket and resolves their public URLs.
 */

import { supabase, isSupabaseConfigured } from '../../shared/api/supabaseClient';

const STORAGE_BUCKET = 'incident-photos';

export const MAX_PHOTOS_PER_POST = 6;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB, matches the bucket's file_size_limit

/**
 * Upload a batch of image files for one incident and return their public URLs.
 * @param {File[]} files
 * @param {{ userId: string, incidentId: string }} opts
 * @returns {Promise<string[]>}
 */
export async function uploadIncidentPhotos(files, { userId, incidentId }) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  if (!files || files.length === 0) return [];

  const urls = [];
  for (const file of files) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${userId}/${incidentId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw error;

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}
