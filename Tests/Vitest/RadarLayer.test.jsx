import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RadarLayer from '../../src/app/components/Map/layers/RadarLayer';

const layerProps = [];
const sourceIds = [];

vi.mock('react-map-gl', () => ({
  Source: ({ children, id }) => {
    sourceIds.push(id);
    return children;
  },
  Layer: (props) => {
    layerProps.push(props);
    return null;
  },
}));

beforeEach(() => {
  layerProps.length = 0;
  sourceIds.length = 0;
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

describe('RadarLayer — stable site layer identity across live/history', () => {
  it('uses the same Source ids whether live or in history, so toggling never remounts a site\'s Mapbox layers', () => {
    // Regression test: `<SiteLayer>` used to resolve to one of two different
    // component functions depending on `live`, which React always fully
    // unmounts/remounts for even with a matching key. The exact symptom
    // this caused live: scrubbing off "Live" (which flips `live` to false
    // before any new data has loaded, while `sites` still holds the old
    // live frame) tore down and rebuilt every visible site's Mapbox
    // source/layer pair in one commit, and occasionally left the radar
    // layer blank afterward. The fix keeps one stable component whose
    // Source ids never depend on `live` — only the fade duration does.
    const sites = [{ siteId: 'KTLX', dataUrl: 'data:image/png;base64,x', coordinates: [[0, 0], [1, 0], [1, 1], [0, 1]] }];

    render(<RadarLayer visible sites={sites} live />);
    const liveSourceIds = [...sourceIds].sort();
    // Whichever slot(s) the two-slot cross-fade populated, both are always
    // named `nexrad-composite-KTLX-<0|1>` — never a bare `nexrad-composite-KTLX`
    // (the old single-source component's naming, gone now that there's only
    // one component regardless of `live`).
    expect(liveSourceIds.every((id) => id === 'nexrad-radar' || /^nexrad-composite-KTLX-[01]$/.test(id))).toBe(true);

    sourceIds.length = 0;
    render(<RadarLayer visible sites={sites} live={false} />);
    const historySourceIds = [...sourceIds].sort();

    expect(historySourceIds).toEqual(liveSourceIds);
  });

  it('only changes the cross-fade transition duration between live and history, not which layers exist', () => {
    const sites = [{ siteId: 'KTLX', dataUrl: 'data:image/png;base64,x', coordinates: [[0, 0], [1, 0], [1, 1], [0, 1]] }];

    render(<RadarLayer visible sites={sites} live />);
    const liveLayer = layerProps.find(({ id }) => /^nexrad-composite-raster-KTLX-[01]$/.test(id));
    expect(liveLayer.paint['raster-opacity-transition'].duration).toBeGreaterThan(0);

    layerProps.length = 0;
    render(<RadarLayer visible sites={sites} live={false} />);
    const historyLayer = layerProps.find(({ id }) => /^nexrad-composite-raster-KTLX-[01]$/.test(id));
    expect(historyLayer.paint['raster-opacity-transition'].duration).toBe(0);
  });
});
