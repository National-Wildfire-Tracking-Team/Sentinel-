import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  // Every live update briefly mounts a second slot to fade through, so
  // these all drive the fade timers explicitly rather than guessing.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const FADE_SETTLE_MS = 500; // comfortably past FADE_RELEASE_MS

  /** Re-render and report the site sources/layers currently on the map. */
  function settled(rerender, el) {
    sourceIds.length = 0;
    layerProps.length = 0;
    rerender(el);
    return {
      sources: sourceIds.filter((id) => /^nexrad-composite-KTLX-[01]$/.test(id)),
      opacity: Object.fromEntries(
        layerProps
          .filter(({ id }) => /^nexrad-composite-raster-KTLX-[01]$/.test(id))
          .map(({ id, paint }) => [id, paint['raster-opacity']]),
      ),
    };
  }

  it('never resolves <SiteLayer> to a different component depending on live, so a site is never fully torn down and rebuilt', () => {
    // Regression test for the original blank-map bug (PR #621): <SiteLayer>
    // used to resolve to one of two different component functions depending
    // on `live`, which React always fully unmounts/remounts for even with a
    // matching key — scrubbing off "Live" tore down and rebuilt every
    // visible site's Mapbox source/layer pair in one commit, leaving the
    // layer blank afterward. Proven here structurally: a live render and a
    // history render both use ids matching the *same* naming scheme
    // (`nexrad-composite-KTLX-<slot>`), never a distinct single-source
    // naming scheme a second component might use.
    render(<RadarLayer visible sites={[site('data:image/png;base64,live')]} live />);
    expect(sourceIds.some((id) => /^nexrad-composite-KTLX-[01]$/.test(id))).toBe(true);

    sourceIds.length = 0;
    render(<RadarLayer visible sites={[site('data:image/png;base64,hist')]} live={false} />);
    expect(sourceIds.some((id) => /^nexrad-composite-KTLX-[01]$/.test(id))).toBe(true);
  });

  it('fades a live update in rather than popping it in, then releases the outgoing slot', () => {
    // A freshly added Mapbox layer takes its initial paint value with no
    // transition, so the incoming slot has to mount at opacity 0 and only
    // take over on a *later* commit — otherwise the new frame appears
    // instantly on top of the one it is supposed to fade over, and there is
    // no cross-fade at all.
    const { rerender } = render(<RadarLayer visible sites={[site('live1')]} live />);
    act(() => { vi.advanceTimersByTime(FADE_SETTLE_MS); });

    rerender(<RadarLayer visible sites={[site('live2')]} live />);
    const midMount = settled(rerender, <RadarLayer visible sites={[site('live2')]} live />);
    expect(midMount.sources.sort()).toEqual(['nexrad-composite-KTLX-0', 'nexrad-composite-KTLX-1']);
    expect(midMount.opacity['nexrad-composite-raster-KTLX-0']).toBe(0); // incoming, not yet handed over
    expect(midMount.opacity['nexrad-composite-raster-KTLX-1']).toBe(0.75); // outgoing, still showing

    act(() => { vi.advanceTimersByTime(0); });
    const midFade = settled(rerender, <RadarLayer visible sites={[site('live2')]} live />);
    expect(midFade.opacity['nexrad-composite-raster-KTLX-0']).toBe(0.75); // now fading in
    expect(midFade.opacity['nexrad-composite-raster-KTLX-1']).toBe(0); // now fading out

    act(() => { vi.advanceTimersByTime(FADE_SETTLE_MS); });
    const after = settled(rerender, <RadarLayer visible sites={[site('live2')]} live />);
    expect(after.sources).toEqual(['nexrad-composite-KTLX-0']);
  });

  it('settles to exactly one Mapbox source per site, live or in history', () => {
    // The second slot is the fade, not a permanent fixture. Leaving it
    // resident doubled every visible site's contribution to the style, and
    // with ~200 sites that is ~200 extra react-map-gl <Source>/<Layer>
    // pairs re-rendering on every `styledata` event.
    const { rerender } = render(<RadarLayer visible sites={[site('live1')]} live />);
    rerender(<RadarLayer visible sites={[site('live2')]} live />);
    act(() => { vi.advanceTimersByTime(FADE_SETTLE_MS); });
    expect(settled(rerender, <RadarLayer visible sites={[site('live2')]} live />).sources).toHaveLength(1);

    rerender(<RadarLayer visible sites={[site('hist1')]} live={false} />);
    act(() => { vi.advanceTimersByTime(FADE_SETTLE_MS); });
    expect(settled(rerender, <RadarLayer visible sites={[site('hist1')]} live={false} />).sources).toHaveLength(1);
  });

  it('adds and removes nothing when the user scrubs off Live and keeps scrubbing', () => {
    // Regression test for PR #626's blank map. Collapsing to a single slot
    // *at the live/history boundary* meant every visible site dropped a
    // source and a layer in one commit — ~200 of each — the same mass
    // mutation PR #621 fixed, and the same blank composite. The first
    // history tick resolves to the same scan the live view was already
    // showing (same `dataUrl` out of the raster cache), which is why the
    // newest frame looked fine and the map only went blank on the *next*
    // scrub. Nothing may be added or removed across any of it.
    const { rerender } = render(<RadarLayer visible sites={[site('live1')]} live />);
    rerender(<RadarLayer visible sites={[site('live2')]} live />);
    act(() => { vi.advanceTimersByTime(FADE_SETTLE_MS); });
    const onLive = settled(rerender, <RadarLayer visible sites={[site('live2')]} live />).sources;

    // Scrub off Live onto the newest frame — same scan, so same dataUrl.
    rerender(<RadarLayer visible sites={[site('live2')]} live={false} />);
    act(() => { vi.advanceTimersByTime(FADE_SETTLE_MS); });
    expect(settled(rerender, <RadarLayer visible sites={[site('live2')]} live={false} />).sources).toEqual(onLive);

    // Then keep scrubbing back. This is where the map used to go blank.
    for (const url of ['hist1', 'hist2', 'hist3']) {
      rerender(<RadarLayer visible sites={[site(url)]} live={false} />);
      act(() => { vi.advanceTimersByTime(FADE_SETTLE_MS); });
      const now = settled(rerender, <RadarLayer visible sites={[site(url)]} live={false} />);
      expect(now.sources).toEqual(onLive);
      // ...and the one that exists is the one actually being drawn.
      expect(Object.values(now.opacity)).toEqual([0.75]);
    }

    // And back to Live again.
    rerender(<RadarLayer visible sites={[site('live3')]} live />);
    act(() => { vi.advanceTimersByTime(FADE_SETTLE_MS); });
    expect(settled(rerender, <RadarLayer visible sites={[site('live3')]} live />).sources).toHaveLength(1);
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
