// Subdomains this app splits its three route trees across (see main.jsx) —
// used to find the bare/marketing hostname underneath whichever one the
// visitor is currently on, so building a *different* subdomain's origin
// prepends onto that bare host instead of onto the current one.
const KNOWN_SUBDOMAIN_PREFIXES = ['app.', 'reporter.'];

function baseHostname(hostname) {
  const prefix = KNOWN_SUBDOMAIN_PREFIXES.find((p) => hostname.startsWith(p));
  return prefix ? hostname.slice(prefix.length) : hostname;
}

function withSubdomain(prefix, hostname) {
  return hostname === 'localhost' ? `${prefix}localhost` : `${prefix}${hostname}`;
}

/**
 * Resolves the origin of the tracker app subdomain from the current hostname,
 * so cross-subdomain links work in production (app.nationalwildfiretrackingteam.org)
 * and in local dev (app.localhost) without hardcoding one or the other.
 */
export function getAppOrigin() {
  const { protocol, hostname, port } = window.location;
  if (hostname.startsWith('app.')) return window.location.origin;
  const appHostname = withSubdomain('app.', baseHostname(hostname));
  return `${protocol}//${appHostname}${port ? `:${port}` : ''}`;
}

/**
 * The inverse of getAppOrigin(): resolves the origin of the marketing site
 * from the current hostname. Used by app-side links to marketing-only pages
 * (About, Pricing, ...), which don't exist on the app router.
 */
export function getMainOrigin() {
  const { protocol, hostname, port } = window.location;
  const mainHostname = baseHostname(hostname);
  if (mainHostname === hostname) return window.location.origin;
  return `${protocol}//${mainHostname}${port ? `:${port}` : ''}`;
}

/**
 * Resolves the origin of the reporter portal subdomain from the current
 * hostname, so links/redirects between it and the other subdomains work in
 * production (reporter.nationalwildfiretrackingteam.org) and in local dev
 * (reporter.localhost) without hardcoding one or the other.
 */
export function getReporterOrigin() {
  const { protocol, hostname, port } = window.location;
  if (hostname.startsWith('reporter.')) return window.location.origin;
  const reporterHostname = withSubdomain('reporter.', baseHostname(hostname));
  return `${protocol}//${reporterHostname}${port ? `:${port}` : ''}`;
}
