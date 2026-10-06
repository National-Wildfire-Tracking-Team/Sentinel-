import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  buildCyclones, buildOutlookSystems, formatStormMotion, motionBetween, nhcAdvisoryUrl, WATCH_WARNING_COLORS,
} from '../../src/app/api/nhcTropicalWeather';
import { stormSatelliteView, productAvailability } from '../../src/app/api/goesSatellite';

vi.mock('../../src/app/context/AppContext', () => ({ useApp: () => ({ selectFire: vi.fn() }) }));
vi.mock('../../src/app/context/ViewportContext', () => ({ useViewport: () => ({ setViewport: vi.fn() }) }));
const { default: TropicalWeatherFeed } = await import('../../src/app/components/Sidebar/TropicalWeatherFeed');

// Shaped like normalizeForecastPoint output; values from the live EP3 layer
// (Hurricane Rachel, advisory 37, Oct 6 2026).
function forecastPoint(tau, lng, lat, extra = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      slot: 'EP3', stormName: 'Hurricane Rachel', stormType: 'Hurricane', tau, isCurrent: tau === 0,
      maxWindKt: 75, maxWindMph: 86, gustKt: 90, mslp: 976, advisoryNum: '37',
      advisoryDate: '200 AM PDT Tue Oct 06 2026', motionDirDeg: 270, motionKt: 7, category: 'Category 1',
      ...extra,
    },
  };
}
const fc = (features) => ({ type: 'FeatureCollection', features });

describe('buildCyclones', () => {
  it('makes one card per storm slot from its current forecast point', () => {
    const [rachel, ...rest] = buildCyclones(fc([forecastPoint(12, -120, 20), forecastPoint(0, -119, 20)]));
    expect(rest).toHaveLength(0);
    expect(rachel).toMatchObject({
      id: 'nhc-storm-EP3', name: 'Hurricane Rachel', basin: 'East Pacific', category: 'Category 1',
      maxWindKt: 75, maxWindMph: 86, mslp: 976, advisoryNum: '37', movement: 'W at 7 kt (8 mph)',
      advisoryUrl: 'https://www.nhc.noaa.gov/text/refresh/MIATCPEP3+shtml/', lng: -119, lat: 20,
    });
  });

  it('computes motion from the first two forecast points when NHC omits it', () => {
    const noMotion = { motionDirDeg: null, motionKt: null };
    const [storm] = buildCyclones(fc([forecastPoint(0, -119, 20, noMotion), forecastPoint(12, -120, 20, noMotion)]));
    expect(storm.movement).toBe('W at 5 kt (6 mph)');
  });

  it('returns nothing without forecast points', () => {
    expect(buildCyclones(null)).toEqual([]);
  });
});

describe('storm motion helpers', () => {
  it('measures bearing and speed between points', () => {
    const m = motionBetween(forecastPoint(0, -80, 25), forecastPoint(12, -80, 26));
    expect(m.dirDeg).toBeCloseTo(0, 0);
    expect(m.kt).toBeCloseTo(5, 0);
  });

  it('formats stationary storms', () => {
    expect(formatStormMotion(90, 0.4)).toBe('Stationary');
    expect(formatStormMotion(null, null)).toBeNull();
  });

  it('links Central Pacific advisories to CPHC Honolulu', () => {
    expect(nhcAdvisoryUrl('CP1')).toBe('https://www.nhc.noaa.gov/text/refresh/HFOTCPCP1+shtml/');
    expect(nhcAdvisoryUrl(undefined)).toBe('https://www.nhc.noaa.gov/');
  });
});

describe('buildOutlookSystems', () => {
  const square = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
  const outlook = (geometry, basin, formationChance, day2Percent, day7Percent) => ({
    type: 'Feature', geometry, properties: { basin, formationChance, day2Percent, day7Percent },
  });

  it('merges an area with the disturbance inside it and keeps areas with none', () => {
    const points = fc([outlook({ type: 'Point', coordinates: [-50, 15] }, 'Atlantic', 'HIGH', 90, 90)]);
    const areas = fc([
      outlook(square(-60, 10, -40, 20), 'Atlantic', 'HIGH', 90, 90),
      outlook(square(-110, 8, -100, 14), 'Pacific', 'LOW', 0, 20),
    ]);
    const systems = buildOutlookSystems(points, areas);
    expect(systems.map((s) => s.name)).toEqual(['Atlantic disturbance 1', 'Pacific area of interest 1']);
    expect(systems[1]).toMatchObject({ kind: 'area', day7Percent: 20 });
    expect(systems[1].lng).toBeCloseTo(-105, 5);
  });
});

describe('watch/warning palette', () => {
  it('uses the official NHC renderer colors', () => {
    expect(WATCH_WARNING_COLORS).toMatchObject({
      'Hurricane Warning': '#FF0000', 'Hurricane Watch': '#FF7F7F',
      'Tropical Storm Warning': '#004DA8', 'Tropical Storm Watch': '#FFFF00',
    });
  });
});

describe('stormSatelliteView', () => {
  it('sends East Pacific storms to GOES-West East Pacific GeoColor', () => {
    const view = stormSatelliteView(-119, 20);
    expect(view.selection).toEqual({ satellite: 'goes-west', region: 'east-pacific', product: 'true-color' });
    expect(productAvailability('true-color', 'goes-west', 'east-pacific').ok).toBe(true);
    expect(view.bounds[0]).toBeLessThan(-119);
  });

  it('sends Atlantic basin storms to GOES-East, smallest view containing them', () => {
    expect(stormSatelliteView(-70, 18).selection).toEqual({ satellite: 'goes-east', region: 'caribbean', product: 'true-color' });
    expect(stormSatelliteView(-40, 30).selection.region).toBe('atlantic');
  });

  it('falls back to full disk outside every view', () => {
    expect(stormSatelliteView(-170, -10).selection).toEqual({ satellite: 'goes-west', region: 'fulldisk', product: 'true-color' });
  });
});

describe('TropicalWeatherFeed', () => {
  it('shows winds, pressure, motion and advisory for a cyclone', () => {
    const cyclones = buildCyclones(fc([forecastPoint(0, -119, 20), forecastPoint(12, -120, 20)]));
    render(<TropicalWeatherFeed cyclones={cyclones} invests={[]} />);
    expect(screen.getByText('Hurricane Rachel')).toBeInTheDocument();
    expect(screen.getByText('Category 1 Hurricane')).toBeInTheDocument();
    expect(screen.getByText('86 mph')).toBeInTheDocument();
    expect(screen.getByText('976 mb')).toBeInTheDocument();
    expect(screen.getByText('W at 7 kt (8 mph)')).toBeInTheDocument();
    expect(screen.getByText('Advisory #37')).toBeInTheDocument();
  });

  it('says when the tropical layers are switched off', () => {
    render(<TropicalWeatherFeed cyclones={[]} invests={[]} enabled={false} />);
    expect(screen.getByText('Tropical layers are off')).toBeInTheDocument();
  });
});
