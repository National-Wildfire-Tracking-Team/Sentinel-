import { useEffect } from 'react';

const GTM_ID = 'GTM-546TW8NQ';
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

  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });

  appendScriptOnce({
    src: `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`,
    id: 'nwtt-gtm-script',
    async: true,
  });

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

  addInteractionListeners();

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
