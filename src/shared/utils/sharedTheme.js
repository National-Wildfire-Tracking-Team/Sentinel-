/**
 * sharedTheme.js
 * The light/dark choice made in the tracker app (app.* subdomain) also drives
 * the marketing site on the bare domain. localStorage is per-origin, so the
 * choice is mirrored into a cookie scoped to the parent domain, which every
 * subdomain can read. index.html repeats the read inline to apply it before
 * first paint.
 */

export const THEME_KEY = 'nwtt-theme';

const KNOWN_SUBDOMAIN_PREFIXES = ['app.', 'reporter.'];
const ONE_YEAR = 60 * 60 * 24 * 365;

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

export function writeSharedTheme(theme) {
  const value = parseTheme(theme);
  if (!value) return;
  try {
    window.localStorage.setItem(THEME_KEY, value);
  } catch {
    // localStorage unavailable — the cookie below still carries it
  }
  try {
    const domain = sharedCookieDomain();
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      `${THEME_KEY}=${value}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax` +
      (domain ? `; Domain=${domain}` : '') +
      secure;
  } catch {
    // cookies unavailable — theme still applies on this origin
  }
}

/** Toggles Tailwind's `dark` class on <html>; dark stays the default. */
export function applyThemeClass(theme) {
  document.documentElement.classList.toggle('dark', theme !== 'light');
}
