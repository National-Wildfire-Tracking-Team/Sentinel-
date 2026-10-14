import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  trackEvent,
  trackSentinelUse,
  trackSignUp,
  trackSavedLocation,
} from '../../src/shared/utils/analytics';

// gtag pushes its `arguments` object, so compare as a plain array.
const lastPush = () => Array.from(window.dataLayer.at(-1));

function resetAnalyticsGlobals() {
  delete window.gtag;
  delete window.dataLayer;
}

beforeEach(resetAnalyticsGlobals);
afterEach(resetAnalyticsGlobals);

describe('analytics', () => {
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
