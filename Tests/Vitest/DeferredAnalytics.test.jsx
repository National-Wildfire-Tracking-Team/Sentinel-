import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeferredAnalytics from '../../src/shared/components/DeferredScripts/DeferredAnalytics';

const scriptSrcs = () => [...document.head.querySelectorAll('script[src]')].map((s) => s.src);
const gtagLoaded = () => scriptSrcs().some((src) => src.includes('googletagmanager.com/gtag/js?id=G-JV1EY1VHRQ'));

function setReadyState(state) {
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => state });
}

describe('DeferredAnalytics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReadyState('complete');
  });

  afterEach(() => {
    vi.useRealTimers();
    delete document.readyState;
    document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove());
    delete window.__nwttAnalyticsLoaded;
    delete window.__nwttAnalyticsScheduled;
    delete window.gtag;
    delete window.dataLayer;
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
});
