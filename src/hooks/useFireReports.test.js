import { describe, it, expect, vi } from 'vitest';
import {
  reportsToGeoJSON,
  submitFireReport,
  setReportStatus,
  createNIFCFireUpdate,
  updateFireReport,
  deleteFireReport,
  createExternalFireUpdate,
  appendFireReportUpdate,
} from './useFireReports';

const { supabaseMock, mockChain } = vi.hoisted(() => {
  const mockChain = () => {
    const c = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'mock-id' }, error: null }),
      then(resolve) { resolve({ data: null, error: null }); },
    };
    return c;
  };
  return {
    mockChain,
    supabaseMock: {
      from: vi.fn(() => mockChain()),
      channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnValue({}) })),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('../api/supabaseClient', () => ({
  supabase: supabaseMock,
  isSupabaseConfigured: true,
  REMEMBER_ME_KEY: 'sentinel_rmb',
}));

describe('reportsToGeoJSON', () => {
  it('converts reports to GeoJSON FeatureCollection', () => {
    const reports = [
      { id: '1', title: 'Fire A', latitude: '34.5', longitude: '-118.3', status: 'approved', created_at: '2025-01-01', user_id: 'u1' },
    ];
    const geojson = reportsToGeoJSON(reports);
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry.coordinates).toEqual([-118.3, 34.5]);
    expect(geojson.features[0].properties.title).toBe('Fire A');
  });

  it('filters out reports with invalid coordinates', () => {
    const reports = [
      { id: '1', latitude: 'invalid', longitude: '-118.3' },
      { id: '2', latitude: '34.5', longitude: NaN },
      { id: '3', latitude: '34.5', longitude: '-118.3' },
    ];
    expect(reportsToGeoJSON(reports).features).toHaveLength(1);
  });

  it('handles null input', () => {
    expect(reportsToGeoJSON(null).features).toEqual([]);
  });

  it('handles undefined input', () => {
    expect(reportsToGeoJSON(undefined).features).toEqual([]);
  });
});

describe('submitFireReport', () => {
  it('inserts a report and returns it', async () => {
    const c = mockChain();
    c.single.mockResolvedValue({ data: { id: 'new-123' }, error: null });
    supabaseMock.from.mockReturnValue(c);

    const result = await submitFireReport({ title: 'Fire', description: 'desc', latitude: 34, longitude: -118, userId: 'u1' });

    expect(result.id).toBe('new-123');
    expect(result.title).toBe('Fire');
    expect(result.status).toBe('approved');
    expect(supabaseMock.from).toHaveBeenCalledWith('fire_reports');
  });
});

describe('setReportStatus', () => {
  it('updates the report status', async () => {
    const result = await setReportStatus('123', 'rejected');
    expect(result).toEqual({ id: '123', status: 'rejected' });
  });
});

describe('updateFireReport', () => {
  it('throws when no fields provided', async () => {
    await expect(updateFireReport('1', {})).rejects.toThrow('No fields to update');
  });

  it('updates provided fields only', async () => {
    const result = await updateFireReport('1', { title: 'New Title' });
    expect(result).toEqual({ id: '1', title: 'New Title' });
  });
});

describe('deleteFireReport', () => {
  it('deletes the report', async () => {
    const result = await deleteFireReport('123');
    expect(result).toEqual({ id: '123' });
  });
});

describe('createNIFCFireUpdate', () => {
  it('throws when no acreage or notes provided', async () => {
    await expect(
      createNIFCFireUpdate({ fireName: 'X', latitude: 1, longitude: 2, userId: 'u' })
    ).rejects.toThrow('Please provide acreage or notes');
  });

  it('creates a report with NIFC source', async () => {
    const result = await createNIFCFireUpdate({
      fireName: 'Creek Fire',
      latitude: 37.0,
      longitude: -119.5,
      userId: 'user-1',
      acreage: 500,
      notes: 'Active spotting',
      nifcId: 'NIFC-123',
    });

    expect(result.title).toBe('Creek Fire');
    expect(result.description).toContain('SOURCE: NIFC (NIFC-123)');
    expect(result.description).toContain('Acreage: 500');
    expect(result.description).toContain('Notes: Active spotting');
    expect(result.status).toBe('approved');
  });
});

describe('createExternalFireUpdate', () => {
  it('throws when no acreage or notes provided', async () => {
    await expect(
      createExternalFireUpdate({ fireName: 'X', latitude: 1, longitude: 2, userId: 'u' })
    ).rejects.toThrow('Please provide acreage or notes');
  });

  it('creates a report with custom source', async () => {
    const result = await createExternalFireUpdate({
      fireName: 'IRWIN Fire',
      latitude: 35,
      longitude: -120,
      userId: 'u1',
      acreage: 200,
      source: 'IRWIN',
      externalId: 'IR-456',
    });

    expect(result.description).toContain('SOURCE: IRWIN (IR-456)');
  });
});

describe('appendFireReportUpdate', () => {
  it('throws when no fields provided', async () => {
    await expect(
      appendFireReportUpdate({ id: '1', description: 'old' })
    ).rejects.toThrow('Please provide acreage, containment, or notes');
  });

  it('appends update block to existing description', async () => {
    const result = await appendFireReportUpdate({
      id: '1',
      description: 'Original description',
      acreage: 1000,
      containment: 50,
      notes: 'Making progress',
    });

    expect(result.description).toContain('Original description');
    expect(result.description).toContain('Acreage: 1000');
    expect(result.description).toContain('Containment: 50%');
    expect(result.description).toContain('Notes: Making progress');
  });

  it('clamps containment to 0-100', async () => {
    const result = await appendFireReportUpdate({
      id: '1',
      description: 'old',
      containment: 150,
    });

    expect(result.description).toContain('Containment: 100%');
  });
});
