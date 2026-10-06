import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { SatelliteProvider, satellitePanelOpenAfter, useSatelliteContext } from '../../src/app/context/SatelliteContext';
import SatellitePanel from '../../src/app/components/Map/SatellitePanel';
import GOESLayer from '../../src/app/components/Map/layers/GOESLayer';
import { SatelliteLegendSection } from '../../src/app/components/Legend/Legend';

vi.mock('react-map-gl', () => ({
  Source: ({ id, tiles, children }) => <div data-testid="source" data-id={id} data-tiles={tiles[0]}>{children}</div>,
  Layer: ({ id, paint }) => <div data-testid="layer" data-id={id} data-opacity={paint['raster-opacity']} />,
  useMap: () => ({ current: null }),
}));

vi.mock('../../src/app/context/AppContext', () => ({
  useApp: vi.fn(() => ({ layers: { satellite: true }, legendOpen: true, layerPanelOpen: false })),
}));

const SCAN = '2026-10-05T14:56:17Z';
const DOMAIN = '<Domains><Domain>2026-10-05T13:00:00Z/2026-10-05T14:20:00Z/PT10M</Domain></Domains>';

function mockSources({ iem = 'ok', gibs = 'ok' } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('/data/gis/images/GOES/')) {
      if (iem === 'down') throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ meta: { valid: SCAN } }));
    }
    if (u.includes('gibs.earthdata.nasa.gov')) {
      if (gibs === 'down') return new Response('', { status: 503 });
      return new Response(DOMAIN);
    }
    throw new Error(`unexpected fetch ${u}`);
  });
}

/** The page's wiring: layer toggles drive whether the panel is open. */
function Page({ layers }) {
  const [open, setOpen] = useState(false);
  const prev = useRef({});
  useEffect(() => {
    const before = prev.current;
    prev.current = layers;
    setOpen((o) => satellitePanelOpenAfter(before, layers, o));
  }, [layers]);
  return (
    <SatelliteProvider active={Boolean(layers.satellite)} panelOpen={open} onPanelOpenChange={setOpen}>
      <SatellitePanel />
      <GOESLayer />
      <SatelliteLegendSection />
      <Probe />
    </SatelliteProvider>
  );
}

let probe;
function Probe() { probe = useSatelliteContext(); return null; }

const sources = () => screen.queryAllByTestId('source');
const liveTiles = () => screen.getByTestId('source').getAttribute('data-tiles');

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});
afterEach(() => vi.restoreAllMocks());

