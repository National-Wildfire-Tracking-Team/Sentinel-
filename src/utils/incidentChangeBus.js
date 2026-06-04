/**
 * incidentChangeBus.js
 * Lightweight pub/sub bus for in-memory incident change events.
 * Allows useIncidents to immediately notify useIncidentUpdates
 * about field changes without requiring a Supabase round-trip.
 */

const listeners = new Map(); // incidentId → Set<callback>

/**
 * Subscribe to change events for a specific incident.
 * Returns an unsubscribe function.
 */
export function subscribeToIncidentChanges(incidentId, callback) {
  if (!listeners.has(incidentId)) listeners.set(incidentId, new Set());
  listeners.get(incidentId).add(callback);
  return () => listeners.get(incidentId)?.delete(callback);
}

/**
 * Publish a local update for an incident.
 * Called by useIncidents when field changes are detected.
 */
export function publishIncidentChange(incidentId, update) {
  listeners.get(incidentId)?.forEach((cb) => cb(update));
}
