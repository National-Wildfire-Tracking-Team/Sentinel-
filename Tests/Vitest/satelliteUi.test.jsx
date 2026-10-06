import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { SatelliteProvider, satellitePanelOpenAfter, useSatelliteContext } from '../../src/app/context/SatelliteContext';
import SatellitePanel, { SatelliteShowControlsPill } from '../../src/app/components/Map/SatellitePanel';
import GOESLayer from '../../src/app/components/Map/layers/GOESLayer';
import SatelliteStormFocus from '../../src/app/components/Map/SatelliteStormFocus';
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
function Page({ layers, overlays, selected = null }) {
  const [open, setOpen] = useState(false);
  const prev = useRef({});
  useEffect(() => {
    const before = prev.current;
    prev.current = layers;
    setOpen((o) => satellitePanelOpenAfter(before, layers, o));
  }, [layers]);
  return (
    <SatelliteProvider active={Boolean(layers.satellite)} panelOpen={open} onPanelOpenChange={setOpen}>
      <SatellitePanel overlays={overlays} />
      <SatelliteShowControlsPill />
      <SatelliteStormFocus selected={selected} />
      <GOESLayer />
      <SatelliteLegendSection />
      <Probe />
    </SatelliteProvider>
  );
}

let probe;
// Test-only capture of the live context value so assertions can read it.
// eslint-disable-next-line react-hooks/globals
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
    expect(screen.getByLabelText('Satellite and region')).toHaveValue('goes-east:conus');
    expect(screen.getByLabelText('Band')).toHaveValue('visible');
    expect(liveTiles()).toContain('LAYERS=conus_ch02');
    await waitFor(() => expect(screen.queryByLabelText('Loading imagery')).toBeNull());
    // The pickers are the header; there's no separate summary or scan-time row.
    expect(screen.queryByText(/^Latest: /)).toBeNull();
    expect(screen.queryByText(/GOES-East · CONUS · Visible/)).toBeNull();
  });

  it('hides its controls from beside Recent loop, and a pill brings them back', async () => {
    mockSources();
    const { rerender } = render(<Page layers={{ satellite: false }} />);
    rerender(<Page layers={{ satellite: true }} />);
    expect(screen.queryByRole('button', { name: 'Show controls' })).toBeNull();
    await waitFor(() => expect(screen.getByText('Recent loop')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Hide controls' }));
    expect(screen.queryByRole('group', { name: 'Satellite controls' })).toBeNull();
    expect(sources()).toHaveLength(1); // imagery stays on

    fireEvent.click(screen.getByRole('button', { name: 'Show controls' }));
    expect(screen.getByRole('group', { name: 'Satellite controls' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show controls' })).toBeNull();
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

    fireEvent.change(screen.getByLabelText('Satellite and region'), { target: { value: 'goes-west:pacus' } });
    expect(screen.getByLabelText('Satellite and region')).toHaveValue('goes-west:pacus');
    expect(liveTiles()).toContain('goes_west.cgi');

    fireEvent.change(screen.getByLabelText('Satellite and region'), { target: { value: 'goes-west:alaska' } });
    expect(liveTiles()).toContain('LAYERS=alaska_ch13');

    fireEvent.change(screen.getByLabelText('Band'), { target: { value: 'true-color' } });
    await waitFor(() => expect(liveTiles()).toContain('GOES-West_ABI_GeoColor/default/2026-10-05T14:20:00Z/'));

    // One source at a time: the previous imagery was removed, not stacked.
    expect(sources()).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Satellite controls' })).toBeInTheDocument();
    expect(window.location.search).toBe('?sat=goes-west&sat_region=alaska&sat_product=true-color');
  });

  it('lists every GOES-East scan sector, then every GOES-West one, and no zoom-to areas', () => {
    mockSources();
    const { rerender } = render(<Page layers={{}} />);
    rerender(<Page layers={{ satellite: true }} />);
    const picker = screen.getByLabelText('Satellite and region');
    const groups = within(picker).getAllByRole('group').map((g) => g.getAttribute('label'));
    expect(groups).toEqual(['GOES-East (GOES-19)', 'GOES-West (GOES-18)']);
    const values = within(picker).getAllByRole('option').map((o) => o.value);
    expect(values).toEqual([
      'goes-east:conus', 'goes-east:fulldisk', 'goes-east:meso1', 'goes-east:meso2', 'goes-east:puerto-rico',
      'goes-west:pacus', 'goes-west:fulldisk', 'goes-west:meso1', 'goes-west:meso2', 'goes-west:alaska', 'goes-west:hawaii',
    ]);
  });

  it('disables products a region does not have, and explains a forced change', () => {
    mockSources();
    const { rerender } = render(<Page layers={{}} />);
    rerender(<Page layers={{ satellite: true }} />);
    fireEvent.change(screen.getByLabelText('Band'), { target: { value: 'true-color' } });
    fireEvent.change(screen.getByLabelText('Satellite and region'), { target: { value: 'goes-east:meso1' } });
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
    expect(screen.getByLabelText('Satellite and region')).toHaveValue('goes-west:pacus');
    expect(screen.getByLabelText('Band')).toHaveValue('clean-ir');
    expect(screen.getByText(/Gulf of America isn't available from GOES-West/)).toBeInTheDocument();
  });

  it('still shows a zoom-to area a shared link opened on', () => {
    mockSources();
    window.history.replaceState(null, '', '/?sat=goes-east&sat_region=gulf&sat_product=visible');
    const { rerender } = render(<Page layers={{}} />);
    rerender(<Page layers={{ satellite: true }} />);
    expect(screen.getByLabelText('Satellite and region')).toHaveValue('goes-east:gulf');
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

  it('summarizes NWS alerts and NHC systems on the imagery, with alert toggle and zoom to tropics', () => {
    mockSources();
    const onToggle = vi.fn();
    const overlays = {
      alerts: { on: true, count: 12, onToggle },
      tropical: { storms: 1, areas: 2, bounds: [-80, 10, -40, 30] },
    };
    const { rerender } = render(<Page layers={{}} overlays={overlays} />);
    rerender(<Page layers={{ satellite: true }} overlays={overlays} />);

    const alerts = screen.getByRole('button', { name: /NWS alerts · 12/ });
    expect(alerts).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(alerts);
    expect(onToggle).toHaveBeenCalledTimes(1);

    expect(screen.getByText('1 storm · 2 areas of interest')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /zoom to tropics/i }));
    expect(probe.focus.bounds).toEqual([-80, 10, -40, 30]);
  });

  it('says when there are no tropical systems and hides the zoom button', () => {
    mockSources();
    const overlays = { alerts: null, tropical: { storms: 0, areas: 0, bounds: null } };
    const { rerender } = render(<Page layers={{}} overlays={overlays} />);
    rerender(<Page layers={{ satellite: true }} overlays={overlays} />);
    expect(screen.getByText('No active tropical systems')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /zoom to tropics/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /NWS alerts/ })).toBeNull();
  });

  it('points the imagery at a selected storm: right satellite, view and GeoColor', () => {
    mockSources();
    const rachel = { id: 'nhc-storm-EP3', type: 'nhc-storm', lng: -119, lat: 20 };
    const { rerender } = render(<Page layers={{}} selected={rachel} />);
    expect(probe.selection.satellite).toBe('goes-east');

    rerender(<Page layers={{ satellite: true }} selected={rachel} />);
    expect(probe.selection).toEqual({ satellite: 'goes-west', region: 'east-pacific', product: 'true-color' });
    expect(probe.focus.bounds[0]).toBeLessThan(-119);

    // A manual change afterwards sticks while the same storm stays selected.
    fireEvent.change(screen.getByLabelText('Band'), { target: { value: 'clean-ir' } });
    rerender(<Page layers={{ satellite: true }} selected={{ ...rachel }} />);
    expect(probe.selection.product).toBe('clean-ir');
  });

  it('ignores non-tropical selections', () => {
    mockSources();
    const { rerender } = render(<Page layers={{}} />);
    rerender(<Page layers={{ satellite: true }} selected={{ id: 'f1', type: 'incident', lng: -119, lat: 37 }} />);
    expect(probe.selection.satellite).toBe('goes-east');
  });
});
