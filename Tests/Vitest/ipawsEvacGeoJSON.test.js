import { describe, it, expect } from 'vitest';
import { ipawsAlertsToEvacFeatures, classifyIpaWsSeverity } from '../../src/utils/ipawsEvacGeoJSON';

describe('classifyIpaWsSeverity', () => {
  it('classifies Evacuation Order from event type and headline', () => {
    expect(classifyIpaWsSeverity('Evacuation Order', 'Mandatory Evacuation')).toBe('Evacuation Order');
  });

  it('classifies Evacuation Warning', () => {
    expect(classifyIpaWsSeverity('Evacuation Warning', 'Be Prepared')).toBe('Evacuation Warning');
  });

  it('classifies Evacuation Watch from watch keyword', () => {
    expect(classifyIpaWsSeverity('Severe Weather Watch', null)).toBe('Evacuation Watch');
  });

  it('defaults to Evacuation Warning for unknown types', () => {
    expect(classifyIpaWsSeverity(null, null)).toBe('Evacuation Warning');
  });

  it('detects order keywords in headline when event is generic', () => {
    expect(classifyIpaWsSeverity('Civil Emergency', 'IMMEDIATE EVACUATION')).toBe('Evacuation Order');
  });

  it('detects mandatory as order via headline', () => {
    expect(classifyIpaWsSeverity('Local Area Emergency', 'Mandatory Evacuation Orders Issued')).toBe('Evacuation Order');
  });

  it('classifies from headline only when event is null', () => {
    expect(classifyIpaWsSeverity(null, 'Potential Evacuation Watch')).toBe('Evacuation Watch');
  });

  it('classifies from event only when headline is null', () => {
    expect(classifyIpaWsSeverity('Evacuation Immediate', null)).toBe('Evacuation Order');
  });
});

describe('ipawsAlertsToEvacFeatures', () => {
  it('returns empty array for non-array input', () => {
    expect(ipawsAlertsToEvacFeatures(null)).toEqual([]);
    expect(ipawsAlertsToEvacFeatures(undefined)).toEqual([]);
    expect(ipawsAlertsToEvacFeatures('string')).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(ipawsAlertsToEvacFeatures([])).toEqual([]);
  });

  it('converts valid alerts to GeoJSON features', () => {
    const alerts = [
      {
        identifier: 'alert-1',
        sent: '2025-06-15T12:00:00Z',
        infos: [
          {
            headline: 'Evacuation Order',
            event: 'Evacuation Order',
            description: 'Immediate evacuation required',
            instruction: 'Leave immediately',
            sent: '2025-06-15T12:00:00Z',
            expires: '2025-06-16T12:00:00Z',
            senderName: 'County Sheriff',
            areas: [
              {
                areaDesc: 'Zone A',
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [-120, 37],
                      [-119, 37],
                      [-119, 38],
                      [-120, 38],
                      [-120, 37],
                    ],
                  ],
                },
              },
            ],
          },
        ],
      },
    ];

    const features = ipawsAlertsToEvacFeatures(alerts);
    expect(features).toHaveLength(1);
    expect(features[0].type).toBe('Feature');
    expect(features[0].geometry.type).toBe('Polygon');
    expect(features[0].properties.source).toBe('ipaws');
    expect(features[0].properties.warningType).toBe('Evacuation Order');
    expect(features[0].properties.zoneName).toContain('Evacuation Order');
  });

  it('skips areas without geometry', () => {
    const alerts = [
      {
        identifier: 'alert-1',
        infos: [
          {
            headline: 'Alert',
            areas: [
              { areaDesc: 'Zone A' },
            ],
          },
        ],
      },
    ];

    expect(ipawsAlertsToEvacFeatures(alerts)).toEqual([]);
  });

  it('skips unsupported geometry types (Point)', () => {
    const alerts = [
      {
        identifier: 'alert-1',
        infos: [
          {
            headline: 'Alert',
            areas: [
              {
                geometry: {
                  type: 'Point',
                  coordinates: [-120, 37],
                },
              },
            ],
          },
        ],
      },
    ];

    expect(ipawsAlertsToEvacFeatures(alerts)).toEqual([]);
  });

  it('accepts MultiPolygon geometry', () => {
    const alerts = [
      {
        identifier: 'alert-1',
        sent: '2025-06-15T12:00:00Z',
        infos: [
          {
            headline: 'MultiPolygon Alert',
            event: 'Test',
            areas: [
              {
                areaDesc: 'Multi Zone',
                geometry: {
                  type: 'MultiPolygon',
                  coordinates: [
                    [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
                    [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]],
                  ],
                },
              },
            ],
          },
        ],
      },
    ];

    const features = ipawsAlertsToEvacFeatures(alerts);
    expect(features).toHaveLength(1);
    expect(features[0].geometry.type).toBe('MultiPolygon');
  });

  it('handles alerts with no infos array', () => {
    const alerts = [{ identifier: 'alert-1' }];
    expect(ipawsAlertsToEvacFeatures(alerts)).toEqual([]);
  });

  it('generates unique IDs for multiple areas', () => {
    const alerts = [
      {
        identifier: 'alert-1',
        infos: [
          {
            headline: 'Alert',
            areas: [
              {
                areaDesc: 'Zone A',
                geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
              },
              {
                areaDesc: 'Zone B',
                geometry: { type: 'Polygon', coordinates: [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]] },
              },
            ],
          },
        ],
      },
    ];

    const features = ipawsAlertsToEvacFeatures(alerts);
    expect(features).toHaveLength(2);
    expect(features[0].id).not.toBe(features[1].id);
  });
});
