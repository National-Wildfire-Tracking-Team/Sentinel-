import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import LoginOverview from '../../src/app/components/Overview/LoginOverview';
import { summarizeOverview, AREA_STATUS, QUICK_FILTERS } from '../../src/app/utils/overviewSummary';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const recent = '2026-10-23T08:00:00Z';

// Home in Sacramento with a 25 mi radius.
const HOME = { latitude: 38.58, longitude: -121.49, label: 'Sacramento', radiusMiles: 25 };

const fire = (overrides) => ({ lat: 38.6, lng: -121.5, contained: 10, status: 'active', updated: recent, ...overrides });

// A small square polygon around a point.
const square = (lat, lng, d = 0.05) => ({
  type: 'Polygon',
  coordinates: [[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]],
});

describe('summarizeOverview', () => {
  it('counts active fires, evacuation zones and NWS warnings', () => {
    const summary = summarizeOverview({
      incidents: [fire(), fire({ contained: 100, status: 'controlled' }), fire({ updated: '2026-10-01T00:00:00Z' })],
      alerts: [{ type: 'Red Flag Warning' }, { type: 'Fire Weather Watch' }, { type: 'Wind Advisory' }],
      evacZones: { type: 'FeatureCollection', features: [{ geometry: square(40, -120) }, { geometry: square(41, -120) }] },
      now: NOW,
    });

    expect(summary.activeFireCount).toBe(1);
    expect(summary.evacZoneCount).toBe(2);
    expect(summary.warningCount).toBe(1);
    expect(summary.area.status).toBe(AREA_STATUS.unknown);
  });

  it('marks the home area affected when an active fire is inside the radius', () => {
    const summary = summarizeOverview({ incidents: [fire()], home: HOME, now: NOW });
    expect(summary.area).toMatchObject({ status: AREA_STATUS.affected, fireCount: 1 });
  });

  it('marks the home area affected when an evacuation zone reaches it', () => {
    const summary = summarizeOverview({
      evacZones: { features: [{ geometry: square(HOME.latitude, HOME.longitude) }] },
      home: HOME,
      now: NOW,
    });
    expect(summary.area).toMatchObject({ status: AREA_STATUS.affected, evacZoneCount: 1 });
  });

  it('reports alerts-only when just a weather alert covers the home area', () => {
    const summary = summarizeOverview({
      alerts: [{ type: 'Heat Advisory', geometry: square(HOME.latitude, HOME.longitude, 1) }],
      home: HOME,
      now: NOW,
    });
    expect(summary.area).toMatchObject({ status: AREA_STATUS.alerts, alertCount: 1 });
  });

  it('is clear when everything is far away, and ignores contained fires nearby', () => {
    const summary = summarizeOverview({
      incidents: [fire({ lat: 34.05, lng: -118.24 }), fire({ contained: 100, status: 'controlled' })],
      alerts: [{ type: 'Red Flag Warning', geometry: square(34.05, -118.24) }],
      home: HOME,
      now: NOW,
    });
    expect(summary.area.status).toBe(AREA_STATUS.clear);
  });
});

const baseSummary = {
  activeFireCount: 12,
  evacZoneCount: 3,
  warningCount: 7,
  area: { status: AREA_STATUS.unknown, fireCount: 0, evacZoneCount: 0, alertCount: 0 },
};

function renderOverview(props = {}) {
  const handlers = { onClose: vi.fn(), onQuickFilter: vi.fn(), onSetUpHome: vi.fn() };
  render(<LoginOverview summary={baseSummary} home={null} loading={false} {...handlers} {...props} />);
  return handlers;
}

describe('LoginOverview', () => {
  it('shows the summary cards', () => {
    renderOverview();
    expect(screen.getByRole('dialog', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('Active fires', { selector: 'span' }).closest('div').parentElement).toHaveTextContent('12');
    expect(screen.getByText('Evacuation zones').closest('div').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Weather warnings').closest('div').parentElement).toHaveTextContent('7');
  });

  it('offers Home Setup when there is no home, and hides the My area filter', () => {
    const { onSetUpHome } = renderOverview();
    expect(screen.queryByRole('button', { name: 'My area' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set up Home' }));
    expect(onSetUpHome).toHaveBeenCalled();
  });

  it('describes an affected home area', () => {
    renderOverview({
      home: HOME,
      summary: { ...baseSummary, area: { status: AREA_STATUS.affected, fireCount: 2, evacZoneCount: 1, alertCount: 0 } },
    });
    expect(screen.getByText('Your area is affected')).toBeInTheDocument();
    expect(screen.getByText('2 active fires · 1 evacuation zone within 25 mi of Sacramento.')).toBeInTheDocument();
  });

  it('describes a clear home area', () => {
    renderOverview({ home: HOME, summary: { ...baseSummary, area: { ...baseSummary.area, status: AREA_STATUS.clear } } });
    expect(screen.getByText('Your area is clear')).toBeInTheDocument();
  });

  it('runs quick filters', () => {
    const { onQuickFilter } = renderOverview({ home: HOME });
    fireEvent.click(screen.getByRole('button', { name: 'Active fires' }));
    fireEvent.click(screen.getByRole('button', { name: 'All hazards' }));
    fireEvent.click(screen.getByRole('button', { name: 'My area' }));
    expect(onQuickFilter.mock.calls.map(([key]) => key)).toEqual([
      QUICK_FILTERS.activeFires, QUICK_FILTERS.allHazards, QUICK_FILTERS.myArea,
    ]);
  });

  it('closes from the X, Open the map and Escape', () => {
    const { onClose } = renderOverview();
    fireEvent.click(screen.getByRole('button', { name: 'Close overview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open the map' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('shows loading instead of numbers until data arrives', () => {
    renderOverview({ loading: true });
    expect(screen.getAllByLabelText('Loading')).toHaveLength(3);
  });
});
