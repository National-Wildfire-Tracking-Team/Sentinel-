import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import {
  extractAddressFromDescription,
  stripAddressFromDescription,
  replaceAddressInDescription,
  isValidCoordinate,
  hasLocationChanged,
} from '../../src/app/pages/reporter-dashboard/incidentLocation';

vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));
vi.mock('react-map-gl', () => ({
  default: ({ children, onClick }) => (
    <div data-testid="map" onClick={() => onClick({ lngLat: { lng: -120.5, lat: 38.25 } })}>{children}</div>
  ),
  NavigationControl: () => null,
  Marker: ({ children, onDragEnd, longitude, latitude }) => (
    <div
      data-testid="marker"
      data-lnglat={`${longitude},${latitude}`}
      onClick={(e) => { e.stopPropagation(); onDragEnd({ lngLat: { lng: -119, lat: 37 } }); }}
    >
      {children}
    </div>
  ),
}));

const DESCRIPTION = [
  'ADDRESS: 1 Main St, Placerville, El Dorado County, California 95667',
  'JURISDICTION: CAL FIRE',
  '',
  'INCIDENT NOTES:',
  'Spotting reported.',
].join('\n');

describe('incident address line helpers', () => {
  it('extracts the ADDRESS line', () => {
    expect(extractAddressFromDescription(DESCRIPTION))
      .toBe('1 Main St, Placerville, El Dorado County, California 95667');
    expect(extractAddressFromDescription('no address here')).toBe('');
    expect(extractAddressFromDescription(null)).toBe('');
  });

  it('strips the ADDRESS line and its line break, leaving the rest intact', () => {
    expect(stripAddressFromDescription(DESCRIPTION))
      .toBe('JURISDICTION: CAL FIRE\n\nINCIDENT NOTES:\nSpotting reported.');
    expect(stripAddressFromDescription('ADDRESS: only')).toBe('');
  });

  it('round-trips strip + replace back to the original shape', () => {
    const stripped = stripAddressFromDescription(DESCRIPTION);
    expect(replaceAddressInDescription(stripped, '9 Oak Rd, Auburn, CA'))
      .toBe(DESCRIPTION.replace(/^ADDRESS: .*$/m, 'ADDRESS: 9 Oak Rd, Auburn, CA'));
  });

  it('replaces an existing ADDRESS line in place', () => {
    const out = replaceAddressInDescription(DESCRIPTION, '$& 2 Pine Ave');
    expect(out.split('\n')[0]).toBe('ADDRESS: $& 2 Pine Ave');
    expect(out.split('\n')).toHaveLength(DESCRIPTION.split('\n').length);
  });

  it('adds an ADDRESS line to an empty description', () => {
    expect(replaceAddressInDescription('', 'X')).toBe('ADDRESS: X');
  });
});

describe('coordinate helpers', () => {
  it('validates coordinates', () => {
    expect(isValidCoordinate(38.5, -120.1)).toBe(true);
    expect(isValidCoordinate(null, -120.1)).toBe(false);
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(0, -181)).toBe(false);
  });

  it('ignores sub-meter float noise but detects real moves', () => {
    const a = { latitude: 38.5, longitude: -120.1 };
    expect(hasLocationChanged(a, { latitude: 38.500001, longitude: -120.1 })).toBe(false);
    expect(hasLocationChanged(a, { latitude: 38.51, longitude: -120.1 })).toBe(true);
    expect(hasLocationChanged({ latitude: null, longitude: null }, a)).toBe(true);
  });
});

describe('IncidentLocationPicker', () => {
  afterEach(() => vi.resetModules());

  it('reports the new position when the pin is dragged or the map is clicked', async () => {
    const { default: IncidentLocationPicker } =
      await import('../../src/app/components/Map/IncidentLocationPicker');
    const onChange = vi.fn();
    const { getByTestId } = render(
      <IncidentLocationPicker latitude={38} longitude={-120} onChange={onChange} />
    );

    expect(getByTestId('marker').dataset.lnglat).toBe('-120,38');

    fireEvent.click(getByTestId('marker'));
    expect(onChange).toHaveBeenLastCalledWith({ latitude: 37, longitude: -119 });

    fireEvent.click(getByTestId('map'));
    expect(onChange).toHaveBeenLastCalledWith({ latitude: 38.25, longitude: -120.5 });
  });

  it('renders no pin until a location exists', async () => {
    const { default: IncidentLocationPicker } =
      await import('../../src/app/components/Map/IncidentLocationPicker');
    const { queryByTestId, getByText } = render(
      <IncidentLocationPicker latitude={null} longitude={null} onChange={() => {}} />
    );
    expect(queryByTestId('marker')).toBeNull();
    expect(getByText('Click the map to place the incident')).toBeTruthy();
  });
});
