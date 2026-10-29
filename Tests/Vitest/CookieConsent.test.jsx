import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import CookieConsent from '../../src/shared/components/CookieConsent/CookieConsent';
import {
  ACCEPT_ALL,
  CONSENT_KEY,
  DECLINE_ALL,
  openCookieSettings,
  readCookieConsent,
  writeCookieConsent,
} from '../../src/shared/utils/cookieConsent';

function clearConsent() {
  document.cookie = `${CONSENT_KEY}=; Path=/; Max-Age=0`;
  window.localStorage.removeItem(CONSENT_KEY);
}

const banner = () => screen.queryByRole('dialog', { name: 'Cookie consent' });
const settings = () => screen.queryByRole('dialog', { name: 'Cookie Settings' });
const savedToggles = () => screen.getByRole('switch', { name: 'Saved Toggles' });
const tracking = () => screen.getByRole('switch', { name: 'Third Party Performance Tracking' });

describe('Cookie banner', () => {
  afterEach(() => {
    clearConsent();
    delete window.__NWTT_PRERENDER__;
  });

  it('shows the statement, a Privacy Policy link and both answers on a first visit', () => {
    render(<CookieConsent />);

    expect(banner()).toBeInTheDocument();
    expect(screen.getByText(/third-party performance tracking/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', 'http://localhost:3000/privacy-policy');
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Accept Cookies', 'Decline Non-Essential Cookies']);
  });

  it('Accept Cookies turns on Saved Toggles and tracking, and slides away', async () => {
    render(<CookieConsent />);
    await userEvent.click(screen.getByRole('button', { name: 'Accept Cookies' }));

    expect(readCookieConsent()).toEqual(ACCEPT_ALL);
    await waitFor(() => expect(banner()).not.toBeInTheDocument());
  });

  it('Decline Non-Essential Cookies turns both off, and slides away', async () => {
    render(<CookieConsent />);
    await userEvent.click(screen.getByRole('button', { name: 'Decline Non-Essential Cookies' }));

    expect(readCookieConsent()).toEqual(DECLINE_ALL);
    await waitFor(() => expect(banner()).not.toBeInTheDocument());
  });

  it('stays hidden for a visitor who already chose', () => {
    writeCookieConsent(DECLINE_ALL);
    render(<CookieConsent />);
    expect(banner()).not.toBeInTheDocument();
  });

  it('stays out of prerendered pages', () => {
    window.__NWTT_PRERENDER__ = true;
    render(<CookieConsent />);
    expect(banner()).not.toBeInTheDocument();
  });
});

describe('Cookie Settings popup', () => {
  afterEach(clearConsent);

  it('opens from Cookie Settings with a switch for each choice, showing what is set', () => {
    writeCookieConsent({ savedToggles: true, analytics: false });
    render(<CookieConsent />);
    expect(settings()).not.toBeInTheDocument();

    act(() => openCookieSettings());

    expect(settings()).toBeInTheDocument();
    expect(savedToggles()).toHaveAttribute('aria-checked', 'true');
    expect(tracking()).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText(/Current setting/)).not.toBeInTheDocument();
  });

  it('turns each choice on and off on its own, straight away', async () => {
    writeCookieConsent(ACCEPT_ALL);
    render(<CookieConsent />);
    act(() => openCookieSettings());

    await userEvent.click(tracking());
    expect(readCookieConsent()).toEqual({ savedToggles: true, analytics: false });
    expect(tracking()).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(savedToggles());
    expect(readCookieConsent()).toEqual(DECLINE_ALL);

    await userEvent.click(tracking());
    expect(readCookieConsent()).toEqual({ savedToggles: false, analytics: true });
  });

  it('before any choice, shows Saved Toggles on and tracking off, and flipping one answers the banner', async () => {
    render(<CookieConsent />);
    act(() => openCookieSettings());

    expect(savedToggles()).toHaveAttribute('aria-checked', 'true');
    expect(tracking()).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(tracking());
    expect(readCookieConsent()).toEqual(ACCEPT_ALL);
    await waitFor(() => expect(banner()).not.toBeInTheDocument());
  });

  it('closes on Done, the X and Escape', async () => {
    writeCookieConsent(ACCEPT_ALL);
    render(<CookieConsent />);

    act(() => openCookieSettings());
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(settings()).not.toBeInTheDocument();

    act(() => openCookieSettings());
    await userEvent.click(screen.getByRole('button', { name: 'Close cookie settings' }));
    expect(settings()).not.toBeInTheDocument();

    act(() => openCookieSettings());
    await userEvent.keyboard('{Escape}');
    expect(settings()).not.toBeInTheDocument();
    expect(readCookieConsent()).toEqual(ACCEPT_ALL);
  });
});
