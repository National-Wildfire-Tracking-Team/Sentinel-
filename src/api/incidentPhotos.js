/**
 * incidentPhotos.js
 * Uploads reporter-attached photos for an incident report or update to the
 * public "incident-photos" Storage bucket and resolves their public URLs.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';

const STORAGE_BUCKET = 'incident-photos';

export const MAX_PHOTOS_PER_POST = 6;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB, matches the bucket's file_size_limit

/** MIME types allowed by the incident-photos storage bucket. */
export const ALLOWED_PHOTO_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const ALLOWED_PHOTO_EXTENSIONS = Object.freeze([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
]);

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * True when the file's MIME type (preferred) or filename extension is an
 * allowed raster image. SVG / HTML / executable names are rejected.
 * @param {File|{ type?: string, name?: string }} file
 * @returns {boolean}
 */
export function isAllowedPhotoFile(file) {
  if (!file) return false;
  const mime = String(file.type || '').toLowerCase();
  if (ALLOWED_PHOTO_MIME_TYPES.includes(mime)) return true;
  const ext = String(file.name || '').split('.').pop()?.toLowerCase();
  return Boolean(ext && ALLOWED_PHOTO_EXTENSIONS.includes(ext) && !mime.startsWith('image/svg'));
}

/**
 * Resolve a safe storage extension from MIME type, falling back to a
 * whitelisted filename extension. Returns null if neither is allowed.
 * @param {File|{ type?: string, name?: string }} file
 * @returns {string|null}
 */
export function photoFileExtension(file) {
  const mime = String(file?.type || '').toLowerCase();
  if (MIME_TO_EXT[mime]) return MIME_TO_EXT[mime];
  const ext = String(file?.name || '').split('.').pop()?.toLowerCase();
  if (ext && ALLOWED_PHOTO_EXTENSIONS.includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  return null;
}

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
    if (!isAllowedPhotoFile(file)) {
      throw new Error('Only JPEG, PNG, WebP, and GIF photos are allowed.');
    }
    const ext = photoFileExtension(file);
    if (!ext) {
      throw new Error('Only JPEG, PNG, WebP, and GIF photos are allowed.');
    }
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
