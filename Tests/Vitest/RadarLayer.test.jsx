import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RadarLayer from '../../src/app/components/Map/layers/RadarLayer';

function site(dataUrl) {
  return { siteId: 'KTLX', dataUrl, coordinates: [[0, 0], [1, 0], [1, 1], [0, 1]] };
}

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
  it('never resolves <SiteLayer> to a different component depending on live, so a site is never fully torn down and rebuilt', () => {
    // Regression test for the original blank-map bug: <SiteLayer> used to
    // resolve to one of two different component functions depending on
    // `live`, which React always fully unmounts/remounts for even with a
    // matching key — scrubbing off "Live" tore down and rebuilt every
    // visible site's Mapbox source/layer pair in one commit, occasionally
    // leaving the layer blank afterward. Proven here structurally: a live
    // render and a history render both use ids matching the *same* naming
    // scheme (`nexrad-composite-KTLX-<slot>`), never a distinct
    // single-source naming scheme a second component might use.
    render(<RadarLayer visible sites={[site('data:image/png;base64,live')]} live />);
    const liveIds = [...sourceIds];
    expect(liveIds.some((id) => /^nexrad-composite-KTLX-[01]$/.test(id))).toBe(true);

    sourceIds.length = 0;
    render(<RadarLayer visible sites={[site('data:image/png;base64,hist')]} live={false} />);
    const historyIds = [...sourceIds];
    expect(historyIds.some((id) => /^nexrad-composite-KTLX-[01]$/.test(id))).toBe(true);
  });

  it('keeps only one Mapbox source per site in history, even after live had cycled through both cross-fade slots', () => {
    // The other half of the fix: unifying to one component originally kept
    // *both* cross-fade slots permanently populated regardless of `live`,
    // costing every site a second always-resident GPU texture it never
    // displays in history — confirmed live to measurably affect the whole
    // map's responsiveness with ~200 sites each paying double their
    // necessary layer count. History should only ever populate slot 0.
    const { rerender } = render(<RadarLayer visible sites={[site('data:image/png;base64,live1')]} live />);
    sourceIds.length = 0;
    rerender(<RadarLayer visible sites={[site('data:image/png;base64,live2')]} live />);
    expect(new Set(sourceIds.filter((id) => /^nexrad-composite-KTLX-[01]$/.test(id)))).toEqual(
      new Set(['nexrad-composite-KTLX-0', 'nexrad-composite-KTLX-1']),
    );

    rerender(<RadarLayer visible sites={[site('data:image/png;base64,hist1')]} live={false} />);
    // That rerender's own render pass still reflects the *previous* state
    // (both slots populated) — the effect that collapses to one slot only
    // fires after commit. Rerender once more with the same props so this
    // captures the settled result, not the transient intermediate one.
    sourceIds.length = 0;
    rerender(<RadarLayer visible sites={[site('data:image/png;base64,hist1')]} live={false} />);
    const historySources = new Set(sourceIds.filter((id) => /^nexrad-composite-KTLX-[01]$/.test(id)));
    expect(historySources).toEqual(new Set(['nexrad-composite-KTLX-0']));
  });

  it('only changes the cross-fade transition duration between live and history, not which layers exist', () => {
    render(<RadarLayer visible sites={[site('data:image/png;base64,live')]} live />);
    const liveLayer = layerProps.find(({ id }) => /^nexrad-composite-raster-KTLX-[01]$/.test(id));
    expect(liveLayer.paint['raster-opacity-transition'].duration).toBeGreaterThan(0);

    layerProps.length = 0;
    render(<RadarLayer visible sites={[site('data:image/png;base64,hist')]} live={false} />);
    const historyLayer = layerProps.find(({ id }) => /^nexrad-composite-raster-KTLX-[01]$/.test(id));
    expect(historyLayer.paint['raster-opacity-transition'].duration).toBe(0);
  });
});
