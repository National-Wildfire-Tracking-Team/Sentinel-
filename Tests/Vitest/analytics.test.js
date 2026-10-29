import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  trackEvent,
  trackSentinelUse,
  trackSignUp,
  trackSavedLocation,
} from '../../src/shared/utils/analytics';
import { ACCEPT_ALL, CONSENT_KEY, DECLINE_ALL, writeCookieConsent } from '../../src/shared/utils/cookieConsent';

// gtag pushes its `arguments` object, so compare as a plain array.
const lastPush = () => Array.from(window.dataLayer.at(-1));

function resetAnalyticsGlobals() {
  delete window.gtag;
  delete window.dataLayer;
  document.cookie = `${CONSENT_KEY}=; Path=/; Max-Age=0`;
  window.localStorage.removeItem(CONSENT_KEY);
}

beforeEach(resetAnalyticsGlobals);
afterEach(resetAnalyticsGlobals);

describe('analytics', () => {
  beforeEach(() => writeCookieConsent(ACCEPT_ALL));

  it('trackEvent installs the gtag stub and queues the event when gtag is missing', () => {
    expect(window.gtag).toBeUndefined();
    trackEvent('test_event', { foo: 'bar' });
    expect(typeof window.gtag).toBe('function');
    expect(window.dataLayer).toHaveLength(1);
    expect(lastPush()).toEqual(['event', 'test_event', { foo: 'bar' }]);
  });

  it('trackEvent defaults params to an empty object', () => {
    trackEvent('bare_event');
    expect(lastPush()).toEqual(['event', 'bare_event', {}]);
  });

  it('trackEvent reuses an existing dataLayer and gtag', () => {
    window.dataLayer = [{ event: 'gtm.js' }];
    const calls = [];
    window.gtag = (...args) => {
      calls.push(args);
      window.dataLayer.push(args);
    };
    trackEvent('test_event', { a: 1 });
    expect(calls).toEqual([['event', 'test_event', { a: 1 }]]);
    expect(window.dataLayer).toHaveLength(2);
  });

  it('trackSentinelUse sends sentinel_use with the engagement action', () => {
    trackSentinelUse('layer_toggle', { layer: 'smoke' });
    expect(lastPush()).toEqual([
      'event',
      'sentinel_use',
      { engagement_action: 'layer_toggle', layer: 'smoke' },
    ]);
  });

  it('trackSignUp sends sign_up with only the method', () => {
    trackSignUp('email');
    expect(lastPush()).toEqual(['event', 'sign_up', { method: 'email' }]);
  });

  it('trackSignUp defaults the method to email', () => {
    trackSignUp();
    expect(lastPush()).toEqual(['event', 'sign_up', { method: 'email' }]);
  });

  it('trackSavedLocation sends saved_location with no parameters', () => {
    trackSavedLocation();
    expect(lastPush()).toEqual(['event', 'saved_location', {}]);
  });
});

describe('analytics without Third Party Performance Tracking on', () => {
  it('queues nothing once tracking is off', () => {
    writeCookieConsent(DECLINE_ALL);
    trackEvent('test_event');
    expect(window.dataLayer).toBeUndefined();
  });

  it('queues nothing before the visitor answers the cookie banner (GA only counts the visit)', () => {
    trackEvent('test_event');
    expect(window.dataLayer).toBeUndefined();
  });
});
