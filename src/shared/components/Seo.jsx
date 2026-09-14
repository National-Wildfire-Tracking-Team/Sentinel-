import { useEffect } from 'react';

function setMetaTag(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!content) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLinkTag(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Sets per-route document title, meta description, canonical URL, robots
 * directive, and Open Graph tags. This app is a client-rendered SPA with no
 * server-side rendering, so per-page <head> metadata has to be applied this
 * way (on mount/route change) instead of via static HTML — Googlebot renders
 * the page before reading these tags, so they're in place before indexing.
 *
 * `path` should be the route's pathname (e.g. "/about"); the canonical/OG
 * URL is built from it plus the current origin, so it's correct per-subdomain
 * (main/app/reporter) automatically.
 */
export default function Seo({ title, description, path, noindex = false, type = 'website' }) {
  useEffect(() => {
    const previousTitle = document.title;
    if (title) document.title = title;

    setMetaTag('name', 'description', description);
    setMetaTag('property', 'og:title', title);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:type', type);
    setMetaTag('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');

    if (path) {
      const canonicalUrl = `${window.location.origin}${path}`;
      setLinkTag('canonical', canonicalUrl);
      setMetaTag('property', 'og:url', canonicalUrl);
    }

    return () => {
      document.title = previousTitle;
    };
  }, [title, description, path, noindex, type]);

  return null;
}