describe('Satellite panel', () => {
  it('pops open when Satellite is selected and shows the default imagery', async () => {
    mockSources();
    const { rerender } = render(<Page layers={{ satellite: false }} />);
    expect(screen.queryByRole('group', { name: 'Satellite controls' })).toBeNull();
    expect(sources()).toHaveLength(0);

    rerender(<Page layers={{ satellite: true }} />);
    expect(screen.getByRole('group', { name: 'Satellite controls' })).toBeInTheDocument();
    expect(screen.getByLabelText('Satellite')).toHaveValue('goes-east');
    expect(screen.getByLabelText('Region')).toHaveValue('conus');
    expect(screen.getByLabelText('Band')).toHaveValue('visible');
    expect(liveTiles()).toContain('LAYERS=conus_ch02');
    await waitFor(() => expect(screen.getByText(/^Latest: /)).toHaveTextContent(/Latest: .*(AM|PM)/));
  });

  it('closes when another layer with controls is selected, leaving the imagery on', () => {
    mockSources();
    const { rerender } = render(<Page layers={{ satellite: false }} />);
    rerender(<Page layers={{ satellite: true }} />);
    rerender(<Page layers={{ satellite: true, spcWeatherOutlooks: true }} />);
    expect(screen.queryByRole('group', { name: 'Satellite controls' })).toBeNull();
    expect(sources()).toHaveLength(1);
  });

  it('stays open while changing satellite, region and band, and updates the map each time', async () => {
    mockSources();
    const { rerender } = render(<Page layers={{ satellite: false }} />);
    rerender(<Page layers={{ satellite: true }} />);

    fireEvent.change(screen.getByLabelText('Band'), { target: { value: 'clean-ir' } });
    expect(liveTiles()).toContain('LAYERS=conus_ch13');

    fireEvent.change(screen.getByLabelText('Satellite'), { target: { value: 'goes-west' } });
    expect(screen.getByLabelText('Region')).toHaveValue('pacus');
    expect(liveTiles()).toContain('goes_west.cgi');

    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'alaska' } });
    expect(liveTiles()).toContain('LAYERS=alaska_ch13');

    fireEvent.change(screen.getByLabelText('Band'), { target: { value: 'true-color' } });
    await waitFor(() => expect(liveTiles()).toContain('GOES-West_ABI_GeoColor/default/2026-10-05T14:20:00Z/'));

    // One source at a time: the previous imagery was removed, not stacked.
    expect(sources()).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Satellite controls' })).toBeInTheDocument();
    expect(window.location.search).toBe('?sat=goes-west&sat_region=alaska&sat_product=true-color');
  });

  it('lists only the regions the selected satellite covers', () => {
    mockSources();
    const { rerender } = render(<Page layers={{}} />);
    rerender(<Page layers={{ satellite: true }} />);
    const regionOptions = () => within(screen.getByLabelText('Region')).getAllByRole('option').map((o) => o.value);
    expect(regionOptions()).toContain('gulf');
    expect(regionOptions()).not.toContain('alaska');
    fireEvent.change(screen.getByLabelText('Satellite'), { target: { value: 'goes-west' } });
    expect(regionOptions()).toContain('alaska');
    expect(regionOptions()).not.toContain('gulf');
  });

  it('disables products a region does not have, and explains a forced change', () => {
    mockSources();
    const { rerender } = render(<Page layers={{}} />);
    rerender(<Page layers={{ satellite: true }} />);
    fireEvent.change(screen.getByLabelText('Band'), { target: { value: 'true-color' } });
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'meso1' } });
    expect(screen.getByLabelText('Band')).toHaveValue('visible');
    expect(screen.getByText(/True Color isn't available for Mesoscale 1/)).toBeInTheDocument();
    const trueColor = within(screen.getByLabelText('Band')).getByRole('option', { name: /True Color/ });
    expect(trueColor).toBeDisabled();
  });

  it('shows a loading state, then a clear error with retry when imagery is unavailable', async () => {
    mockSources({ iem: 'down' });
    const { rerender } = render(<Page layers={{}} />);
    rerender(<Page layers={{ satellite: true }} />);
    expect(screen.getByLabelText('Loading imagery')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Satellite imagery temporarily unavailable.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
  });

  it('reports failing tiles as unavailable rather than leaving the map blank', async () => {
    mockSources();
    const { rerender } = render(<Page layers={{}} />);
    rerender(<Page layers={{ satellite: true }} />);
    act(() => probe.reportTileError());
    expect(screen.getByText('Satellite imagery temporarily unavailable.')).toBeInTheDocument();
  });

  it('loops recent GIBS frames with the shared scrubber, preloading ahead', async () => {
    mockSources();
    const { rerender } = render(<Page layers={{}} />);
    rerender(<Page layers={{ satellite: true }} />);
    await waitFor(() => expect(screen.getByLabelText('Satellite time')).toBeInTheDocument());
    const slider = screen.getByLabelText('Satellite time');
    expect(slider).toHaveAttribute('max', '5'); // 1h of 10-minute frames

    fireEvent.change(slider, { target: { value: '0' } });
    const frames = sources();
    expect(frames.length).toBe(4); // the frame shown + 3 ahead
    expect(frames[0].getAttribute('data-tiles')).toContain('GOES-East_ABI_Band2_Red_Visible_1km/default/2026-10-05T13:30:00Z/');
    const opacities = screen.getAllByTestId('layer').map((l) => Number(l.getAttribute('data-opacity')));
    expect(opacities.filter((o) => o > 0)).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(liveTiles()).toContain('LAYERS=conus_ch02');
  });

  it('says when a product has no loop', () => {
    mockSources();
    const { rerender } = render(<Page layers={{}} />);
    rerender(<Page layers={{ satellite: true }} />);
    fireEvent.change(screen.getByLabelText('Band'), { target: { value: 'upper-wv' } });
    expect(screen.getByText(/Latest scan only/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Satellite time')).toBeNull();
  });

  it('updates the legend with the product', () => {
    mockSources();
    const { rerender } = render(<Page layers={{}} />);
    rerender(<Page layers={{ satellite: true }} />);
    expect(screen.getByText('GOES-East Visible')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Band'), { target: { value: 'mid-wv' } });
    expect(screen.getByText('GOES-East Mid Water Vapor')).toBeInTheDocument();
    expect(screen.getByText('Moist / cold')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Band'), { target: { value: 'shortwave-ir' } });
    expect(screen.getByText(/active fires show as small dark hot spots/)).toBeInTheDocument();
  });

  it('opens a shared link on its selection and explains anything invalid in it', () => {
    mockSources();
    window.history.replaceState(null, '', '/?sat=goes-west&sat_region=gulf&sat_product=clean-ir');
    const { rerender } = render(<Page layers={{}} />);
    rerender(<Page layers={{ satellite: true }} />);
    expect(screen.getByLabelText('Satellite')).toHaveValue('goes-west');
    expect(screen.getByLabelText('Band')).toHaveValue('clean-ir');
    expect(screen.getByLabelText('Region')).toHaveValue('pacus');
    expect(screen.getByText(/Gulf of America isn't available from GOES-West/)).toBeInTheDocument();
  });

  it('removes its URL keys and imagery when the layer is switched off', () => {
    mockSources();
    const { rerender } = render(<Page layers={{}} />);
    rerender(<Page layers={{ satellite: true }} />);
    expect(window.location.search).toContain('sat=goes-east');
    rerender(<Page layers={{ satellite: false }} />);
    expect(window.location.search).toBe('');
    expect(sources()).toHaveLength(0);
  });
});
