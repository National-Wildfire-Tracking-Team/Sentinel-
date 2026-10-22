import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, useTheme } from '../../src/app/context/ThemeContext';
import FutureFeaturesPanel from '../../src/app/components/MapControls/FutureFeaturesPanel';
import { useSharedThemeSync } from '../../src/shared/hooks/useSharedThemeSync';

vi.mock('../../src/app/context/AppContext', () => ({
  useApp: () => ({ futurePanelOpen: true, toggleFuturePanel: vi.fn() }),
}));
vi.mock('../../src/app/context/PreferencesContext', () => ({
  usePreferences: () => ({
    prefs: { dataPickerAnchor: 'center', timeFormat: '12h', mapPopupMode: 'list', popupSpotlight: false, spotlightOpacity: 50, popupDragHandle: false },
    updatePrefs: vi.fn(),
  }),
}));
vi.mock('../../src/app/context/ViewportContext', () => ({ useViewport: () => ({ viewport: {}, setViewport: vi.fn() }) }));

/** Stands in for the device's light/dark setting, which can change while the page is open. */
function mockDevice(scheme) {
  let current = scheme;
  const listeners = new Set();
  window.matchMedia = (query) => ({
    media: query,
    get matches() {
      return query.includes(`prefers-color-scheme: ${current}`);
    },
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  });
  return {
    switchTo(next) {
      current = next;
      listeners.forEach((fn) => fn({ matches: next === 'dark' }));
    },
  };
}

function ThemeProbe() {
  const { theme, preference, setPreference } = useTheme();
  return (
    <div>
      <output aria-label="theme">{theme}</output>
      <output aria-label="preference">{preference}</output>
      <button type="button" onClick={() => setPreference('light')}>light</button>
      <button type="button" onClick={() => setPreference('dark')}>dark</button>
      <button type="button" onClick={() => setPreference('auto')}>auto</button>
    </div>
  );
}

const mount = () => render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
const isDarkClass = () => document.documentElement.classList.contains('dark');
const themeColor = () => document.querySelector('meta[name="theme-color"]').getAttribute('content');

beforeEach(() => {
  window.localStorage.clear();
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim();
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  });
  document.documentElement.classList.remove('dark');
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#0a0c0e';
  document.head.appendChild(meta);
});
afterEach(() => {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  delete window.matchMedia;
});

describe('Theme follows the device', () => {
  it('is light on a light device and dark on a dark one when nothing was chosen', () => {
    mockDevice('light');
    const { unmount } = mount();
    expect(screen.getByLabelText('theme')).toHaveTextContent('light');
    expect(screen.getByLabelText('preference')).toHaveTextContent('auto');
    expect(isDarkClass()).toBe(false);
    unmount();

    mockDevice('dark');
    mount();
    expect(screen.getByLabelText('theme')).toHaveTextContent('dark');
    expect(isDarkClass()).toBe(true);
  });

  it('switches with the device while the page is open', () => {
    const device = mockDevice('dark');
    mount();
    act(() => device.switchTo('light'));
    expect(screen.getByLabelText('theme')).toHaveTextContent('light');
    expect(isDarkClass()).toBe(false);
    expect(themeColor()).toBe('#ffffff');
  });

  it('puts returning visitors back on Auto, ignoring the old saved theme', () => {
    window.localStorage.setItem('nwtt-theme', 'dark');
    document.cookie = 'nwtt-theme=dark; Path=/';
    mockDevice('light');
    mount();
    expect(screen.getByLabelText('preference')).toHaveTextContent('auto');
    expect(screen.getByLabelText('theme')).toHaveTextContent('light');
  });

  it('saves nothing just from visiting, so a later device change still applies', () => {
    mockDevice('dark');
    const { unmount } = mount();
    unmount();
    mockDevice('light');
    mount();
    expect(screen.getByLabelText('theme')).toHaveTextContent('light');
  });
});

describe('Theme chosen by hand', () => {
  it('keeps a chosen theme over the device, across visits, until Auto is picked again', () => {
    const device = mockDevice('dark');
    const { unmount } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'light' }));
    expect(screen.getByLabelText('theme')).toHaveTextContent('light');
    act(() => device.switchTo('dark'));
    expect(screen.getByLabelText('theme')).toHaveTextContent('light');
    unmount();

    mockDevice('dark');
    const second = mount();
    expect(screen.getByLabelText('theme')).toHaveTextContent('light');
    fireEvent.click(screen.getByRole('button', { name: 'auto' }));
    expect(screen.getByLabelText('theme')).toHaveTextContent('dark');
    second.unmount();

    mockDevice('light');
    mount();
    expect(screen.getByLabelText('preference')).toHaveTextContent('auto');
    expect(screen.getByLabelText('theme')).toHaveTextContent('light');
  });
});

describe('Dark Mode control in the menu', () => {
  const renderMenu = () => render(
    <MemoryRouter>
      <ThemeProvider>
        <FutureFeaturesPanel />
        <ThemeProbe />
      </ThemeProvider>
    </MemoryRouter>,
  );

  it('offers Auto, Off and On, with Auto chosen until someone picks', () => {
    mockDevice('light');
    renderMenu();
    for (const name of ['Auto', 'Off', 'On']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/matches your device/i)).toBeInTheDocument();
  });

  it('turns dark mode on from On, and back to the device from Auto', () => {
    mockDevice('light');
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'On' }));
    expect(screen.getByLabelText('theme')).toHaveTextContent('dark');
    expect(screen.getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }));
    expect(screen.getByLabelText('theme')).toHaveTextContent('light');
  });
});

describe('Marketing and reporter sites (no theme menu of their own)', () => {
  it('correct a theme baked into a prerendered page as soon as they load', () => {
    document.documentElement.classList.add('dark');
    mockDevice('light');
    renderHook(() => useSharedThemeSync());
    expect(isDarkClass()).toBe(false);
  });

  it('follow the device live while nothing is picked', () => {
    const device = mockDevice('dark');
    renderHook(() => useSharedThemeSync());
    act(() => device.switchTo('light'));
    expect(isDarkClass()).toBe(false);
    expect(themeColor()).toBe('#ffffff');
    act(() => device.switchTo('dark'));
    expect(isDarkClass()).toBe(true);
  });

  it('keep the app\'s pick over the device, and pick up a new one on returning to the tab', () => {
    window.localStorage.setItem('nwtt-appearance', 'dark');
    const device = mockDevice('dark');
    renderHook(() => useSharedThemeSync());
    act(() => device.switchTo('light'));
    expect(isDarkClass()).toBe(true);

    window.localStorage.setItem('nwtt-appearance', 'light');
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(isDarkClass()).toBe(false);
  });
});
