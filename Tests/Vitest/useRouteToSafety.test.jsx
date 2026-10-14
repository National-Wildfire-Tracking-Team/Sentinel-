import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useRouteToSafety } from '../../src/app/hooks/useRouteToSafety';
import { RoutingError } from '../../src/app/utils/routingClient';

const shelter = { id: 'fema:1', source: 'fema', name: 'High School', kind: 'evacuation_center', address: null, lng: -121.2, lat: 38.1, durationSec: 600, distanceM: 8000 };
const route = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { summary: { distance: 8000, duration: 600 }, segments: [{ steps: [] }] }, geometry: { type: 'LineString', coordinates: [[-121, 38], [-121.2, 38.1]] } }] };

let deps;
beforeEach(() => {
  deps = {
    getPosition: vi.fn().mockResolvedValue({ lng: -121, lat: 38 }),
    geocode: vi.fn().mockResolvedValue({ lng: -121.05, lat: 38.02, placeName: '1 Main St' }),
    findNearestShelters: vi.fn().mockResolvedValue({ shelters: [shelter], partial: false }),
    requestRoute: vi.fn().mockResolvedValue({ route, avoidedHazards: true }),
    buildAvoidPolygons: vi.fn().mockReturnValue({ avoid: null, startsInsideHazard: false, endsInsideHazard: false }),
  };
});

const render = (props = {}) => renderHook((p) => useRouteToSafety(p), {
  initialProps: { enabled: true, home: null, perimetersGeoJSON: null, evacZonesGeoJSON: null, deps, ...props },
});

