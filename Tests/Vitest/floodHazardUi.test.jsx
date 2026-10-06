import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FloodHazardLayer, { FLOOD_ZONES_FILL_ID, FLOOD_PANELS_FILL_ID } from '../../src/app/components/Map/layers/FloodHazardLayer';
import FloodHazardStatus from '../../src/app/components/MapControls/FloodHazardStatus';
import {
  FLOOD_ATTRIBUTION,
  FLOOD_CATEGORIES,
  floodZoneRows,
  formatZoneSubtype,
  floodCategoryMeta,
} from '../../src/app/utils/floodHazard';

const layerProps = [];
const sourceProps = [];

vi.mock('react-map-gl', () => ({
  Source: ({ children, ...props }) => {
    sourceProps.push(props);
    return children;
  },
  Layer: (props) => {
    layerProps.push(props);
    return null;
  },
}));

beforeEach(() => {
  layerProps.length = 0;
  sourceProps.length = 0;
});

const EMPTY = { type: 'FeatureCollection', features: [] };
const DATA = {
  level: 'detail',
  zones: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: { id: 1, category: 'pct_1', zone: 'AE' } }] },
  panels: EMPTY,
};

describe('floodHazard utils', () => {
  it('turns a zone record into human-readable rows with no raw GIS field names', () => {
    const rows = floodZoneRows({
      zone: 'AE',
      subtype: '1 PCT ANNUAL CHANCE FLOOD HAZARD CONTAINED IN CHANNEL',
      sfha: true,
      bfe: 23,
      lengthUnit: 'Feet',
      verticalDatum: 'NAVD88',
      panel: '06067C0185H',
      effectiveDate: '2012-08-16',
      panelType: 'Countywide, Panel Printed',
      dfirmId: '06067C',
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['Flood Zone']).toBe('AE');
    expect(byLabel['Zone subtype']).toBe('1% annual chance flood hazard contained in channel');
    expect(byLabel['Special Flood Hazard Area']).toBe('Yes');
    expect(byLabel['Base flood elevation']).toBe('23 ft (NAVD88)');
    expect(byLabel['FIRM panel']).toBe('06067C0185H');
    expect(byLabel['Panel effective date']).toBe('August 16, 2012');
    for (const { label } of rows) expect(label).not.toMatch(/FLD_ZONE|ZONE_SUBTY|STATIC_BFE|SFHA_TF|EFF_DATE/);
  });

  it('omits rows FEMA left blank', () => {
    const rows = floodZoneRows({ zone: 'X', subtype: null, sfha: false, bfe: null, panel: null });
    expect(rows.map((r) => r.label)).toEqual(['Flood Zone', 'Special Flood Hazard Area']);
  });

  it('formats 0.2 PCT subtypes', () => {
    expect(formatZoneSubtype('0.2 PCT ANNUAL CHANCE FLOOD HAZARD')).toBe('0.2% annual chance flood hazard');
  });

  it('covers every category the proxy can emit, with a fallback', () => {
    for (const key of ['floodway', 'special_floodway', 'coastal_high_hazard', 'pct_1', 'pct_0_2', 'future_1pct', 'levee_reduced', 'levee_risk', 'undetermined', 'not_included']) {
      expect(FLOOD_CATEGORIES[key]).toBeDefined();
    }
    expect(floodCategoryMeta('nonsense')).toBe(FLOOD_CATEGORIES.other);
  });
});

describe('FloodHazardLayer', () => {
  it('renders only zone layers plus an invisible panel hit layer, with FEMA attribution on every source', () => {
    render(<FloodHazardLayer data={DATA} visible />);
    const ids = layerProps.map((l) => l.id);
    expect(ids.sort()).toEqual([FLOOD_PANELS_FILL_ID, FLOOD_ZONES_FILL_ID, 'flood-hazard-zones-line'].sort());
    expect(layerProps.find((l) => l.id === FLOOD_PANELS_FILL_ID).paint['fill-opacity']).toBe(0);
    for (const s of sourceProps) expect(s.attribution).toBe(FLOOD_ATTRIBUTION);
    expect(layerProps.every((l) => l.layout.visibility === 'visible')).toBe(true);
  });

  it('hides every layer when disabled', () => {
    render(<FloodHazardLayer data={DATA} visible={false} />);
    expect(layerProps.every((l) => l.layout.visibility === 'none')).toBe(true);
  });

  it('keeps fills translucent so operational data stays readable', () => {
    render(<FloodHazardLayer data={DATA} visible />);
    const zoneFill = layerProps.find((l) => l.id === FLOOD_ZONES_FILL_ID);
    const stops = zoneFill.paint['fill-opacity'].filter((v) => typeof v === 'number').filter((_, i) => i % 2 === 1);
    expect(Math.max(...stops)).toBeLessThanOrEqual(0.35);
  });

  it('draws floodways above the wider 1% floodplain', () => {
    render(<FloodHazardLayer data={DATA} visible />);
    const sortKey = layerProps.find((l) => l.id === FLOOD_ZONES_FILL_ID).layout['fill-sort-key'];
    const rank = (cat) => sortKey[sortKey.indexOf(cat) + 1];
    expect(rank('floodway')).toBeGreaterThan(rank('pct_1'));
    expect(rank('pct_1')).toBeGreaterThan(rank('pct_0_2'));
  });
});

describe('MapView layer ordering', () => {
  // react-map-gl stacks layers in JSX order (back → front), so the flood
  // layer must be declared before every critical operational layer.
  const source = readFileSync(resolve(process.cwd(), 'src/app/components/Map/MapView.jsx'), 'utf8');
  const pos = (tag) => {
    const i = source.indexOf(`<${tag}`);
    expect(i).toBeGreaterThan(-1);
    return i;
  };

  it.each(['WeatherAlertsLayer', 'FirePerimetersLayer', 'IncidentLocationsLayer', 'FireIncidentsLayer', 'EvacuationZonesLayer'])(
    'renders beneath %s',
    (tag) => {
      expect(pos('FloodHazardLayer')).toBeLessThan(pos(tag));
    },
  );
});

describe('FloodHazardStatus', () => {
  it('always shows the FEMA attribution', () => {
    render(<FloodHazardStatus loading={false} error={null} belowMinZoom={false} data={DATA} />);
    expect(screen.getByText(FLOOD_ATTRIBUTION)).toBeInTheDocument();
  });

  it('shows a non-blocking error with a working Retry', () => {
    const onRetry = vi.fn();
    render(<FloodHazardStatus loading={false} error="Flood hazard data is temporarily unavailable." belowMinZoom={false} data={DATA} onRetry={onRetry} />);
    expect(screen.getByText('Flood hazard data is temporarily unavailable.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.getByRole('status').className).toMatch(/pointer-events-none/);
  });

  it('prompts to zoom in to about 1 mile below the minimum zoom', () => {
    render(<FloodHazardStatus loading={false} error={null} belowMinZoom data={{ ...DATA, level: null }} />);
    expect(screen.getByText(/zoom in to about 1 mile to view flood risk areas/i)).toBeInTheDocument();
  });

  it('explains an empty result as no digital FEMA flood map', () => {
    render(<FloodHazardStatus loading={false} error={null} belowMinZoom={false} data={{ ...DATA, zones: EMPTY, panels: EMPTY }} />);
    expect(screen.getByText(/no digital fema flood map/i)).toBeInTheDocument();
  });

  it('shows a subtle loading indicator on first load', () => {
    render(<FloodHazardStatus loading error={null} belowMinZoom={false} data={{ ...DATA, level: null }} />);
    expect(screen.getByText(/loading flood hazard data/i)).toBeInTheDocument();
  });

});
