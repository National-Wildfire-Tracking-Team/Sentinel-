import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RouteToSafetyPanel, { DISCLAIMER } from '../../src/app/components/Routing/RouteToSafetyPanel';

vi.mock('../../src/shared/utils/getAppOrigin', () => ({ getMainOrigin: () => 'https://example.org' }));
const suggestAddresses = vi.fn();
const reverseGeocode = vi.fn().mockResolvedValue(null);
vi.mock('../../src/app/utils/geocode', () => ({
  suggestAddresses: (...args) => suggestAddresses(...args),
  reverseGeocode: (...args) => reverseGeocode(...args),
}));

const base = {
  status: 'ready', origin: [-121, 38], originLabel: 'My location', shelters: [], partial: false,
  destination: null, route: null, avoidedHazards: false, hazardWarning: false, startsInsideHazard: false, picking: false, error: null,
};
const actions = () => ({
  useMyLocation: vi.fn(), useHome: vi.fn(), useAddress: vi.fn(), useCoordinates: vi.fn(), selectShelter: vi.fn(),
  startPick: vi.fn(), pickPoint: vi.fn(), retry: vi.fn(), backToShelters: vi.fn(),
  routeToCoordinates: vi.fn(), routeToAddress: vi.fn(), nearestSafety: vi.fn(),
});
const shelter = { id: 'fema:1', source: 'fema', name: 'High School', kind: 'evacuation_center', address: '9 Elm', lng: -121.2, lat: 38.1, durationSec: 1260, distanceM: 16093 };
const route = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { summary: { distance: 16093, duration: 1260 }, segments: [{ steps: [{ instruction: 'Head north', distance: 100, duration: 10 }] }] }, geometry: { type: 'LineString', coordinates: [] } }] };

const renderPanel = (state, a = actions()) => {
  render(<RouteToSafetyPanel state={{ ...base, ...state }} actions={a} onClose={vi.fn()} hasHome />);
  return a;
};