describe('useRouteToSafety', () => {
  it('on enable: locates, then searches shelters once', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.origin).toEqual([-121, 38]);
    expect(result.current.shelters).toEqual([shelter]);
    expect(deps.findNearestShelters).toHaveBeenCalledTimes(1);
    expect(deps.requestRoute).not.toHaveBeenCalled();
  });

  it('falls back to Home when geolocation is denied and a home exists', async () => {
    deps.getPosition.mockRejectedValue(new Error('denied'));
    const { result } = render({ home: { latitude: 38.5, longitude: -121.5, label: 'Home' } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.origin).toEqual([-121.5, 38.5]);
    expect(result.current.originLabel).toBe('Home');
  });

  it('shows a location error when geolocation is denied and there is no home', async () => {
    deps.getPosition.mockRejectedValue(new Error('denied'));
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error.kind).toBe('location');
    expect(deps.findNearestShelters).not.toHaveBeenCalled();
  });

  it('selecting a shelter routes with the built avoid polygons', async () => {
    const avoid = { type: 'MultiPolygon', coordinates: [] };
    deps.buildAvoidPolygons.mockReturnValue({ avoid, startsInsideHazard: true, endsInsideHazard: false });
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(() => result.current.actions.selectShelter(shelter));
    expect(deps.requestRoute).toHaveBeenCalledWith({ origin: [-121, 38], destination: [-121.2, 38.1], avoid }, expect.any(Object));
    expect(result.current).toMatchObject({ status: 'routed', route, avoidedHazards: true, startsInsideHazard: true });
  });

  it('pick a point: startPick then pickPoint routes to that point', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.actions.startPick());
    expect(result.current.picking).toBe(true);
    await act(() => result.current.actions.pickPoint({ lng: -121.3, lat: 38.2 }));
    expect(result.current.picking).toBe(false);
    expect(result.current.destination).toMatchObject({ lng: -121.3, lat: 38.2, name: 'Dropped pin' });
    expect(deps.requestRoute).toHaveBeenCalledTimes(1);
  });

  it('403 shows upgrade state', async () => {
    deps.findNearestShelters.mockRejectedValue(new RoutingError('not_entitled', { status: 403 }));
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error.kind).toBe('not_entitled');
  });

  it('carries quota details', async () => {
    deps.findNearestShelters.mockRejectedValue(new RoutingError('quota', { status: 429, scope: 'global', window: 'day', retryAfterSec: 5000 }));
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatchObject({ kind: 'quota', scope: 'global', window: 'day', retryAfterSec: 5000 });
  });

  it('ignores results that arrive after disable, and resets', async () => {
    let resolve;
    deps.findNearestShelters.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.status).toBe('searching'));
    rerender({ enabled: false, home: null, perimetersGeoJSON: null, evacZonesGeoJSON: null, deps });
    await act(async () => resolve({ shelters: [shelter], partial: false }));
    expect(result.current.status).toBe('idle');
    expect(result.current.shelters).toEqual([]);
  });

  it('useAddress geocodes and re-searches', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(() => result.current.actions.useAddress('1 Main St'));
    expect(result.current.origin).toEqual([-121.05, 38.02]);
    expect(result.current.originLabel).toBe('1 Main St');
    expect(deps.findNearestShelters).toHaveBeenCalledTimes(2);
  });

  it('useCoordinates sets the origin and re-searches without geocoding', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(() => result.current.actions.useCoordinates({ lat: 38.6, lng: -121.7, label: '1 Main Ave, Davis, CA' }));
    expect(deps.geocode).not.toHaveBeenCalled();
    expect(deps.findNearestShelters).toHaveBeenCalledTimes(2);
    expect(deps.findNearestShelters).toHaveBeenLastCalledWith({ origin: [-121.7, 38.6] }, expect.any(Object));
    expect(result.current).toMatchObject({ status: 'ready', origin: [-121.7, 38.6], originLabel: '1 Main Ave, Davis, CA' });
  });

  it('useCoordinates skips the search when the start is unchanged, unless the last attempt errored', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(() => result.current.actions.useCoordinates({ lat: 38, lng: -121, label: 'Same spot' }));
    expect(deps.findNearestShelters).toHaveBeenCalledTimes(1);
    expect(result.current.originLabel).toBe('My location');

    deps.findNearestShelters.mockRejectedValueOnce(new RoutingError('upstream', { status: 502 }));
    await act(() => result.current.actions.useCoordinates({ lat: 38.6, lng: -121.7, label: 'Davis' }));
    expect(result.current.status).toBe('error');
    await act(() => result.current.actions.useCoordinates({ lat: 38.6, lng: -121.7, label: 'Davis' }));
    expect(deps.findNearestShelters).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe('ready');
  });

  it('useCoordinates ignores invalid coordinates and is a no-op while disabled', async () => {
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(() => result.current.actions.useCoordinates({ lat: NaN, lng: -121, label: 'x' }));
    expect(deps.findNearestShelters).toHaveBeenCalledTimes(1);
    rerender({ enabled: false, home: null, perimetersGeoJSON: null, evacZonesGeoJSON: null, deps });
    await act(() => result.current.actions.useCoordinates({ lat: 38, lng: -121, label: 'x' }));
    expect(deps.findNearestShelters).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
  });

  it('backToShelters returns to the list without re-searching or re-routing', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(() => result.current.actions.selectShelter(shelter));
    expect(result.current.status).toBe('routed');
    deps.findNearestShelters.mockClear();
    deps.requestRoute.mockClear();
    act(() => result.current.actions.backToShelters());
    expect(result.current).toMatchObject({
      status: 'ready', shelters: [shelter], partial: false, destination: null, route: null,
      avoidedHazards: false, hazardWarning: false, startsInsideHazard: false, picking: false, error: null,
    });
    expect(deps.findNearestShelters).not.toHaveBeenCalled();
    expect(deps.requestRoute).not.toHaveBeenCalled();
  });

  it('backToShelters drops an in-flight route', async () => {
    let resolve;
    deps.requestRoute.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => { result.current.actions.selectShelter(shelter); });
    await waitFor(() => expect(result.current.status).toBe('routing'));
    act(() => result.current.actions.backToShelters());
    await act(async () => resolve({ route, avoidedHazards: true }));
    expect(result.current.status).toBe('ready');
    expect(result.current.route).toBeNull();
  });

  it('useAddress shows a busy state, clears the old route, keeps the destination and re-routes to it', async () => {
    let resolveGeo;
    deps.geocode.mockReturnValue(new Promise((r) => { resolveGeo = r; }));
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(() => result.current.actions.selectShelter(shelter));
    act(() => { result.current.actions.useAddress('1 Main St'); });
    expect(result.current).toMatchObject({ status: 'locating', originLabel: '1 Main St', route: null, destination: { name: 'High School' } });
    await act(async () => resolveGeo({ lng: -121.05, lat: 38.02, placeName: '1 Main St' }));
    await waitFor(() => expect(result.current.status).toBe('routed'));
    expect(deps.requestRoute).toHaveBeenLastCalledWith(
      { origin: [-121.05, 38.02], destination: [-121.2, 38.1], avoid: null }, expect.any(Object),
    );
  });

  it('a From geocode failure drops the old route but keeps the chosen To', async () => {
    deps.geocode.mockResolvedValue(null);
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(() => result.current.actions.selectShelter(shelter));
    await act(() => result.current.actions.useAddress('nowhere'));
    expect(result.current.status).toBe('error');
    expect(result.current.error.kind).toBe('geocode');
    expect(result.current.destination).toMatchObject({ name: 'High School' });
    expect(result.current.route).toBeNull();
  });

  it('startPick toggles picking', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.actions.startPick());
    expect(result.current.picking).toBe(true);
    act(() => result.current.actions.startPick());
    expect(result.current.picking).toBe(false);
  });

  it('no hazard warning when no avoid polygons were needed (avoid null, server avoidedHazards false)', async () => {
    deps.buildAvoidPolygons.mockReturnValue({ avoid: null, startsInsideHazard: false, endsInsideHazard: false });
    deps.requestRoute.mockResolvedValue({ route, avoidedHazards: false });
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(() => result.current.actions.selectShelter(shelter));
    expect(result.current).toMatchObject({ status: 'routed', avoidedHazards: false, hazardWarning: false });
  });

  it('hazard warning when avoid polygons were sent but the server fell back to a plain route', async () => {
    const avoid = { type: 'MultiPolygon', coordinates: [] };
    deps.buildAvoidPolygons.mockReturnValue({ avoid, startsInsideHazard: false, endsInsideHazard: false });
    deps.requestRoute.mockResolvedValue({ route, avoidedHazards: false });
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(() => result.current.actions.selectShelter(shelter));
    expect(result.current).toMatchObject({ status: 'routed', avoidedHazards: false, hazardWarning: true });
  });

  it('no hazard warning when avoid polygons were sent and applied', async () => {
    const avoid = { type: 'MultiPolygon', coordinates: [] };
    deps.buildAvoidPolygons.mockReturnValue({ avoid, startsInsideHazard: false, endsInsideHazard: false });
    deps.requestRoute.mockResolvedValue({ route, avoidedHazards: true });
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(() => result.current.actions.selectShelter(shelter));
    expect(result.current.hazardWarning).toBe(false);
  });
  describe('Nearest Safety Area', () => {
    it('locates, finds shelters, and routes to the closest one', async () => {
      const far = { ...shelter, id: 'x', name: 'Far', lng: -122, lat: 39, durationSec: 3000 };
      deps.findNearestShelters.mockResolvedValue({ shelters: [shelter, far], partial: false });
      const { result } = render();
      await waitFor(() => expect(result.current.status).toBe('ready'));
      deps.getPosition.mockClear();
      await act(() => result.current.actions.nearestSafety());
      await waitFor(() => expect(result.current.status).toBe('routed'));
      expect(deps.getPosition).toHaveBeenCalledTimes(1);
      expect(deps.requestRoute).toHaveBeenLastCalledWith(
        { origin: [-121, 38], destination: [-121.2, 38.1], avoid: null }, expect.any(Object),
      );
      expect(result.current.destination).toMatchObject({ name: 'High School' });
    });

    it('replaces a previously chosen To with the closest shelter', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.status).toBe('ready'));
      await act(() => result.current.actions.routeToCoordinates({ lat: 38.3, lng: -121.4, label: 'Oak' }));
      await act(() => result.current.actions.nearestSafety());
      await waitFor(() => expect(result.current.destination).toMatchObject({ name: 'High School' }));
      expect(result.current.status).toBe('routed');
    });

    it('no Home fallback: without a device location it reports the location error', async () => {
      const { result } = render({ home: { latitude: 38.5, longitude: -121.5, label: 'Home' } });
      await waitFor(() => expect(result.current.status).toBe('ready'));
      deps.getPosition.mockRejectedValue(Object.assign(new Error('denied'), { code: 1 }));
      await act(() => result.current.actions.nearestSafety());
      expect(result.current).toMatchObject({ status: 'error', error: { kind: 'location', denied: true }, origin: null });
      expect(deps.requestRoute).not.toHaveBeenCalled();
    });

    it('uses a manually entered From: routes to its closest shelter without locating or re-searching', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.status).toBe('ready'));
      await act(() => result.current.actions.useCoordinates({ lat: 38.5, lng: -121.5, label: 'Start St' }));
      await waitFor(() => expect(result.current.status).toBe('ready'));
      deps.getPosition.mockClear();
      deps.findNearestShelters.mockClear();
      await act(() => result.current.actions.nearestSafety());
      await waitFor(() => expect(result.current.status).toBe('routed'));
      expect(deps.getPosition).not.toHaveBeenCalled();
      expect(deps.findNearestShelters).not.toHaveBeenCalled();
      expect(deps.requestRoute).toHaveBeenLastCalledWith(
        { origin: [-121.5, 38.5], destination: [-121.2, 38.1], avoid: null }, expect.any(Object),
      );
      expect(result.current.originLabel).toBe('Start St');
    });

    it('manual From whose shelter search failed: searches again, then routes', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.status).toBe('ready'));
      deps.findNearestShelters.mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'upstream' }));
      await act(() => result.current.actions.useCoordinates({ lat: 38.5, lng: -121.5, label: 'Start St' }));
      await waitFor(() => expect(result.current.status).toBe('error'));
      deps.getPosition.mockClear();
      await act(() => result.current.actions.nearestSafety());
      await waitFor(() => expect(result.current.status).toBe('routed'));
      expect(deps.getPosition).not.toHaveBeenCalled();
      expect(result.current.origin).toEqual([-121.5, 38.5]);
    });

    it('tapped while a typed start is still loading: routes once its shelters land', async () => {
      let resolveSearch;
      const { result } = render();
      await waitFor(() => expect(result.current.status).toBe('ready'));
      deps.findNearestShelters.mockReturnValueOnce(new Promise((r) => { resolveSearch = r; }));
      act(() => { result.current.actions.useCoordinates({ lat: 38.5, lng: -121.5, label: 'Start St' }); });
      await waitFor(() => expect(result.current.status).toBe('searching'));
      deps.getPosition.mockClear();
      await act(() => result.current.actions.nearestSafety());
      await act(async () => resolveSearch({ shelters: [shelter], partial: false }));
      await waitFor(() => expect(result.current.status).toBe('routed'));
      expect(deps.getPosition).not.toHaveBeenCalled();
      expect(result.current.destination).toMatchObject({ name: 'High School' });
    });

    it('with no shelters nearby it stops at the (empty) list', async () => {
      deps.findNearestShelters.mockResolvedValue({ shelters: [], partial: false });
      const { result } = render();
      await waitFor(() => expect(result.current.status).toBe('ready'));
      await act(() => result.current.actions.nearestSafety());
      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(deps.requestRoute).not.toHaveBeenCalled();
    });
  });

  describe('From and To in any order', () => {
    it('To chosen before a start waits (no quota), then routes once the start is set', async () => {
      deps.getPosition.mockRejectedValue(new Error('denied'));
      const { result } = render();
      await waitFor(() => expect(result.current.status).toBe('error'));
      await act(() => result.current.actions.routeToCoordinates({ lat: 38.3, lng: -121.4, label: 'Oak' }));
      expect(deps.requestRoute).not.toHaveBeenCalled();
      expect(result.current).toMatchObject({ destination: { name: 'Oak' }, error: { kind: 'location' } });
      await act(() => result.current.actions.useCoordinates({ lat: 38.5, lng: -121.5, label: 'Start St' }));
      await waitFor(() => expect(result.current.status).toBe('routed'));
      expect(deps.findNearestShelters).toHaveBeenCalledTimes(1);
      expect(deps.requestRoute).toHaveBeenCalledWith({ origin: [-121.5, 38.5], destination: [-121.4, 38.3], avoid: null }, expect.any(Object));
    });

    it('typed To before a start geocodes and waits, then routes after the start', async () => {
      deps.getPosition.mockRejectedValue(new Error('denied'));
      const { result } = render();
      await waitFor(() => expect(result.current.status).toBe('error'));
      await act(() => result.current.actions.routeToAddress('1 Main St'));
      expect(deps.requestRoute).not.toHaveBeenCalled();
      expect(result.current.destination).toMatchObject({ lng: -121.05, lat: 38.02, name: '1 Main St' });
      await act(() => result.current.actions.useCoordinates({ lat: 38.5, lng: -121.5, label: 'Start St' }));
      await waitFor(() => expect(result.current.status).toBe('routed'));
    });

    it('To chosen while the shelter search runs does not cancel it, then routes', async () => {
      let resolveSearch;
      deps.findNearestShelters.mockReturnValue(new Promise((r) => { resolveSearch = r; }));
      const { result } = render();
      await waitFor(() => expect(result.current.status).toBe('searching'));
      await act(() => result.current.actions.routeToCoordinates({ lat: 38.3, lng: -121.4, label: 'Oak' }));
      expect(deps.requestRoute).not.toHaveBeenCalled();
      await act(async () => resolveSearch({ shelters: [shelter], partial: false }));
      await waitFor(() => expect(result.current.status).toBe('routed'));
      expect(result.current.shelters).toEqual([shelter]);
      expect(deps.requestRoute).toHaveBeenCalledTimes(1);
    });

    it('a waiting destination is dropped on disable', async () => {
      deps.getPosition.mockRejectedValue(new Error('denied'));
      const { result, rerender } = render();
      await waitFor(() => expect(result.current.status).toBe('error'));
      await act(() => result.current.actions.routeToCoordinates({ lat: 38.3, lng: -121.4, label: 'Oak' }));
      rerender({ enabled: false, home: null, perimetersGeoJSON: null, evacZonesGeoJSON: null, deps });
      expect(result.current.destination).toBeNull();
    });
  });

  describe('To field', () => {
    it('routeToCoordinates routes to the given point without geocoding or a shelter search', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.status).toBe('ready'));
      deps.findNearestShelters.mockClear();
      await act(() => result.current.actions.routeToCoordinates({ lat: 38.3, lng: -121.4, label: '5 Oak St, Elk Grove, CA' }));
      expect(deps.geocode).not.toHaveBeenCalled();
      expect(deps.findNearestShelters).not.toHaveBeenCalled();
      expect(deps.requestRoute).toHaveBeenCalledTimes(1);
      expect(deps.requestRoute).toHaveBeenCalledWith({ origin: [-121, 38], destination: [-121.4, 38.3], avoid: null }, expect.any(Object));
      expect(result.current).toMatchObject({ status: 'routed', destination: { lng: -121.4, lat: 38.3, name: '5 Oak St, Elk Grove, CA' }, shelters: [shelter] });
    });

    it('routeToCoordinates is a no-op for the current destination while routed', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.status).toBe('ready'));
      await act(() => result.current.actions.routeToCoordinates({ lat: 38.3, lng: -121.4, label: 'Oak' }));
      await act(() => result.current.actions.routeToCoordinates({ lat: 38.3, lng: -121.4, label: 'Oak' }));
      expect(deps.requestRoute).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('routed');
    });

    it('routeToCoordinates ignores invalid coordinates and needs an origin', async () => {
      deps.getPosition.mockRejectedValue(new Error('denied'));
      const { result } = render();
      await waitFor(() => expect(result.current.status).toBe('error'));
      await act(() => result.current.actions.routeToCoordinates({ lat: 38.3, lng: -121.4, label: 'Oak' }));
      await act(() => result.current.actions.routeToCoordinates({ lat: NaN, lng: -121.4, label: 'Oak' }));
      expect(deps.requestRoute).not.toHaveBeenCalled();
    });

    it('routeToAddress geocodes, then routes (Directions only)', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.status).toBe('ready'));
      deps.findNearestShelters.mockClear();
      await act(() => result.current.actions.routeToAddress('1 Main St'));
      expect(deps.geocode).toHaveBeenCalledWith('1 Main St');
      expect(deps.findNearestShelters).not.toHaveBeenCalled();
      expect(deps.requestRoute).toHaveBeenCalledWith({ origin: [-121, 38], destination: [-121.05, 38.02], avoid: null }, expect.any(Object));
      expect(result.current).toMatchObject({ status: 'routed', origin: [-121, 38], originLabel: 'My location', destination: { name: '1 Main St' } });
    });

    it('routeToAddress shows a busy state while geocoding', async () => {
      let resolveGeo;
      deps.geocode.mockReturnValue(new Promise((r) => { resolveGeo = r; }));
      const { result } = render();
      await waitFor(() => expect(result.current.status).toBe('ready'));
      act(() => { result.current.actions.routeToAddress('1 Main St'); });
      expect(result.current.status).toBe('routing');
      await act(async () => resolveGeo({ lng: -121.05, lat: 38.02, placeName: '1 Main St' }));
      await waitFor(() => expect(result.current.status).toBe('routed'));
    });

    it('a failed To geocode is a geocode error that keeps the origin and shelters', async () => {
      deps.geocode.mockResolvedValue(null);
      const { result } = render();
      await waitFor(() => expect(result.current.status).toBe('ready'));
      await act(() => result.current.actions.routeToAddress('nowhere'));
      expect(result.current).toMatchObject({ status: 'error', error: { kind: 'geocode' }, origin: [-121, 38], originLabel: 'My location', shelters: [shelter], destination: null, route: null });
      expect(deps.requestRoute).not.toHaveBeenCalled();
      act(() => result.current.actions.backToShelters());
      expect(result.current.status).toBe('ready');
    });

    it('drops a stale routeToAddress result after disable', async () => {
      let resolveGeo;
      deps.geocode.mockReturnValue(new Promise((r) => { resolveGeo = r; }));
      const { result, rerender } = render();
      await waitFor(() => expect(result.current.status).toBe('ready'));
      act(() => { result.current.actions.routeToAddress('1 Main St'); });
      rerender({ enabled: false, home: null, perimetersGeoJSON: null, evacZonesGeoJSON: null, deps });
      await act(async () => resolveGeo({ lng: -121.05, lat: 38.02, placeName: '1 Main St' }));
      expect(result.current.status).toBe('idle');
      expect(deps.requestRoute).not.toHaveBeenCalled();
    });
  });
});
