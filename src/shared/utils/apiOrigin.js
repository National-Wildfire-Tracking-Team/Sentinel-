/**
 * apiOrigin.js
 * On the web, the app's same-origin `/api/*` paths are proxied by Netlify
 * Edge Functions (production) or the Vite dev server (local dev) — see
 * netlify.toml / vite.config.js. Inside the Capacitor native shell there is
 * no such origin (the WebView serves the bundled dist/ from
 * capacitor://localhost or https://localhost), so those same relative paths
 * would 404. Native builds instead need an absolute prefix pointing at the
 * real production origin, which does have the Edge Functions and already
 * sends permissive CORS headers.
 */
import { Capacitor } from '@capacitor/core';

const PRODUCTION_APP_ORIGIN = 'https://app.nationalwildfiretrackingteam.org';

/**
 * Prefix for same-origin API paths: '' on web (unchanged relative-path
 * behavior), the production app origin when running inside Capacitor.
 */
export const API_ORIGIN = Capacitor.isNativePlatform() ? PRODUCTION_APP_ORIGIN : '';
