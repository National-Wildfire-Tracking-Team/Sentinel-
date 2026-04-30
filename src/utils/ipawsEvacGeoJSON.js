/**
 * Maps IPAWS CAP alert payloads (from the poller JSON) into EvacZonesLayer GeoJSON
 * features with the shared evac schema plus IPAWS-specific properties.
 */

const WARNING = 'Evacuation Warning';

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
        if (!geom || geom.type !== 'Polygon' || !geom.coordinates?.length) continue;

        const headline = info.headline || info.event || 'IPAWS alert';
        const zoneName = area.areaDesc ? `${headline} — ${area.areaDesc}` : headline;

        features.push({
          type: 'Feature',
          id: `ipaws:${identifier}:${i}:${j}:${seq++}`,
          geometry: geom,
          properties: {
            id: `ipaws-${identifier}-${i}-${j}`,
            warningType: WARNING,
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
