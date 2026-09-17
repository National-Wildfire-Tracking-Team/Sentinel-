import { describe, it, expect, afterEach } from 'vitest';
import { getAppOrigin, getMainOrigin, getReporterOrigin } from '../../src/shared/utils/getAppOrigin';

const originalLocation = window.location;

function setLocation({ protocol = 'http:', hostname, port = '3000' }) {
  delete window.location;
  window.location = {
    protocol,
    hostname,
    port,
    origin: `${protocol}//${hostname}${port ? `:${port}` : ''}`,
  };
}

afterEach(() => {
  window.location = originalLocation;
});

describe('getAppOrigin / getMainOrigin / getReporterOrigin', () => {
  it('builds the app/reporter origin from the bare marketing host', () => {
    setLocation({ hostname: 'nationalwildfiretrackingteam.org', port: '' });
    expect(getAppOrigin()).toBe('http://app.nationalwildfiretrackingteam.org');
    expect(getReporterOrigin()).toBe('http://reporter.nationalwildfiretrackingteam.org');
  });

  it('strips the app. prefix before building the reporter/main origin, not stacking it', () => {
    setLocation({ hostname: 'app.nationalwildfiretrackingteam.org', port: '' });
    expect(getReporterOrigin()).toBe('http://reporter.nationalwildfiretrackingteam.org');
    expect(getMainOrigin()).toBe('http://nationalwildfiretrackingteam.org');
  });

  it('strips the reporter. prefix before building the app/main origin', () => {
    setLocation({ hostname: 'reporter.nationalwildfiretrackingteam.org', port: '' });
    expect(getAppOrigin()).toBe('http://app.nationalwildfiretrackingteam.org');
    expect(getMainOrigin()).toBe('http://nationalwildfiretrackingteam.org');
  });

  it('returns the current origin unchanged when already on the target subdomain', () => {
    setLocation({ hostname: 'app.nationalwildfiretrackingteam.org', port: '' });
    expect(getAppOrigin()).toBe(window.location.origin);

    setLocation({ hostname: 'reporter.nationalwildfiretrackingteam.org', port: '' });
    expect(getReporterOrigin()).toBe(window.location.origin);

    setLocation({ hostname: 'nationalwildfiretrackingteam.org', port: '' });
    expect(getMainOrigin()).toBe(window.location.origin);
  });

  it('handles local dev hostnames (app.localhost / reporter.localhost) without stacking subdomains', () => {
    setLocation({ hostname: 'app.localhost', port: '3000' });
    expect(getReporterOrigin()).toBe('http://reporter.localhost:3000');
    expect(getMainOrigin()).toBe('http://localhost:3000');

    setLocation({ hostname: 'reporter.localhost', port: '3000' });
    expect(getAppOrigin()).toBe('http://app.localhost:3000');

    setLocation({ hostname: 'localhost', port: '3000' });
    expect(getAppOrigin()).toBe('http://app.localhost:3000');
    expect(getReporterOrigin()).toBe('http://reporter.localhost:3000');
  });
});
