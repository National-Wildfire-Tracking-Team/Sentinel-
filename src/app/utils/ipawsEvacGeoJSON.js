/**
 * Maps IPAWS CAP alert payloads (from the poller JSON) into EvacuationZonesLayer
 * GeoJSON features with the shared evac schema plus IPAWS-specific properties.
 */

/**
 * Classify a CAP alert's event type and headline into a canonical warning type
 * for use with EvacuationZonesLayer's color-match expression.
 * @param {string|null} event - CAP event type (e.g. "Evacuation Order")
 * @param {string|null} headline - CAP headline text
 * @returns {'Evacuation Order'|'Evacuation Warning'|'Evacuation Watch'}
 */
export function classifyIpaWsSeverity(event, headline) {
  const combined = [event, headline].filter(Boolean).join(' ').toLowerCase();

  if (/\border\b|\bmandatory\b|\bimmediate\b|\bleave now\b/i.test(combined)) {
    return 'Evacuation Order';
  }
  if (/\bwatch\b|\bpotential\b/i.test(combined)) {
    return 'Evacuation Watch';
  }
  return 'Evacuation Warning';
}

/**
 * @param {Array<{ identifier?: string, sender?: string, sent?: string, infos?: object[] }>} alerts
 * @returns {import('geojson').Feature[]}
 */
export function ipawsAlertsToEvacFeatures(alerts) {
  const features = [];
  let seq = 0;
  if (!Array.isArray(alerts)) return features;

  for (const alert of alerts) {
    const identifier = alert.identifier || '';
    const infos = Array.isArray(alert.infos) ? alert.infos : [];
    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      const areas = Array.isArray(info.areas) ? info.areas : [];
      for (let j = 0; j < areas.length; j++) {
        const area = areas[j];
        const geom = area?.geometry;
        if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') || !geom.coordinates?.length) continue;

        const headline = info.headline || info.event || 'IPAWS alert';
        const zoneName = area.areaDesc ? `${headline} — ${area.areaDesc}` : headline;

        features.push({
          type: 'Feature',
          id: `ipaws:${identifier}:${i}:${j}:${seq++}`,
          geometry: geom,
          properties: {
            id: `ipaws-${identifier}-${i}-${j}`,
            warningType: classifyIpaWsSeverity(info.event, info.headline),
            zoneName,
            county: area.areaDesc || '',
            agency: '',
            jurisdiction: '',
            instructions: info.instruction || '',
            comments: info.description || '',
            effectiveDate: info.sent || alert.sent || null,
            expirationDate: info.expires || null,
            externalURL: '',
            source: 'ipaws',
            ipawsIdentifier: identifier,
            ipawsHeadline: headline,
            ipawsDescription: info.description || null,
            ipawsEvent: info.event || null,
            ipawsSent: info.sent || alert.sent || null,
            ipawsExpires: info.expires || null,
            ipawsSenderName: info.senderName || null,
            ipawsInstruction: info.instruction || null,
            ipawsAreaDesc: area.areaDesc || null,
          },
        });
      }
    }
  }
  return features;
}
