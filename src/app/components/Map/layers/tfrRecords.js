/**
 * tfrRecords.js
 * Clickable layer id for the FAA TFR layer (TfrLayer) and the record a click
 * on it opens in the detail panel (TfrDetail).
 */

export const TFR_FILL_ID = 'faa-tfr-fill';

/** A clicked TFR area → the record selectFire opens in FireDetailPanel (TfrDetail). */
export function buildTfrRecord(feature, lngLat) {
  const p = feature.properties || {};
  return {
    type: 'tfr',
    id: `tfr-${p.notam}`,
    name: `TFR ${p.notam}`,
    notam: p.notam,
    title: p.title,
    tfrType: p.type,
    state: p.state,
    facility: p.facility,
    modified: p.modified,
    lat: lngLat.lat,
    lng: lngLat.lng,
  };
}
