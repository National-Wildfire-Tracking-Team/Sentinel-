import { useEffect } from 'react';

// GA4 is loaded directly with gtag.js. There's no Tag Manager container:
// GTM-546TW8NQ only re-loaded this same GA tag and re-sent saved_location,
// doubling the download and the main-thread work for no extra data.
const GA_MEASUREMENT_ID = 'G-JV1EY1VHRQ';

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

export default function DeferredAnalytics() {
  useEffect(() => {
    const cleanup = scheduleDeferredAnalyticsLoad();
    return () => {
      cleanup?.();
    };
  }, []);

  return null;
}
