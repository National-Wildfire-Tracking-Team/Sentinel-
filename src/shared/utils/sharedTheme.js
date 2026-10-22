/**
 * sharedTheme.js
 * Light or dark for the whole site — the tracker app (app.* subdomain), the
 * reporter site and the marketing site on the bare domain. It follows the
 * device's light/dark setting unless someone picks Light or Dark in the
 * tracker app's menu. Only that pick is stored: localStorage is per-origin,
 * so it's mirrored into a cookie scoped to the parent domain, which every
 * subdomain can read. index.html repeats the read inline to apply the theme
 * before first paint.
 *
 * The key was renamed from 'nwtt-theme' when the site started following the
 * device: the old one was written for every visitor, chosen or not, so it's
 * ignored and everyone starts on Auto.
 */

export const THEME_KEY = 'nwtt-appearance';

const KNOWN_SUBDOMAIN_PREFIXES = ['app.', 'reporter.'];
const ONE_YEAR = 60 * 60 * 24 * 365;
const LIGHT_QUERY = '(prefers-color-scheme: light)';

// Browser bar colour (meta theme-color) for each theme: the page header's background.
const THEME_COLORS = { light: '#ffffff', dark: '#0a0c0e' };

function parseTheme(value) {
  return value === 'light' || value === 'dark' ? value : null;
}

/** Cookie domain shared by the bare host and its subdomains, or null on hosts like localhost. */
function sharedCookieDomain() {
  const { hostname } = window.location;
  const prefix = KNOWN_SUBDOMAIN_PREFIXES.find((p) => hostname.startsWith(p));
  const base = prefix ? hostname.slice(prefix.length) : hostname;
  // Browsers refuse a Domain attribute without a dot (localhost), so fall back
  // to a host-only cookie there; the per-origin localStorage still applies.
  return base.includes('.') ? base : null;
}

/** The theme picked by hand ('light' | 'dark'), or null to follow the device. */
export function readSharedTheme() {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_KEY}=([^;]*)`));
    const fromCookie = parseTheme(match && decodeURIComponent(match[1]));
    if (fromCookie) return fromCookie;
  } catch {
    // cookies unavailable — fall through to localStorage
  }
  try {
    return parseTheme(window.localStorage.getItem(THEME_KEY));
  } catch {
    return null;
  }
}

/** Stores a hand-picked 'light' or 'dark'; anything else (Auto) clears it. */
export function writeSharedTheme(theme) {
  const value = parseTheme(theme);
  try {
    if (value) window.localStorage.setItem(THEME_KEY, value);
    else window.localStorage.removeItem(THEME_KEY);
  } catch {
    // localStorage unavailable — the cookie below still carries it
  }
  try {
    const domain = sharedCookieDomain();
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      `${THEME_KEY}=${value ?? ''}; Path=/; Max-Age=${value ? ONE_YEAR : 0}; SameSite=Lax` +
      (domain ? `; Domain=${domain}` : '') +
      secure;
  } catch {
    // cookies unavailable — theme still applies on this origin
  }
}

/** The device's setting; dark when it states none (the site's original look). */
export function deviceTheme() {
  try {
    return window.matchMedia?.(LIGHT_QUERY).matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Calls onChange('light' | 'dark') whenever the device's setting changes; returns the unsubscribe. */
export function watchDeviceTheme(onChange) {
  const query = typeof window !== 'undefined' ? window.matchMedia?.(LIGHT_QUERY) : null;
  if (!query) return () => {};
  const handle = () => onChange(deviceTheme());
  query.addEventListener('change', handle);
  return () => query.removeEventListener('change', handle);
}

/** The theme in effect: the hand-picked one, else the device's. */
export function resolveSharedTheme() {
  return readSharedTheme() ?? deviceTheme();
}

/** Toggles Tailwind's `dark` class on <html> and matches the browser bar to it. */
export function applyThemeClass(theme) {
  const resolved = theme === 'light' ? 'light' : 'dark';
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
}
