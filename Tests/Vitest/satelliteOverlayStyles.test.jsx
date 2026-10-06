import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const layerProps = [];
vi.mock('react-map-gl', () => ({
  Source: ({ children }) => <>{children}</>,
  Layer: (props) => { layerProps.push(props); return null; },
}));

const { default: WeatherAlertsLayer } = await import('../../src/app/components/Map/layers/WeatherAlertsLayer');
const { default: NHCTropicalWeatherLayer } = await import('../../src/app/components/Map/layers/NHCTropicalWeatherLayer');

const layer = (id) => layerProps.filter((l) => l.id === id).at(-1);
const casings = () => layerProps.filter((l) => l.id.endsWith('-casing'));

beforeEach(() => { layerProps.length = 0; });

describe('Alert and NHC layers over satellite imagery', () => {
  it('keeps NWS alert casings hidden until the satellite layer is on', () => {
    render(<WeatherAlertsLayer geoJSON={null} visible />);
    expect(layer('weather-alerts-casing').layout.visibility).toBe('none');
    const plainWidth = layer('weather-alerts-line').paint['line-width'];

    layerProps.length = 0;
    render(<WeatherAlertsLayer geoJSON={null} visible onImagery />);
    expect(layer('weather-alerts-casing').layout.visibility).toBe('visible');
    expect(layer('weather-alerts-line').paint['line-width']).toEqual(['+', plainWidth, 1]);
  });

  it('never shows alert casings while alerts are hidden', () => {
    render(<WeatherAlertsLayer geoJSON={null} visible={false} onImagery />);
    expect(layer('weather-alerts-casing').layout.visibility).toBe('none');
  });

  it('cases every NHC line and strengthens the cone on imagery', () => {
    render(<NHCTropicalWeatherLayer visible />);
    expect(casings().length).toBeGreaterThanOrEqual(5);
    expect(casings().every((l) => l.layout.visibility === 'none')).toBe(true);
    expect(layer('nhc-cone-line').paint['line-color']).toBe('#999999');

    layerProps.length = 0;
    render(<NHCTropicalWeatherLayer visible onImagery />);
    expect(casings().every((l) => l.layout.visibility === 'visible')).toBe(true);
    expect(layer('nhc-cone-line').paint['line-color']).toBe('#ffffff');
  });

  it('labels areas of interest with their formation chances', () => {
    render(<NHCTropicalWeatherLayer visible />);
    const label = layer('nhc-disturbance-label');
    expect(label.type).toBe('symbol');
    expect(JSON.stringify(label.layout['text-field'])).toContain('day7Percent');
    expect(JSON.stringify(label.layout['text-field'])).toContain('day2Percent');
  });
});
