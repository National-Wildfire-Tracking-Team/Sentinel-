/**
 * overviewSummary.js
 * The numbers behind the post-login Overview (LoginOverview): how many fires
 * are still burning, how many evacuation zones and NWS warnings are active,
 * and — when Home Setup is done — whether any of them reach the home radius.
 *
 * "Active fire" is the sidebar's own rule (isActiveFire / filterFeedIncidents)
 * so the Overview, the feed's stat pills and the map's Active Fires filter
 * always agree.
 */

import { filterFeedIncidents } from '../components/Sidebar/incidentFeedFilter';
import { filterByRadius, filterFeatureCollectionByRadius } from './radiusFilter';
import { nwsAlertCategory } from './nwsColors';

/** Quick filter keys the Overview offers; LiveTrackerPage's onQuickFilter handles them. */
export const QUICK_FILTERS = {
  activeFires: 'activeFires',
  allFires:    'allFires',
  allHazards:  'allHazards',
  myArea:      'myArea',
};

/** Home area status, worst first. */
export const AREA_STATUS = {
  affected: 'affected', // an active fire or evacuation zone reaches the home radius
  alerts:   'alerts',   // only NWS alerts cover it
  clear:    'clear',    // nothing in the radius
  unknown:  'unknown',  // no Home Setup to check against
};

/**
 * @param {object} args
 * @param {Array}  args.incidents  sidebar incident objects ({ lat, lng, contained, status, updated })
 * @param {Array}  args.alerts     normalized NWS alerts ({ type, geometry })
 * @param {object} args.evacZones  evacuation-zone FeatureCollection
 * @param {object|null} args.home  Home Setup ({ latitude, longitude, radiusMiles }) or null
 */
export function summarizeOverview({ incidents = [], alerts = [], evacZones = null, home = null, now = Date.now() }) {
  const activeFires = filterFeedIncidents(incidents, 'focused', now);
  const zones = evacZones?.features || [];
  const warnings = alerts.filter((a) => nwsAlertCategory(a?.type) === 'warning');

  const summary = {
    activeFireCount: activeFires.length,
    evacZoneCount: zones.length,
    warningCount: warnings.length,
    area: { status: AREA_STATUS.unknown, fireCount: 0, evacZoneCount: 0, alertCount: 0 },
  };

  const hasHome = Boolean(home)
    && Number.isFinite(home.latitude) && Number.isFinite(home.longitude)
    && Number.isFinite(home.radiusMiles) && home.radiusMiles > 0;
  if (!hasHome) return summary;

  const near = filterByRadius({
    userLatitude: home.latitude,
    userLongitude: home.longitude,
    selectedRadius: home.radiusMiles,
    incidents: activeFires,
    nwsAlerts: alerts,
  });
  const nearZones = filterFeatureCollectionByRadius({ features: zones }, home.latitude, home.longitude, home.radiusMiles);

  const fireCount = near.incidents.length;
  const evacZoneCount = nearZones.features.length;
  const alertCount = near.nwsAlerts.length;
  let status = AREA_STATUS.clear;
  if (fireCount || evacZoneCount) status = AREA_STATUS.affected;
  else if (alertCount) status = AREA_STATUS.alerts;

  summary.area = { status, fireCount, evacZoneCount, alertCount };
  return summary;
}
