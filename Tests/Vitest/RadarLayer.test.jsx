import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RadarLayer from '../../src/app/components/Map/layers/RadarLayer';

const layerProps = [];

vi.mock('react-map-gl', () => ({
  Source: ({ children }) => children,
  Layer: (props) => {
    layerProps.push(props);
    return null;
  },
}));

beforeEach(() => {
  layerProps.length = 0;
});

function iemLayout() {
  return layerProps.find(({ id }) => id === 'nexrad-radar-raster')?.layout?.visibility;
}

describe('RadarLayer — IEM WMS fallback', () => {
  it('falls back to the IEM mosaic when live and no sites have resolved', () => {
    render(<RadarLayer visible sites={[]} live />);
    expect(iemLayout()).toBe('visible');
  });

  it('does not fall back to the IEM mosaic while browsing history, even with no sites', () => {
    // A history tick resolving zero sites is unremarkable (no site in view
    // had a frame near that timestamp) — it should show nothing, not swap
    // in the IEM mosaic's differently-styled, always-current tiles. See
    // RadarLayer.jsx's `iemVis` comment for the full history of this bug.
    render(<RadarLayer visible sites={[]} live={false} />);
    expect(iemLayout()).toBe('none');
  });

  it('does not fall back to the IEM mosaic once sites have resolved, live or not', () => {
    const sites = [{ siteId: 'KTLX', dataUrl: 'data:image/png;base64,x', coordinates: [[0, 0], [1, 0], [1, 1], [0, 1]] }];
    render(<RadarLayer visible sites={sites} live />);
    expect(iemLayout()).toBe('none');

    layerProps.length = 0;
    render(<RadarLayer visible sites={sites} live={false} />);
    expect(iemLayout()).toBe('none');
  });

  it('does not fall back to the IEM mosaic when the whole layer is hidden', () => {
    render(<RadarLayer visible={false} sites={[]} live />);
    expect(iemLayout()).toBe('none');
  });
});
