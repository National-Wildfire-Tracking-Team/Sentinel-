import { useEffect } from 'react';
import { useCookieConsent } from '../../hooks/useCookieConsent';
import { readCookieConsent } from '../../utils/cookieConsent';
import { sharedCookieDomain } from '../../utils/getAppOrigin';

// GA4 is loaded directly with gtag.js. There's no Tag Manager container:
// GTM-546TW8NQ only re-loaded this same GA tag and re-sent saved_location,
// doubling the download and the main-thread work for no extra data.
const GA_MEASUREMENT_ID = 'G-JV1EY1VHRQ';
// gtag.js checks this window flag before every hit; true stops it sending
// and setting cookies for the rest of the page's life.
const GA_DISABLE_KEY = `ga-disable-${GA_MEASUREMENT_ID}`;

// Google Consent Mode: with analytics_storage denied, gtag.js sets no
// cookies and keeps no ID across visits, sending only cookieless pings that
// count a visit. The site runs no ads, so the ad signals are always denied.
function consentState(analyticsGranted) {
  return {
    analytics_storage: analyticsGranted ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  };
}

function appendScriptOnce({ src, id, async = true, defer = false }) {
  if (typeof document === 'undefined') return;
  if (id && document.getElementById(id)) return;
  if (!id && document.querySelector(`script[src="${src}"]`)) return;

  const script = document.createElement('script');
  script.src = src;
  script.async = async;
  script.defer = defer;
  if (id) script.id = id;
  document.head.appendChild(script);
}

function initAnalytics() {
  if (typeof window === 'undefined') return;
  if (window.__nwttAnalyticsLoaded) return;
  window.__nwttAnalyticsLoaded = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  // Read at load time: the visitor may have answered the banner since this was scheduled.
  window.gtag('consent', 'default', consentState(readCookieConsent()?.analytics === true));

  appendScriptOnce({
    src: `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`,
    id: 'nwtt-gtag-script',
    async: true,
  });

  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID);
}

function scheduleDeferredAnalyticsLoad() {
  if (typeof window === 'undefined') return;
  if (window.__nwttAnalyticsLoaded || window.__nwttAnalyticsScheduled) return () => {};
  window.__nwttAnalyticsScheduled = true;

  let timeoutId = null;
  let idleCallbackId = null;

  const clearScheduledTasks = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (idleCallbackId !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(idleCallbackId);
      idleCallbackId = null;
    }
  };

  const removeInteractionListeners = () => {
    window.removeEventListener('pointerdown', onUserInteraction);
    window.removeEventListener('keydown', onUserInteraction);
    window.removeEventListener('scroll', onUserInteraction);
  };

  const teardown = () => {
    removeInteractionListeners();
    window.removeEventListener('load', startIdleClock);
    clearScheduledTasks();
    if (!window.__nwttAnalyticsLoaded) {
      window.__nwttAnalyticsScheduled = false;
    }
  };

  const onUserInteraction = () => {
    teardown();
    initAnalytics();
  };

  const addInteractionListeners = () => {
    window.addEventListener('pointerdown', onUserInteraction, { once: true, passive: true });
    window.addEventListener('keydown', onUserInteraction, { once: true, passive: true });
    window.addEventListener('scroll', onUserInteraction, { once: true, passive: true });
  };

  // The idle/timeout clock starts once the page has loaded. Started earlier,
  // the browser's first idle moment comes while the page's own chunks and
  // hero image are still downloading, and gtag.js (~200 KB) competes with them.
  function startIdleClock() {
    timeoutId = window.setTimeout(() => {
      teardown();
      initAnalytics();
    }, 5000);

    if ('requestIdleCallback' in window) {
      idleCallbackId = window.requestIdleCallback(() => {
        teardown();
        initAnalytics();
      }, { timeout: 7000 });
    }
  }

  addInteractionListeners();

  if (document.readyState === 'complete') {
    startIdleClock();
  } else {
    window.addEventListener('load', startIdleClock, { once: true });
  }

  return teardown;
}

/**
 * Deletes the _ga / _ga_<container> cookies GA set before the visitor
 * declined. GA writes them on the parent domain, so clear both that and any
 * host-only copy.
 */
function clearAnalyticsCookies() {
  const domain = sharedCookieDomain();
  document.cookie
    .split('; ')
    .map((pair) => pair.split('=')[0])
    .filter((name) => name === '_ga' || name.startsWith('_ga_'))
    .forEach((name) => {
      const expired = `${name}=; Path=/; Max-Age=0`;
      document.cookie = expired;
      if (domain) document.cookie = `${expired}; Domain=${domain}`;
    });
}

/**
 * GA is third-party performance tracking, a non-essential cookie:
 *   - before the visitor answers the cookie banner, it loads cookieless
 *     (consent denied) so a visit is still counted, and nothing else is kept;
 *   - turned on (Accept, or the Cookie Settings toggle), it runs in full;
 *   - turned off (Decline, or the toggle), it never loads, and a gtag.js
 *     already on the page stops and its cookies are deleted.
 */
export default function DeferredAnalytics() {
  const consent = useCookieConsent();
  const granted = consent?.analytics === true;
  const refused = consent !== null && !consent.analytics;

  useEffect(() => {
    if (refused) {
      window[GA_DISABLE_KEY] = true;
      clearAnalyticsCookies();
      return undefined;
    }
    window[GA_DISABLE_KEY] = false;
    if (window.__nwttAnalyticsLoaded) {
      window.gtag('consent', 'update', consentState(granted));
      return undefined;
    }
    const cleanup = scheduleDeferredAnalyticsLoad();
    return () => {
      cleanup?.();
    };
  }, [granted, refused]);

  return null;
}
