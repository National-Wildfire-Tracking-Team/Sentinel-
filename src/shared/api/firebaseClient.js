/**
 * firebaseClient.js
 * Shared Firebase client for the parts of the app that have moved off
 * Supabase onto Google Cloud — currently just the NEXRAD radar pipeline
 * (see src/app/api/nexradScans.js). Mirrors supabaseClient.js's pattern:
 * exported even when unconfigured so imports never crash, with calls
 * failing gracefully until env vars are provided.
 *
 * Env vars (add to .env):
 *   VITE_FIREBASE_API_KEY=...
 *   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
 *   VITE_FIREBASE_PROJECT_ID=your-project
 *   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
 *   VITE_FIREBASE_APP_ID=...
 * These are all public identifiers, not secrets (same publicity level as
 * Supabase's URL/anon key) — access control lives in Firestore Security
 * Rules and Firebase Auth, not in keeping this config private.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured = Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

if (!isFirebaseConfigured) {
  console.warn(
    '[Firebase] VITE_FIREBASE_* env vars are not set. ' +
    'NEXRAD radar data will be unavailable until you add them to .env.'
  );
}

// A placeholder apiKey/projectId still produces a working (if inert) SDK
// instance, same reasoning as supabaseClient.js's placeholder URL/key.
const app = initializeApp(
  isFirebaseConfigured ? FIREBASE_CONFIG : { ...FIREBASE_CONFIG, apiKey: 'placeholder', projectId: 'placeholder' }
);

export const db = getFirestore(app);
export const auth = getAuth(app);

let anonymousSignInPromise = null;

/**
 * Ensure the current browser session has a signed-in Firebase (anonymous)
 * user, returning that user's ID token. Used only to authenticate calls to
 * the nexrad-heartbeat Cloud Run service (see nexradScans.js) — entirely
 * separate from the app's real user accounts, which are still
 * Supabase-Auth-backed. Cached across calls within the session so repeated
 * heartbeats don't each trigger a new sign-in.
 */
export async function getAnonymousIdToken() {
  if (!isFirebaseConfigured) throw new Error('Firebase is not configured');
  if (!auth.currentUser) {
    anonymousSignInPromise ??= signInAnonymously(auth);
    await anonymousSignInPromise;
  }
  return auth.currentUser.getIdToken();
}
