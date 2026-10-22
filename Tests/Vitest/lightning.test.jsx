import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parseLightning, lightningBase, LIGHTNING_AGES } from '../../src/app/api/lightning';
import LayerControl from '../../src/app/components/LayerControl/LayerControl';

vi.mock('../../src/app/context/AppContext', () => ({
  useApp: vi.fn(() => ({
    layers: {},
    layerPanelOpen: true,
    toggleLayer: vi.fn(),
    toggleLayerPanel: vi.fn(),
    wpcOutlookDay: {},
    setWpcOutlookDay: vi.fn(),
  })),
}));
vi.mock('../../src/app/context/WeatherModelsContext', () => ({ useWeatherModelsContext: () => null }));

describe('parseLightning', () => {
  it('turns the column arrays into GeoJSON points with epoch-second times', () => {
    const out = parseLightning({
      schemaVersion: 1,
      generatedAt: '2026-10-18T19:00:00Z',
      windowSeconds: 900,
      base: 1792350000,
      sources: { goes19: { latest: '2026-10-18T18:59:40Z' } },
      flashes: { lon: [-9750, -12000], lat: [3525, 4000], t: [10, 600], e: [20, 5] },
    });
    expect(out.geojson.features).toHaveLength(2);
    expect(out.geojson.features[0]).toEqual({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-97.5, 35.25] },
      properties: { t: 1792350010, e: 20 },
    });
    expect(out.generatedAt).toBe(Date.parse('2026-10-18T19:00:00Z'));
    expect(out.sources.goes19.latest).toBe('2026-10-18T18:59:40Z');
  });

  it('rejects an unknown format', () => {
    expect(() => parseLightning({ schemaVersion: 2 })).toThrow(/unexpected format/);
  });

  it('builds the versioned base URL', () => {
    expect(lightningBase('https://p.supabase.co/storage/v1/object/public/lightning/')).toBe('https://p.supabase.co/storage/v1/object/public/lightning/v1');
    expect(lightningBase(null)).toBeNull();
  });

  it('colours flashes by age, newest first, out to 15 minutes', () => {
    expect(LIGHTNING_AGES.map((a) => a.maxMin)).toEqual([2, 5, 10, 15]);
  });
});

const renderTab = (tab) => render(
  <MemoryRouter>
    <LayerControl activeMapTab={tab} />
  </MemoryRouter>,
);

/** The rows container of the layer-panel section with this title. */
function section(title) {
  const header = screen.getByText(title, { selector: 'div' }).closest('button');
  return header.parentElement;
}

describe('Lightning toggle', () => {
  it('is its own toggle in the Weather tab\'s Radar & satellite section', () => {
    renderTab('weather');
    expect(within(section('Radar & satellite')).getByRole('button', { name: 'Toggle Lightning' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Toggle Lightning' })).toHaveLength(1);
  });

  it('sits next to Satellite Imagery in All Hazards\' Monitoring & imagery section', () => {
    renderTab('allhazard');
    const rows = within(section('Monitoring & imagery'));
    expect(rows.getByRole('button', { name: 'Toggle Lightning' })).toBeInTheDocument();
    expect(rows.getByRole('button', { name: 'Toggle Satellite Imagery' })).toBeInTheDocument();
  });

  it('is not on the Wildfire tab', () => {
    renderTab('wildfire');
    expect(screen.queryByRole('button', { name: 'Toggle Lightning' })).toBeNull();
  });
});
