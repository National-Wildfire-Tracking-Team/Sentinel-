/**
 * useRouteToSafety.js
 * Flow state for the Navigation panel (internally Route to Safety; All Hazards, Pro).
 *
 * ORS quota is spent only on explicit actions: enabling the toggle (or
 * changing the start point; typing in the address box only asks Mapbox for
 * suggestions) runs one shelter search (1 Matrix unit), and
 * choosing a destination (a shelter, a dropped pin, or the To field) runs one
 * route (1–2 Directions units). From and To can be set in either order: a To
 * chosen before there's a start waits (no quota) and routes once one is set. Nothing
 * re-routes on map moves or data refreshes.
 *
 * Nearest Safety Area from inside an active evacuation zone (any level) skips
 * the shelter and routes to the nearest point outside the zone instead; in a
 * fire zone, only exits leading away from nearby fires count (see evacExit).
 * Exits on a major road (motorway/trunk/primary, via Mapbox) are tried first and
 * routed with ORS's 'fastest' preference, which favours major roads; a major-road
 * route that runs past a fire is set aside for the next exit. Exits are tried one
 * route at a time, stopping at the first good one, so the usual cost is the same
 * 1–2 Directions units as a shelter (at most three routes when exits fail).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findNearestShelters, requestRoute } from '../utils/routingClient';
import { geocodeAddress } from '../utils/geocode';

const INITIAL = {
  status: 'idle',
  origin: null,
  originLabel: null,
  shelters: [],
  partial: false,
  destination: null,
  route: null,
  avoidedHazards: false,
  // True only when avoid polygons were sent but the server had to fall back to
  // a plain route. No nearby hazards (avoid null) is not a warning.
  hazardWarning: false,
  startsInsideHazard: false,
  // Set while routing out of an evacuation zone: { name, level, isFire }.
  exitZone: null,
  picking: false,
  error: null,
};

function browserPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lng: p.coords.longitude, lat: p.coords.latitude }),
      reject,
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

const DEFAULT_DEPS = {
  getPosition: browserPosition,
  geocode: geocodeAddress,
  findNearestShelters,
  requestRoute,
  // Lazy: routingHazards pulls in @turf/buffer (and JSTS). Load it only when
  // someone actually routes, so it stays out of the entry chunk.
  buildAvoidPolygons: async (args) => (await import('../utils/routingHazards')).buildAvoidPolygons(args),
  findEvacExit: async (args) => (await import('../utils/evacExit')).findEvacExit(args),
  preferMajorRoads: async (exit, lookup) => (await import('../utils/evacExit')).preferMajorRoads(exit, lookup),
  nearestMajorRoad: async (point, opts) => (await import('../utils/majorRoads')).nearestMajorRoad(point, opts),
};

export const EXIT_LABEL = 'Outside evacuation zone';

const toError = (err) => ({
  kind: err?.kind || 'upstream',
  scope: err?.scope ?? null,
  window: err?.window ?? null,
  retryAfterSec: err?.retryAfterSec ?? null,
});

const validHome = (home) => Boolean(home) && Number.isFinite(home.longitude) && Number.isFinite(home.latitude);

export function useRouteToSafety({ enabled, home, perimetersGeoJSON, evacZonesGeoJSON, hotspotsGeoJSON, deps = DEFAULT_DEPS }) {
  const [state, setState] = useState(INITIAL);
  // Bumped on every new request and on disable; late results from an older
  // generation are dropped (toggle off / tab switch mid-request).
  const genRef = useRef(0);
  const abortRef = useRef(null);
  const lastActionRef = useRef(null);
  // The chosen destination, kept in sync synchronously: From and To can be
  // set in either order, so a start that lands after a destination routes to it.
  const destRef = useRef(null);
  // Bumped per To geocode that runs while no route can start yet.
  const destReqRef = useRef(0);
  // "Nearest Safety Area": once the shelter search lands, route to the top one.
  const autoNearestRef = useRef(false);
  // Latest props/state for stable callbacks (no re-subscribe on data refresh).
  const latest = useRef({});
  latest.current = { enabled, home, perimetersGeoJSON, evacZonesGeoJSON, hotspotsGeoJSON, deps, origin: state.origin, originLabel: state.originLabel, shelters: state.shelters, status: state.status, destination: state.destination };

  const begin = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    genRef.current += 1;
    return { gen: genRef.current, signal: abortRef.current.signal };
  }, []);
  const live = (gen) => gen === genRef.current;

  const search = useCallback(async (origin, originLabel) => {
    const { gen, signal } = begin();
    lastActionRef.current = () => search(origin, originLabel);
    // A new start keeps the chosen destination (either order works).
    setState((s) => ({ ...INITIAL, status: 'searching', origin, originLabel, destination: s.destination }));
    try {
      const { shelters, partial } = await latest.current.deps.findNearestShelters({ origin }, { signal });
      if (!live(gen)) return;
      setState((s) => ({ ...s, status: 'ready', shelters: shelters || [], partial: Boolean(partial) }));
      if (autoNearestRef.current) {
        autoNearestRef.current = false;
        await routeNearestRef.current(origin, shelters);
        return;
      }
      // Destination already chosen: route to it now that there's a start.
      if (destRef.current) await routeToRef.current(destRef.current, origin);
    } catch (err) {
      if (!live(gen) || err?.name === 'AbortError') return;
      setState((s) => ({ ...s, status: 'error', error: toError(err) }));
    }
  }, [begin]);

  const routeTo = useCallback(async (destination, originOverride) => {
    const { deps: d, perimetersGeoJSON: perimeters, evacZonesGeoJSON: evacZones } = latest.current;
    const origin = originOverride || latest.current.origin;
    if (!origin) return;
    destRef.current = destination;
    const { gen, signal } = begin();
    lastActionRef.current = () => routeTo(destination, origin);
    setState((s) => ({ ...s, status: 'routing', destination, route: null, hazardWarning: false, exitZone: null, error: null, picking: false }));
    const dest = [destination.lng, destination.lat];
    try {
      const { avoid, startsInsideHazard } = await d.buildAvoidPolygons({ perimeters, evacZones, origin, destination: dest });
      if (!live(gen)) return;
      const res = await d.requestRoute({ origin, destination: dest, avoid }, { signal });
      if (!live(gen)) return;
      setState((s) => ({
        ...s,
        status: 'routed',
        route: res.route,
        avoidedHazards: Boolean(res.avoidedHazards),
        hazardWarning: Boolean(avoid) && !res.avoidedHazards,
        startsInsideHazard: Boolean(startsInsideHazard),
      }));
    } catch (err) {
      if (!live(gen) || err?.name === 'AbortError') return;
      setState((s) => ({ ...s, status: 'error', error: toError(err) }));
    }
  }, [begin]);
  const routeToRef = useRef(routeTo);
  routeToRef.current = routeTo;

  // Out of an evacuation zone: major-road exits first, then the nearest plain
  // ones, keeping the first route that works. Only "no route" moves on to the
  // next exit; quota and other errors stop, so a failure never burns through
  // several requests. A major-road route passing a fire is held back and only
  // used (with the hazard warning) if nothing else is reachable.
  const routeToExit = useCallback(async (origin, exit) => {
    const { deps: d, perimetersGeoJSON: perimeters, evacZonesGeoJSON: evacZones } = latest.current;
    destRef.current = null;
    const { gen, signal } = begin();
    lastActionRef.current = () => routeToExit(origin, exit);
    setState((s) => ({
      ...s, status: 'routing', destination: null, route: null, avoidedHazards: false, hazardWarning: false,
      startsInsideHazard: false, exitZone: exit.zone, picking: false, error: null,
    }));
    const finish = ({ point, res, avoid, nearFire = false }) => {
      const destination = { lng: point[0], lat: point[1], name: EXIT_LABEL };
      destRef.current = destination;
      setState((s) => ({
        ...s,
        status: 'routed',
        destination,
        route: res.route,
        avoidedHazards: Boolean(res.avoidedHazards),
        hazardWarning: nearFire || (Boolean(avoid) && !res.avoidedHazards),
      }));
    };
    try {
      const candidates = d.preferMajorRoads && exit.pool
        ? await Promise.resolve()
          .then(() => d.preferMajorRoads(exit, (pt) => d.nearestMajorRoad(pt, { signal })))
          .catch(() => exit.candidates)
        : exit.candidates;
      if (!live(gen)) return;
      let heldBack = null;
      for (const { point, major } of candidates) {
        const { avoid } = await d.buildAvoidPolygons({ perimeters, evacZones, origin, destination: point });
        if (!live(gen)) return;
        let res;
        try {
          res = await d.requestRoute({ origin, destination: point, avoid, preference: 'fastest' }, { signal });
        } catch (err) {
          if (err?.kind === 'no_route') continue;
          throw err;
        }
        if (!live(gen)) return;
        if (major && exit.passesFire?.(res.route?.features?.[0]?.geometry?.coordinates)) {
          heldBack ??= { point, res, avoid, nearFire: true };
          continue;
        }
        finish({ point, res, avoid });
        return;
      }
      if (!live(gen)) return;
      if (heldBack) finish(heldBack);
      else setState((s) => ({ ...s, status: 'error', error: { kind: 'no_route' } }));
    } catch (err) {
      if (!live(gen) || err?.name === 'AbortError') return;
      setState((s) => ({ ...s, status: 'error', error: toError(err) }));
    }
  }, [begin]);

  // Nearest Safety Area from a known start: out of the evacuation zone if the
  // start is in one, otherwise to the closest shelter (ranked by drive time).
  // Returns false when there was nothing to route to yet (no shelters loaded).
  const routeNearest = useCallback(async (origin, shelters) => {
    const { deps: d, perimetersGeoJSON: perimeters, evacZonesGeoJSON: evacZones, hotspotsGeoJSON: hotspots } = latest.current;
    const gen = genRef.current;
    const exit = await Promise.resolve()
      .then(() => d.findEvacExit({ origin, evacZones, perimeters, hotspots }))
      .catch(() => null);
    // Another action started while the zone check ran: it wins.
    if (gen !== genRef.current) return true;
    if (exit?.candidates?.length) {
      await routeToExit(origin, exit);
      return true;
    }
    const best = shelters?.[0];
    if (!best) return false;
    await routeTo({ lng: best.lng, lat: best.lat, name: best.name }, origin);
    return true;
  }, [routeTo, routeToExit]);
  const routeNearestRef = useRef(routeNearest);
  routeNearestRef.current = routeNearest;

  // Set the destination; route now if a start is ready, otherwise keep it
  // until one is (no quota spent while waiting).
  const chooseDestination = useCallback((destination) => {
    const { origin, status } = latest.current;
    if (origin && status !== 'locating' && status !== 'searching') return routeTo(destination);
    destRef.current = destination;
    setState((s) => ({ ...s, destination, route: null, picking: false }));
    return undefined;
  }, [routeTo]);

  // Device location. The browser asks for permission here if it hasn't been
  // decided yet; a blocked permission (code 1) is reported as `denied` so the
  // panel can say how to turn it back on. `deviceOnly` skips the Home fallback.
  const locate = useCallback(async ({ deviceOnly = false } = {}) => {
    const { gen } = begin();
    lastActionRef.current = () => locate({ deviceOnly });
    setState((s) => ({ ...INITIAL, status: 'locating', destination: s.destination }));
    let pos;
    let denied = false;
    try {
      pos = await latest.current.deps.getPosition();
    } catch (err) {
      pos = null;
      denied = err?.code === 1;
    }
    if (!live(gen)) return;
    if (pos && Number.isFinite(pos.lng) && Number.isFinite(pos.lat)) {
      await search([pos.lng, pos.lat], 'My location');
      return;
    }
    const { home: h } = latest.current;
    if (!deviceOnly && validHome(h)) {
      await search([h.longitude, h.latitude], h.label || 'Home');
    } else {
      autoNearestRef.current = false;
      setState((s) => ({ ...INITIAL, status: 'error', error: { kind: 'location', denied }, destination: s.destination }));
    }
  }, [begin, search]);

  // "Nearest Safety Area": from the current start → nearest open shelters
  // (ranked by drive time, routes avoiding active hazards) → route to the
  // closest one. The start is whatever From holds:
  //  - a typed address / Home: use it; if its shelters are already loaded,
  //    route straight to the first (Directions only, no new Matrix call);
  //  - My location, or no start yet: get a fresh device fix first;
  //  - a start still loading: route as soon as its shelters land.
  const nearestSafety = useCallback(async () => {
    destRef.current = null;
    destReqRef.current += 1;
    setState((s) => ({ ...s, destination: null }));
    const { origin, originLabel, status, shelters } = latest.current;
    if (status === 'locating' || status === 'searching') {
      autoNearestRef.current = true;
      return;
    }
    if (origin && originLabel !== 'My location') {
      autoNearestRef.current = false;
      if (!(await routeNearest(origin, shelters))) {
        autoNearestRef.current = true;
        await search(origin, originLabel);
      }
      lastActionRef.current = () => nearestSafety();
      return;
    }
    autoNearestRef.current = true;
    await locate({ deviceOnly: true });
    lastActionRef.current = () => nearestSafety();
  }, [locate, search, routeNearest]);

  const searchAddress = useCallback(async (text) => {
    const q = String(text || '').trim();
    if (!q || !latest.current.enabled) return;
    const { gen } = begin();
    lastActionRef.current = () => searchAddress(q);
    // Immediate feedback, and the old route/destination leave the map now.
    setState((s) => ({ ...INITIAL, status: 'locating', originLabel: q, destination: s.destination }));
    const hit = await Promise.resolve()
      .then(() => latest.current.deps.geocode(q))
      .catch(() => null);
    if (!live(gen)) return;
    if (!hit || !Number.isFinite(hit.lng) || !Number.isFinite(hit.lat)) {
      setState((s) => ({ ...s, status: 'error', error: { kind: 'geocode' } }));
      return;
    }
    await search([hit.lng, hit.lat], hit.placeName || q);
  }, [begin, search]);

  // To field, typed text: geocode once (Mapbox, no ORS quota), then one route
  // (1–2 Directions units). Never runs the shelter search; a miss keeps the
  // origin and shelters so "‹ Shelters" still works.
  const routeToAddress = useCallback(async (text) => {
    const q = String(text || '').trim();
    if (!q || !latest.current.enabled) return;
    const { origin, status } = latest.current;
    if (!origin || status === 'locating' || status === 'searching') {
      // No start yet (or it's still loading): resolve the address and keep it
      // as the destination without touching the in-flight start/search.
      destReqRef.current += 1;
      const req = destReqRef.current;
      const hit = await Promise.resolve()
        .then(() => latest.current.deps.geocode(q))
        .catch(() => null);
      if (req !== destReqRef.current || !latest.current.enabled) return;
      if (!hit || !Number.isFinite(hit.lng) || !Number.isFinite(hit.lat)) {
        const busy = latest.current.status === 'locating' || latest.current.status === 'searching';
        if (!busy) setState((s) => ({ ...s, status: 'error', error: { kind: 'geocode' } }));
        return;
      }
      await chooseDestination({ lng: hit.lng, lat: hit.lat, name: hit.placeName || q });
      return;
    }
    const { gen } = begin();
    lastActionRef.current = () => routeToAddress(q);
    setState((s) => ({
      ...s, status: 'routing', destination: null, route: null, avoidedHazards: false, hazardWarning: false,
      startsInsideHazard: false, exitZone: null, picking: false, error: null,
    }));
    const hit = await Promise.resolve()
      .then(() => latest.current.deps.geocode(q))
      .catch(() => null);
    if (!live(gen)) return;
    if (!hit || !Number.isFinite(hit.lng) || !Number.isFinite(hit.lat)) {
      setState((s) => ({ ...s, status: 'error', error: { kind: 'geocode' } }));
      return;
    }
    await routeTo({ lng: hit.lng, lat: hit.lat, name: hit.placeName || q });
  }, [begin, routeTo, chooseDestination]);

  // Enable → locate once. Disable → cancel and reset.
  useEffect(() => {
    if (enabled) {
      locate();
      return undefined;
    }
    abortRef.current?.abort();
    genRef.current += 1;
    destReqRef.current += 1;
    destRef.current = null;
    autoNearestRef.current = false;
    lastActionRef.current = null;
    setState(INITIAL);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => () => {
    abortRef.current?.abort();
    genRef.current += 1;
  }, []);

  // Every action is a no-op while disabled, so nothing can start (and later
  // redraw) after the toggle is off.
  const actions = useMemo(() => {
    const guard = (fn) => (...args) => (latest.current.enabled ? fn(...args) : undefined);
    return {
      useMyLocation: guard(() => locate()),
      nearestSafety: guard(() => nearestSafety()),
      useHome: guard(() => {
        const h = latest.current.home;
        return validHome(h) ? search([h.longitude, h.latitude], h.label || 'Home') : undefined;
      }),
      useAddress: searchAddress,
      // A picked suggestion already carries coordinates: no second geocode,
      // straight to the one shelter search (1 Matrix unit).
      // Re-picking the current start is free unless the last attempt failed.
      useCoordinates: guard(({ lat, lng, label } = {}) => {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
        const { origin, status } = latest.current;
        if (origin && origin[0] === lng && origin[1] === lat && status !== 'error') return undefined;
        return search([lng, lat], label || 'Selected address');
      }),
      // To field, picked suggestion: it already carries coordinates, so no
      // second geocode — straight to one route. Re-picking the destination
      // already routed is free.
      routeToCoordinates: guard(({ lat, lng, label } = {}) => {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
        const { destination, status } = latest.current;
        if (destination && destination.lng === lng && destination.lat === lat && status === 'routed') return undefined;
        return chooseDestination({ lng, lat, name: label || 'Selected address' });
      }),
      routeToAddress: guard((text) => routeToAddress(text)),
      selectShelter: guard((shelter) => routeTo({ lng: shelter.lng, lat: shelter.lat, name: shelter.name })),
      startPick: guard(() => setState((s) => ({ ...s, picking: !s.picking }))),
      // Back to the shelter list already on hand: no new search, no new route.
      backToShelters: guard(() => {
        abortRef.current?.abort();
        genRef.current += 1;
        destRef.current = null;
        setState((s) => ({
          ...s, status: 'ready', destination: null, route: null, avoidedHazards: false, hazardWarning: false,
          startsInsideHazard: false, exitZone: null, picking: false, error: null,
        }));
      }),
      pickPoint: guard(({ lng, lat }) => routeTo({ lng, lat, name: 'Dropped pin' })),
      retry: guard(() => lastActionRef.current?.()),
    };
  }, [locate, nearestSafety, search, routeTo, searchAddress, routeToAddress, chooseDestination]);

  return { ...state, actions };
}
