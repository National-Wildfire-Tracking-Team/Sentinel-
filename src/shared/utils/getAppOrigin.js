/**
 * Resolves the origin of the tracker app subdomain from the current hostname,
 * so cross-subdomain links work in production (app.nationalwildfiretrackingteam.org)
 * and in local dev (app.localhost) without hardcoding one or the other.
 */
export function getAppOrigin() {
  const { protocol, hostname, port } = window.location;
  if (hostname.startsWith('app.')) return window.location.origin;
  const appHostname = hostname === 'localhost' ? 'app.localhost' : `app.${hostname}`;
  return `${protocol}//${appHostname}${port ? `:${port}` : ''}`;
}

/**
 * The inverse of getAppOrigin(): resolves the origin of the marketing site
 * from the current hostname. Used by app-side links to marketing-only pages
 * (About, Pricing, ...), which don't exist on the app router.
 */
export function getMainOrigin() {
  const { protocol, hostname, port } = window.location;
  if (!hostname.startsWith('app.')) return window.location.origin;
  const mainHostname = hostname.slice('app.'.length);
  return `${protocol}//${mainHostname}${port ? `:${port}` : ''}`;
}
