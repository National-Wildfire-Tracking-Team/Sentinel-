/**
 * useProximityAlerts.js
 * Watches the user's saved zip codes for new NWS weather alerts and newly
 * active fire incidents within range, so they find out without having to
 * keep the Manage Zip Codes page open. Diffs against what's already been
 * surfaced (persisted to localStorage) so a reload doesn't re-notify for
 * things the user has already seen, and optionally fires a browser
 * Notification when permission has been granted.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLocationAlerts } from './useSavedLocations';
import { haversineMiles } from '../utils/geoDistance';

const PROXIMITY_MILES = 25;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const SEEN_STORAGE_KEY = 'nwtt-proximity-seen';
const HISTORY_STORAGE_KEY = 'nwtt-proximity-history';
const HISTORY_LIMIT = 30;

function loadSeen() {
  if (typeof window === 'undefined') return {};
  try {
    const stored = JSON.parse(window.localStorage.getItem(SEEN_STORAGE_KEY));
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
}

function saveSeen(seen) {
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // localStorage unavailable — notifications still fire for this session
  }
}

function loadHistory() {
  if (typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage unavailable — history just won't survive a reload
  }
}

/** Browser Notification permission state + a user-gesture-safe request(). */
export function useNotificationPermission() {
  const [permission, setPermission] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  const request = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'unsupported';
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  return { permission, request };
}

/**
 * @param {Array} savedLocations  from useSavedLocations() — {id, name, latitude, longitude, alerts_enabled}
 * @param {Array} incidents       from useIncidents()/useMergedFireData() — {id, name, lat, lng, acres, status}
 */
export function useProximityAlerts(savedLocations, incidents) {
  const [events, setEvents] = useState([]);
  const [history, setHistory] = useState(() => loadHistory());
  const seenRef = useRef(loadSeen());

  const dismiss = useCallback((key) => {
    setEvents((prev) => prev.filter((e) => e.key !== key));
  }, []);

  const markAllRead = useCallback(() => {
    setHistory((prev) => {
      if (prev.every((e) => e.read)) return prev;
      const next = prev.map((e) => ({ ...e, read: true }));
      saveHistory(next);
      return next;
    });
  }, []);

  const unreadCount = history.filter((e) => !e.read).length;

  useEffect(() => {
    if (!savedLocations?.length) return undefined;

    let cancelled = false;
    let running = false;

    async function check() {
      if (running) return;
      running = true;
      const seen = seenRef.current;
      const freshEvents = [];

      for (const loc of savedLocations) {
        if (loc.alerts_enabled === false) continue;
        const lat = Number(loc.latitude);
        const lng = Number(loc.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const locSeen = seen[loc.id] || { alertIds: [], incidentIds: [] };

        let alerts;
        try {
          alerts = await fetchLocationAlerts(lat, lng);
        } catch {
          alerts = [];
        }
        for (const alert of alerts) {
          if (!locSeen.alertIds.includes(alert.id)) {
            freshEvents.push({
              key: `alert-${loc.id}-${alert.id}`,
              kind: 'alert',
              locationName: loc.name,
              title: alert.headline || alert.type,
            });
          }
        }

        const nearbyIncidents = (incidents || []).filter((inc) => {
          if (inc.status === 'controlled') return false;
          if (!Number.isFinite(inc.lat) || !Number.isFinite(inc.lng)) return false;
          return haversineMiles([lng, lat], [inc.lng, inc.lat]) <= PROXIMITY_MILES;
        });
        for (const inc of nearbyIncidents) {
          if (!locSeen.incidentIds.includes(inc.id)) {
            freshEvents.push({
              key: `incident-${loc.id}-${inc.id}`,
              kind: 'incident',
              locationName: loc.name,
              title: `${inc.name} — ${inc.acres.toLocaleString()} acres within ${PROXIMITY_MILES}mi`,
            });
          }
        }

        seen[loc.id] = { alertIds: alerts.map((a) => a.id), incidentIds: nearbyIncidents.map((i) => i.id) };
      }

      if (cancelled) return;
      saveSeen(seen);
      if (freshEvents.length) {
        setEvents((prev) => [...prev, ...freshEvents]);
        setHistory((prev) => {
          const stamped = freshEvents.map((e) => ({ ...e, timestamp: Date.now(), read: false }));
          const next = [...stamped, ...prev].slice(0, HISTORY_LIMIT);
          saveHistory(next);
          return next;
        });
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          for (const evt of freshEvents) {
            new Notification(`Sentinel — ${evt.locationName}`, { body: evt.title });
          }
        }
      }
      running = false;
    }

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [savedLocations, incidents]);

  return { events, dismiss, history, unreadCount, markAllRead };
}
