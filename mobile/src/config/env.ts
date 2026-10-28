/**
 * Public client configuration. Expo inlines EXPO_PUBLIC_* values from mobile/.env.local (gitignored;
 * see .env.example) at bundle time. Only publishable keys belong here.
 */
export const ENV = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '',
  /** Sentinel's AWS data-services CloudFront distribution (infra/aws). */
  dataServicesUrl: (process.env.EXPO_PUBLIC_DATA_SERVICES_URL ?? 'https://d17msnxo4ql3yx.cloudfront.net').replace(
    /\/+$/,
    '',
  ),
};

export const isSupabaseConfigured = Boolean(ENV.supabaseUrl && ENV.supabaseAnonKey);
export const isMapboxConfigured = ENV.mapboxToken.startsWith('pk.');

/** Production web app, used for "open on web" links (same routes as src/app/router.jsx). */
export const WEB_APP_URL = 'https://app.nationalwildfiretrackingteam.org';

/**
 * The web app's same-origin data proxies (netlify.toml /api/* routes). The app uses them, rather
 * than each upstream directly, to share their caching and request shaping with the website.
 */
export const WEB_API_URL = `${WEB_APP_URL}/api`;

/** Same default as the web app's VITE_REFRESH_INTERVAL. */
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
