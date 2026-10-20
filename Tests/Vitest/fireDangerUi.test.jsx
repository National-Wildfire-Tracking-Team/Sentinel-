/**
 * fireDangerUi.test.jsx
 * Layer rendering, the drawer and the inspection panel for Fire Danger &
 * Fuels, with FireDangerContext and react-map-gl mocked.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeSfp, summarizeSfp } from '../../src/app/api/fireDanger/significantFirePotential';
import { clearCache } from '../../src/app/utils/dataCache';

const layerProps = [];
const sourceProps = [];
let ctx = null;

vi.mock('react-map-gl', () => ({
  Source: ({ children, ...props }) => {
    sourceProps.push(props);
    return children;
  },
  Layer: (props) => {
    layerProps.push(props);
    return null;
  },
  useMap: () => ({ current: null }),
}));

vi.mock('../../src/app/context/FireDangerContext', () => ({
  useFireDangerContext: () => ctx,
}));

const { default: SignificantFirePotentialLayer, SFP_FILL_ID } = await import('../../src/app/components/Map/layers/SignificantFirePotentialLayer');
const { default: FuelModelLayer } = await import('../../src/app/components/Map/layers/FuelModelLayer');
const { default: FireDangerPanel } = await import('../../src/app/components/Map/FireDangerPanel');
const { default: FireDangerPointDetail } = await import('../../src/app/components/FireDetailPanel/FireDangerPointDetail');

const FIXTURE = JSON.parse(readFileSync(resolve(process.cwd(), 'Tests/Vitest/fixtures/nwcgSfpDay1.json'), 'utf8'));
const DATA = normalizeSfp(FIXTURE, 1);

function makeCtx(overrides = {}) {
  return {
    active: true,
    sfpOn: true,
    fuelsOn: false,
    anyOn: true,
    sfp: {
      day: 1,
      data: DATA,
      summary: summarizeSfp(DATA),
      error: null,
      loading: false,
      fetchedAt: '2026-10-20T14:30:00Z',
      freshness: { status: 'partial', expectedDate: '2026-10-20', forecastDate: '2026-10-20' },
    },
    opacity: { sfp: 0.55, fuels: 0.7 },
    setOpacity: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  layerProps.length = 0;
  sourceProps.length = 0;
  clearCache();
  ctx = makeCtx();
});
afterEach(() => vi.restoreAllMocks());

describe('SignificantFirePotentialLayer', () => {
  it('renders nothing while off or before data arrives', () => {
    ctx = makeCtx({ sfpOn: false });
    render(<SignificantFirePotentialLayer />);
    ctx = makeCtx({ sfp: { ...makeCtx().sfp, data: null } });
    render(<SignificantFirePotentialLayer />);
    expect(sourceProps).toHaveLength(0);
  });

  it('draws the areas in their legend colours at the chosen opacity, unrated areas faint', () => {
    render(<SignificantFirePotentialLayer />);
    expect(sourceProps[0].data).toBe(DATA);
    const fill = layerProps.find((l) => l.id === SFP_FILL_ID);
    expect(fill.paint['fill-color']).toEqual(['get', 'sfpColor']);
    expect(fill.paint['fill-opacity']).toEqual(['case', ['!=', ['get', 'sfpClass'], null], 0.55, 0.55 * 0.25]);
    expect(layerProps.find((l) => l.id === 'fire-potential-line-unrated').paint['line-dasharray']).toBeTruthy();
  });
});

describe('FuelModelLayer', () => {
  it('mounts one bounded raster source per LANDFIRE region only while on', () => {
    ctx = makeCtx({ fuelsOn: false });
    render(<FuelModelLayer />);
    expect(sourceProps).toHaveLength(0);

    ctx = makeCtx({ fuelsOn: true });
    render(<FuelModelLayer />);
    expect(sourceProps.map((s) => s.id)).toEqual([
      'landfire-fbfm40-conus-2024', 'landfire-fbfm40-conus-2025', 'landfire-fbfm40-ak-2025', 'landfire-fbfm40-hi-2024', 'landfire-fbfm40-prvi-2024',
    ]);
    expect(sourceProps[0].tiles[0]).toMatch(/^\/api\/arcgis\/lf-conus-2024-tiles\/exportImage\?/);
    expect(sourceProps.every((s) => s.type === 'raster' && s.bounds?.length === 4)).toBe(true);
    expect(layerProps[0].paint).toMatchObject({ 'raster-opacity': 0.7, 'raster-resampling': 'nearest' });
  });
});

describe('FireDangerPanel', () => {
  it('shows partial issuance, retrieval time and the NWCG credit', () => {
    render(<FireDangerPanel />);
    expect(screen.getByText(/3 of 4 areas issued/)).toBeInTheDocument();
    expect(screen.getByText(/Official NWCG product · retrieved/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /NWCG Predictive Services/ })).toHaveAttribute('href', 'https://www.nifc.gov/nicc/predictive-services/outlooks');
  });

  it('offers Retry when the source is unavailable', () => {
    ctx = makeCtx({ sfp: { ...makeCtx().sfp, data: null, summary: null, freshness: null, error: new Error('HTTP 502') } });
    render(<FireDangerPanel />);
    expect(screen.getByText(/Fire potential unavailable: HTTP 502/)).toBeInTheDocument();
    screen.getByRole('button', { name: /Retry/ }).click();
    expect(ctx.retry).toHaveBeenCalled();
  });

  it('says plainly that the fuel map is not fuel moisture', () => {
    ctx = makeCtx({ sfpOn: false, fuelsOn: true });
    render(<FireDangerPanel />);
    expect(screen.getByText(/does not show how dry fuels are now/)).toBeInTheDocument();
  });
});

describe('FireDangerPointDetail', () => {
  it('shows the official rating with its source tag, and the fuel model from LANDFIRE', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ value: '145' }) });
    const sfp = DATA.features.find((f) => f.properties.psa === 'SA21C').properties;
    render(<FireDangerPointDetail fire={{ type: 'fire-danger-point', lat: 33.1, lng: -84.2, sfp, sfpDay: 1, sfpFetchedAt: '2026-10-20T14:30:00Z' }} />);

    expect(screen.getByText('Moderate risk')).toBeInTheDocument();
    expect(screen.getByText('Official forecast')).toBeInTheDocument();
    expect(screen.getByText('SA21C')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/SH5 · High load, dry climate shrub/)).toBeInTheDocument());
    expect(screen.getByText('Static map')).toBeInTheDocument();
    expect(screen.getByText(/no documented source exists yet/)).toBeInTheDocument();
  });

  it('gives an unissued area no rating', () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ value: 'NoData' }) });
    const sfp = DATA.features.find((f) => f.properties.psa === 'NC03A').properties;
    render(<FireDangerPointDetail fire={{ type: 'fire-danger-point', lat: 40, lng: -122, sfp, sfpDay: 1 }} />);
    expect(screen.getByText('Not yet updated for this date')).toBeInTheDocument();
    expect(screen.queryByText(/risk$/)).not.toBeInTheDocument();
  });

  it('reports a LANDFIRE failure instead of leaving a blank', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    render(<FireDangerPointDetail fire={{ type: 'fire-danger-point', lat: 38.5, lng: -120.5, sfp: null, sfpDay: 1 }} />);
    await waitFor(() => expect(screen.getByText(/Couldn't reach LANDFIRE: offline/)).toBeInTheDocument(), { timeout: 4000 });
  });
});
