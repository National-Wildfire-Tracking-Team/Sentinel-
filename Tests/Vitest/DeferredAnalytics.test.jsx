import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeferredAnalytics from '../../src/shared/components/DeferredScripts/DeferredAnalytics';
import { ACCEPT_ALL, CONSENT_KEY, DECLINE_ALL, writeCookieConsent } from '../../src/shared/utils/cookieConsent';

const scriptSrcs = () => [...document.head.querySelectorAll('script[src]')].map((s) => s.src);
const gtagLoaded = () => scriptSrcs().some((src) => src.includes('googletagmanager.com/gtag/js?id=G-JV1EY1VHRQ'));

function clearConsent() {
  document.cookie = `${CONSENT_KEY}=; Path=/; Max-Age=0`;
  window.localStorage.removeItem(CONSENT_KEY);
}

function setReadyState(state) {
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => state });
}

describe('DeferredAnalytics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReadyState('complete');
    writeCookieConsent(ACCEPT_ALL);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete document.readyState;
    document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove());
    delete window.__nwttAnalyticsLoaded;
    delete window.__nwttAnalyticsScheduled;
    delete window.gtag;
    delete window.dataLayer;
    delete window['ga-disable-G-JV1EY1VHRQ'];
    clearConsent();
    document.cookie = '_ga=; Path=/; Max-Age=0';
    document.cookie = '_ga_TEST=; Path=/; Max-Age=0';
  });

  it('loads gtag.js alone (no Tag Manager) and configures GA', () => {
    render(<DeferredAnalytics />);
    vi.advanceTimersByTime(5000);

    expect(gtagLoaded()).toBe(true);
    expect(scriptSrcs().some((src) => src.includes('gtm.js'))).toBe(false);
    expect(window.dataLayer.map((args) => Array.from(args))).toContainEqual(['config', 'G-JV1EY1VHRQ']);
  });

  it('waits for the page to finish loading before starting its timer', () => {
    setReadyState('loading');
    render(<DeferredAnalytics />);

    vi.advanceTimersByTime(10000);
    expect(gtagLoaded()).toBe(false);

    window.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(5000);
    expect(gtagLoaded()).toBe(true);
  });

  it('loads straight away on the first interaction, even mid-load', () => {
    setReadyState('loading');
    render(<DeferredAnalytics />);

    window.dispatchEvent(new Event('pointerdown'));
    expect(gtagLoaded()).toBe(true);
  });

  it('before the visitor answers, loads cookieless so the visit is still counted', () => {
    clearConsent();
    render(<DeferredAnalytics />);
    vi.advanceTimersByTime(5000);

    expect(gtagLoaded()).toBe(true);
    const pushes = window.dataLayer.map((args) => Array.from(args));
    expect(pushes[0]).toEqual(['consent', 'default', {
      analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    }]);
    expect(pushes).toContainEqual(['config', 'G-JV1EY1VHRQ']);
  });

  it('loads with analytics storage granted once tracking is on', () => {
    render(<DeferredAnalytics />);
    vi.advanceTimersByTime(5000);

    expect(Array.from(window.dataLayer[0])).toEqual(['consent', 'default', expect.objectContaining({ analytics_storage: 'granted', ad_storage: 'denied' })]);
  });

  it('grants storage on a cookieless gtag.js when the visitor accepts', () => {
    clearConsent();
    render(<DeferredAnalytics />);
    vi.advanceTimersByTime(5000);

    act(() => writeCookieConsent(ACCEPT_ALL));
    expect(Array.from(window.dataLayer.at(-1))).toEqual(['consent', 'update', expect.objectContaining({ analytics_storage: 'granted' })]);
  });

  it('loads when Third Party Performance Tracking alone is on', () => {
    clearConsent();
    writeCookieConsent({ savedToggles: false, analytics: true });
    render(<DeferredAnalytics />);

    vi.advanceTimersByTime(5000);
    expect(gtagLoaded()).toBe(true);
  });

  it('loads nothing when only Saved Toggles is on', () => {
    clearConsent();
    writeCookieConsent({ savedToggles: true, analytics: false });
    render(<DeferredAnalytics />);

    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(10000);
    expect(gtagLoaded()).toBe(false);
  });

  it('loads nothing once non-essential cookies are declined', () => {
    clearConsent();
    writeCookieConsent(DECLINE_ALL);
    render(<DeferredAnalytics />);

    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(10000);
    expect(gtagLoaded()).toBe(false);
    expect(window['ga-disable-G-JV1EY1VHRQ']).toBe(true);
  });

  it('stops a cookieless gtag.js when the visitor declines', () => {
    clearConsent();
    render(<DeferredAnalytics />);
    vi.advanceTimersByTime(5000);

    act(() => writeCookieConsent(DECLINE_ALL));
    expect(window['ga-disable-G-JV1EY1VHRQ']).toBe(true);
  });

  it('stops GA and deletes its cookies when tracking is turned off after accepting', () => {
    render(<DeferredAnalytics />);
    vi.advanceTimersByTime(5000);
    expect(gtagLoaded()).toBe(true);
    document.cookie = '_ga=GA1.1.123.456; Path=/';
    document.cookie = '_ga_TEST=GS1.1.789; Path=/';

    act(() => writeCookieConsent(DECLINE_ALL));

    expect(window['ga-disable-G-JV1EY1VHRQ']).toBe(true);
    expect(document.cookie).not.toMatch(/(^|; )_ga/);
  });
});