describe('RouteToSafetyPanel', () => {
  it('lists shelters with source, drive time and distance; selecting routes', () => {
    const a = renderPanel({ shelters: [shelter] });
    expect(screen.getByText('High School')).toBeInTheDocument();
    expect(screen.getByText('FEMA')).toBeInTheDocument();
    expect(screen.getByText(/21 min/)).toBeInTheDocument();
    expect(screen.getByText(/10\.0 mi/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /High School/ }));
    expect(a.selectShelter).toHaveBeenCalledWith(shelter);
  });

  it('shows "No open shelters nearby" with pick-a-point', () => {
    const a = renderPanel({ shelters: [] });
    expect(screen.getByText('No open shelters nearby')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pick a point on map' }));
    expect(a.startPick).toHaveBeenCalled();
  });

  it('notes partial results', () => {
    renderPanel({ shelters: [shelter], partial: true });
    expect(screen.getByText(/FEMA shelter list is unavailable/)).toBeInTheDocument();
  });

  it('routed: summary, steps, Open in Maps and the disclaimer', () => {
    renderPanel({ status: 'routed', destination: { lng: -121.2, lat: 38.1, name: 'High School' }, route, avoidedHazards: true });
    expect(screen.getByText(/21 min · 10\.0 mi/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in Maps/ })).toHaveAttribute('href', expect.stringContaining('destination=38.1%2C-121.2'));
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Steps/ }));
    expect(screen.getByText('Head north')).toBeInTheDocument();
  });

  it('warns when hazards could not be avoided or the start is inside one', () => {
    renderPanel({ status: 'routed', destination: { lng: -121.2, lat: 38.1, name: 'X' }, route, avoidedHazards: false, hazardWarning: true, startsInsideHazard: true });
    expect(screen.getByText(/passes through or near an active hazard/)).toBeInTheDocument();
    expect(screen.getByText(/starting inside an active hazard area/)).toBeInTheDocument();
  });

  it.each([
    [{ kind: 'quota', scope: 'user', window: 'minute' }, /try again in a minute/],
    [{ kind: 'quota', scope: 'user', window: 'day' }, /today's routing limit/],
    [{ kind: 'not_entitled' }, /Navigation is part of Sentinel Pro\./],
    [{ kind: 'unauthenticated' }, /Sign in again to use Navigation\./],
    [{ kind: 'quota', scope: 'global', window: 'day' }, /at capacity/],
    [{ kind: 'unauthenticated' }, /Sign in again/],
    [{ kind: 'no_route' }, /No drivable route/],
    [{ kind: 'upstream' }, /Routing is unavailable/],
  ])('error %j', (error, text) => {
    renderPanel({ status: 'error', error });
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('not_entitled shows the upgrade link', () => {
    renderPanel({ status: 'error', error: { kind: 'not_entitled' } });
    expect(screen.getByRole('link', { name: /Upgrade/ })).toHaveAttribute('href', 'https://example.org/pricing');
  });

  it('retry calls actions.retry', () => {
    const a = renderPanel({ status: 'error', error: { kind: 'upstream' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(a.retry).toHaveBeenCalled();
  });

  it('start point controls', () => {
    const a = renderPanel({ originLabel: 'Home' });
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(a.useHome).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'My location' }));
    expect(a.useMyLocation).toHaveBeenCalled();
    // Plain Enter with no highlighted suggestion still geocodes the typed text.
    const input = screen.getByRole('combobox', { name: /^From address/ });
    fireEvent.change(input, { target: { value: '1 Main' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(a.useAddress).toHaveBeenCalledWith('1 Main');
  });

  it('From section shows the current start and changes it from a suggestion', async () => {
    suggestAddresses.mockResolvedValue([{ id: 'a', label: '1 Main St, Sacramento, CA', lat: 38.5, lng: -121.5 }]);
    const a = renderPanel({ originLabel: 'Home' });
    expect(screen.getByText('From')).toBeInTheDocument();
    const input = screen.getByRole('combobox', { name: /^From address/ });
    expect(input).toHaveAttribute('placeholder', 'Home');
    fireEvent.change(input, { target: { value: '1 Main' } });
    const option = await waitFor(() => screen.getByRole('option', { name: /1 Main St, Sacramento/ }));
    expect(suggestAddresses).toHaveBeenCalledWith('1 Main', expect.objectContaining({ proximity: [-121, 38] }));
    fireEvent.mouseDown(option);
    fireEvent.click(option);
    expect(a.useCoordinates).toHaveBeenCalledWith({ lat: 38.5, lng: -121.5, label: '1 Main St, Sacramento, CA' });
    expect(a.useAddress).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
  });

  it('routed view has a Back to shelters button', () => {
    const a = renderPanel({ status: 'routed', shelters: [shelter], destination: { lng: -121.2, lat: 38.1, name: 'High School' }, route });
    fireEvent.click(screen.getByRole('button', { name: 'Back to shelters' }));
    expect(a.backToShelters).toHaveBeenCalled();
  });

  it('error view offers Back to shelters only when shelters exist', () => {
    const a = renderPanel({ status: 'error', error: { kind: 'no_route' }, shelters: [shelter] });
    fireEvent.click(screen.getByRole('button', { name: 'Back to shelters' }));
    expect(a.backToShelters).toHaveBeenCalled();
  });

  it('error view without shelters has no Back to shelters button', () => {
    renderPanel({ status: 'error', error: { kind: 'upstream' }, shelters: [] });
    expect(screen.queryByRole('button', { name: 'Back to shelters' })).toBeNull();
  });

  it('global quota without a destination does not mention Open in Maps', () => {
    renderPanel({ status: 'error', error: { kind: 'quota', scope: 'global', window: 'day' } });
    expect(screen.getByText('Routing is at capacity right now. Try again later.')).toBeInTheDocument();
    expect(screen.queryByText(/Use Open in Maps/)).toBeNull();
  });

  it('global quota with a destination points to Open in Maps', () => {
    renderPanel({ status: 'error', error: { kind: 'quota', scope: 'global', window: 'day' }, destination: { lng: -121.2, lat: 38.1, name: 'X' } });
    expect(screen.getByText(/Use Open in Maps for directions/)).toBeInTheDocument();
  });

  it('routed view renders without a summary', () => {
    const noSummary = { ...route, features: [{ ...route.features[0], properties: { segments: route.features[0].properties.segments } }] };
    renderPanel({ status: 'routed', destination: { lng: -121.2, lat: 38.1, name: 'High School' }, route: noSummary, avoidedHazards: false, hazardWarning: true });
    expect(screen.getByRole('combobox', { name: /^To address/ })).toHaveAttribute('placeholder', 'High School');
    expect(screen.getByRole('link', { name: /Open in Maps/ })).toBeInTheDocument();
    expect(screen.getByText(/passes through or near an active hazard/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Steps/ }));
    expect(screen.getByText('Head north')).toBeInTheDocument();
  });

  it('pick button reads Cancel picking while picking', () => {
    const a = renderPanel({ shelters: [], picking: true });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel picking' }));
    expect(a.startPick).toHaveBeenCalled();
  });

  it('address input is labelled for search', () => {
    renderPanel({});
    for (const name of [/^From address/, /^To address/]) {
      expect(screen.getByRole('combobox', { name })).toHaveAttribute('enterkeyhint', 'search');
    }
  });

  it('has two address lines, From above To, with My location inside the From row', () => {
    const a = renderPanel({ originLabel: 'Home' });
    const [from, to] = screen.getAllByRole('combobox');
    expect(from).toHaveAccessibleName('From address, Home');
    expect(to).toHaveAccessibleName('To address');
    const fromRow = screen.getByTestId('route-from-row');
    expect(fromRow).toContainElement(from);
    const myLoc = screen.getByRole('button', { name: 'My location' });
    expect(fromRow).toContainElement(myLoc);
    expect(myLoc).toHaveTextContent('My Location');
    // The From and To side buttons share one size.
    const nearest = screen.getByRole('button', { name: 'Nearest Safety Area (Beta)' });
    const sizeClasses = (el) => el.className.split(/\s+/).filter((c) => /^(w-|min-h-|px-|py-|text-\[)/.test(c)).sort();
    expect(sizeClasses(nearest)).toEqual(sizeClasses(myLoc));
    expect(screen.getByTestId('route-to-row')).toContainElement(to);
    expect(from).toHaveAttribute('placeholder', 'Home');
    expect(to).toHaveAttribute('placeholder', 'Where to?');
    fireEvent.click(myLoc);
    expect(a.useMyLocation).toHaveBeenCalled();
  });

  it('To: a suggestion routes there; typed text + Enter geocodes and routes', async () => {
    suggestAddresses.mockResolvedValue([{ id: 'b', label: '5 Oak St, Elk Grove, CA', lat: 38.3, lng: -121.4 }]);
    const a = renderPanel({ shelters: [shelter] });
    const to = screen.getByRole('combobox', { name: /^To address/ });
    fireEvent.change(to, { target: { value: '5 Oak' } });
    const option = await waitFor(() => screen.getByRole('option', { name: /5 Oak St/ }));
    fireEvent.mouseDown(option);
    fireEvent.click(option);
    expect(a.routeToCoordinates).toHaveBeenCalledWith({ lat: 38.3, lng: -121.4, label: '5 Oak St, Elk Grove, CA' });
    expect(a.useCoordinates).not.toHaveBeenCalled();
    fireEvent.change(to, { target: { value: '9 Pine' } });
    fireEvent.keyDown(to, { key: 'Enter' });
    expect(a.routeToAddress).toHaveBeenCalledWith('9 Pine');
    // Shelters stay as quick picks under the address lines.
    expect(screen.getByText('Nearby shelters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /High School/ }));
    expect(a.selectShelter).toHaveBeenCalledWith(shelter);
  });

  it('To is usable while the shelter search runs (From and To in any order)', () => {
    renderPanel({ status: 'searching', shelters: [] });
    const to = screen.getByRole('combobox', { name: /^To address/ });
    expect(to).toBeEnabled();
    expect(screen.queryByText(/Finding shelters…/)).toBeNull();
  });

  it('My location as the start: no My location button, From shows coordinates, then the street address', async () => {
    reverseGeocode.mockResolvedValueOnce('1 Main St, Sacramento, CA 95814');
    renderPanel({ origin: [-121.49441, 38.58161], originLabel: 'My location' });
    expect(screen.queryByRole('button', { name: 'My location' })).toBeNull();
    const from = screen.getByRole('combobox', { name: /^From address/ });
    expect(from).toHaveAttribute('placeholder', '38.58161, -121.49441');
    await waitFor(() => expect(from).toHaveAttribute('placeholder', '1 Main St, Sacramento, CA 95814'));
    expect(from).toHaveAccessibleName('From address, 1 Main St, Sacramento, CA 95814');
    expect(reverseGeocode).toHaveBeenCalledWith([-121.49441, 38.58161], expect.objectContaining({ signal: expect.anything() }));
  });

  it('header shows "Finding your location…" while locating, not the body', () => {
    renderPanel({ status: 'locating', origin: null, originLabel: null });
    const header = screen.getByRole('banner');
    expect(header).toHaveTextContent('Finding your location…');
    expect(screen.getByTestId('route-status')).toHaveClass('sr-only');
  });

  it('no location: header says "No Location Found" with Retry next to X; nothing in the body', () => {
    const a = renderPanel({ status: 'error', error: { kind: 'location' }, origin: null, originLabel: null });
    const header = screen.getByRole('banner');
    expect(header).toHaveTextContent('No Location Found');
    const retry = screen.getByRole('button', { name: 'Retry location' });
    expect(header).toContainElement(retry);
    expect(header).toContainElement(screen.getByRole('button', { name: 'Close Navigation' }));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(retry);
    expect(a.retry).toHaveBeenCalled();
    expect(screen.queryByTestId('location-denied-hint')).toBeNull();
  });

  it('blocked location: explains how to turn it on', () => {
    renderPanel({ status: 'error', error: { kind: 'location', denied: true }, origin: null, originLabel: null });
    expect(screen.getByTestId('location-denied-hint')).toHaveTextContent(/Allow it in your browser/);
  });

  it('"Nearest Safety Area" sits beside the To box and starts the one-tap flow', () => {
    const a = renderPanel({ originLabel: 'My location', origin: [-121, 38] });
    const btn = screen.getByRole('button', { name: 'Nearest Safety Area (Beta)' });
    expect(screen.getByTestId('route-to-row')).toContainElement(btn);
    expect(screen.getByTestId('route-from-row')).not.toContainElement(btn);
    expect(btn.querySelector('svg')).toBeNull();
    expect(btn).toHaveTextContent('Nearest Safety Area');
    expect(screen.getByTestId('nearest-beta')).toHaveTextContent('Beta');
    expect(btn).toContainElement(screen.getByTestId('nearest-beta'));
    fireEvent.click(btn);
    expect(a.nearestSafety).toHaveBeenCalled();
  });

  it('accessible names carry the chosen start and destination', () => {
    renderPanel({ originLabel: 'Home', status: 'routed', route, destination: { lng: -121.2, lat: 38.1, name: 'High School' } });
    expect(screen.getByRole('combobox', { name: 'From address, Home' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'To address, High School' })).toBeInTheDocument();
  });

  it('To works before there is a start, with no "Set a start first" text', () => {
    renderPanel({ origin: null, originLabel: null, status: 'error', error: { kind: 'location' } });
    const to = screen.getByRole('combobox', { name: /^To address/ });
    expect(to).toBeEnabled();
    expect(screen.queryByText(/Set a start first/)).toBeNull();
    expect(screen.getByRole('combobox', { name: /^From address/ })).toHaveAttribute('placeholder', 'Choose a start point');
  });

  it('after choosing From or To, no "Search a different" box remains and the fields show the choice', async () => {
    suggestAddresses.mockResolvedValue([{ id: 'a', label: '1 Main St, Sacramento, CA', lat: 38.5, lng: -121.5 }]);
    const props = { actions: actions(), onClose: vi.fn(), hasHome: true };
    const { rerender } = render(<RouteToSafetyPanel state={base} {...props} />);
    for (const name of [/^From address/, /^To address/]) {
      const input = screen.getByRole('combobox', { name });
      input.focus();
      fireEvent.change(input, { target: { value: '1 Main' } });
      const option = await waitFor(() => screen.getByRole('option', { name: /1 Main St/ }));
      fireEvent.mouseDown(option);
      fireEvent.click(option);
      expect(input).toHaveValue('');
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(document.activeElement).not.toBe(input);
    }
    rerender(<RouteToSafetyPanel state={{ ...base, originLabel: '1 Main St, Sacramento, CA', status: 'routed', route,
      destination: { lng: -121.5, lat: 38.5, name: '1 Main St, Sacramento, CA' } }} {...props} />);
    expect(screen.queryByText(/Search a different/)).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/Search a different/);
    expect(screen.getByRole('combobox', { name: /^From address/ })).toHaveAttribute('placeholder', '1 Main St, Sacramento, CA');
    expect(screen.getByRole('combobox', { name: /^To address/ })).toHaveAttribute('placeholder', '1 Main St, Sacramento, CA');
  });

  it('keeps one persistent live status region', () => {
    renderPanel({ status: 'ready' });
    // The panel's own region (the address box keeps a separate one for its suggestion count).
    const region = screen.getByTestId('route-status');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('');
  });

  it('live status region announces busy text', () => {
    renderPanel({ status: 'searching' });
    expect(screen.getByTestId('route-status')).toHaveTextContent('Finding open shelters…');
  });

  it('is labelled Navigation (heading, region and close button)', () => {
    renderPanel({});
    expect(screen.getByRole('heading', { name: 'Navigation' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Navigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Navigation' })).toBeInTheDocument();
    expect(screen.queryByText(/Route to Safety/)).toBeNull();
  });

  it('no amber hazard warning when hazardWarning is false (no hazards were near the trip)', () => {
    renderPanel({ status: 'routed', destination: { lng: -121.2, lat: 38.1, name: 'X' }, route, avoidedHazards: false, hazardWarning: false });
    expect(screen.queryByText(/passes through or near an active hazard/)).toBeNull();
  });

  it('shows each shelter kind label (FEMA reads Evacuation Center)', () => {
    const sentinelOther = { ...shelter, id: 'sentinel:2', source: 'sentinel', name: 'Church Hall', kind: 'other' };
    renderPanel({ shelters: [shelter, sentinelOther] });
    expect(screen.getByRole('button', { name: /High School/ })).toHaveTextContent('Evacuation Center');
    expect(screen.getByRole('button', { name: /Church Hall/ })).toHaveTextContent('Shelter');
    expect(screen.getByRole('button', { name: /Church Hall/ })).not.toHaveTextContent('Evacuation Center');
  });

  describe('daily limit reset time', () => {
    afterEach(() => vi.restoreAllMocks());

    it('gives the reset time in local time from retryAfterSec', () => {
      const now = new Date(2026, 9, 11, 9, 30, 0).getTime();
      vi.spyOn(Date, 'now').mockReturnValue(now);
      renderPanel({ status: 'error', error: { kind: 'quota', scope: 'user', window: 'day', retryAfterSec: 7.5 * 3600 } });
      const expected = new Date(now + 7.5 * 3600 * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      expect(screen.getByText(`You've reached today's routing limit. It resets at ${expected}.`)).toBeInTheDocument();
      expect(screen.queryByText(/UTC/)).toBeNull();
    });
  });
});
