import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCombinedEvacZones } from '../../src/app/hooks/useCombinedEvacZones';
import { fetchCAEvacZones } from '../../src/app/api/caEvacZones';

vi.mock('../../src/app/api/caEvacZones');

const hostedFeature = {
  type: 'Feature',
  id: 'hosted-1',
  geometry: { type: 'Polygon', coordinates: [] },
  properties: {
    id: 1,
    zoneName: 'Active Zone',
    warningType: 'Evacuation Warning',
    county: 'Test',
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
  fetchCAEvacZones.mockResolvedValue({
    type: 'FeatureCollection',
    features: [hostedFeature],
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ alerts: [] }),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useCombinedEvacZones', () => {
  it('uses the active hosted view without fetching archival PROD zones', async () => {
    const { result } = renderHook(() => useCombinedEvacZones(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchCAEvacZones).toHaveBeenCalledOnce();
    expect(result.current.geoJSON.features).toHaveLength(1);
    expect(result.current.geoJSON.features[0].properties).toMatchObject({
      zoneName: 'Active Zone',
      source: 'hosted',
    });
  });

  it('removes IPAWS alerts omitted from a successful feed snapshot', async () => {
    const ipawsAlert = {
      identifier: 'ipaws-1',
      status: 'Actual',
      msgType: 'Alert',
      infos: [{
        event: 'Evacuation Order',
        expires: new Date(Date.now() + 60_000).toISOString(),
        areas: [{
          areaDesc: 'Test County',
          geometry: {
            type: 'Polygon',
            coordinates: [[[-120, 38], [-120, 39], [-119, 39], [-120, 38]]],
          },
        }],
      }],
    };
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ alerts: [ipawsAlert] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ alerts: [] }) });

    const { result } = renderHook(() => useCombinedEvacZones(true));
    await waitFor(() => expect(result.current.geoJSON.features).toHaveLength(2));

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.geoJSON.features).toHaveLength(1));
    expect(result.current.geoJSON.features[0].properties.source).toBe('hosted');
  });
});