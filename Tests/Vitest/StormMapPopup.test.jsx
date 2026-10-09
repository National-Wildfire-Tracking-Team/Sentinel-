import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let app;
let investRun;
let modelData;

vi.mock('react-map-gl', () => ({ Popup: ({ children }) => <div>{children}</div> }));
vi.mock('../../src/app/context/AppContext', () => ({ useApp: () => app }));
vi.mock('../../src/app/hooks/useNhcModelTracks', () => ({ useNhcModelTracks: (id) => ({ status: id ? 'ready' : 'idle', data: id ? modelData : null }) }));
vi.mock('../../src/app/hooks/useInvestModelRun', () => ({ useInvestModelRun: () => investRun }));

const { default: StormMapPopup } = await import('../../src/app/components/Map/StormMapPopup');
const { DEFAULT_MODEL_IDS } = await import('../../src/app/api/atcf/registry.mjs');
const { buildStormModels, parseStormId } = await import('../../src/app/api/atcf/guidance.mjs');
const { readFileSync } = await import('node:fs');

// Real NHC a-deck lines (Isaias, AL092026), normalized the way the app does.
const ISAIAS_MODELS = buildStormModels(
  readFileSync('Tests/Vitest/fixtures/nhc/aal092026-models.dat', 'utf8'),
  parseStormId('AL092026'),
  { now: Date.parse('2026-10-08T12:40:00Z') },
);
const DEFAULTS = { models: DEFAULT_MODEL_IDS, groups: [] };

const storm = {
  id: 'nhc-storm-EP3', slot: 'EP3', atcfId: 'EP182026', name: 'Hurricane Rachel', category: 'Category 3',
  maxWindMph: 115, mslp: 958, motionDir: 'NNW', motionMph: 12, lat: 27.4, lng: -117.9,
};
const disturbance = {
  id: 'nhc-dist-pt-1', kind: 'disturbance', name: 'Atlantic disturbance 1', formationChance: 'HIGH',
  day2Percent: 100, day7Percent: 100, lat: 22.5, lng: -96.2,
};

function renderPopup(props = {}) {
  const handlers = { onOpen: vi.fn(), onShowSatellite: vi.fn(), onClose: vi.fn() };
  render(
    <StormMapPopup
      kind="storm"
      system={storm}
      via="Cone of uncertainty"
      lngLat={{ lng: -117.9, lat: 27.4 }}
      prefs={{ popupDragHandle: true }}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

beforeEach(() => {
  app = { nhcModelTracks: null, setNhcModelTracks: vi.fn() };
  investRun = { status: 'searching', atcfId: null };
  modelData = null;
});

describe('StormMapPopup', () => {
  it('names the storm, what was clicked, its category and current stats', () => {
    renderPopup();
    expect(screen.getByText('Hurricane Rachel')).toBeInTheDocument();
    expect(screen.getByText('Category 3')).toBeInTheDocument();
    expect(screen.getByText(/Cone of uncertainty/)).toBeInTheDocument();
    expect(screen.getByText('115 mph · 958 mb · NNW 12 mph')).toBeInTheDocument();
  });

  it('opens the storm panel, points the satellite at it, and closes', async () => {
    const user = userEvent.setup();
    const h = renderPopup();
    await user.click(screen.getByRole('button', { name: 'Open Hurricane Rachel details' }));
    expect(h.onOpen).toHaveBeenCalledWith(storm);
    await user.click(screen.getByRole('button', { name: 'Show on Satellite' }));
    expect(h.onShowSatellite).toHaveBeenCalledWith(storm);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(h.onClose).toHaveBeenCalled();
  });

  it('shows the official forecast and operational models, or what is picked from the list', async () => {
    const user = userEvent.setup();
    renderPopup();
    await user.click(screen.getByRole('button', { name: 'Show Spaghetti Models' }));
    expect(app.setNhcModelTracks).toHaveBeenLastCalledWith({ atcfId: 'EP182026', ...DEFAULTS });
    await user.click(screen.getByRole('button', { name: 'Choose models' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /GEFS ensemble members/ }));
    expect(app.setNhcModelTracks).toHaveBeenLastCalledWith({ atcfId: 'EP182026', models: DEFAULT_MODEL_IDS, groups: ['ensemble'] });
  });

  it('hides the tracks when they are showing for this storm', async () => {
    const user = userEvent.setup();
    app.nhcModelTracks = { atcfId: 'EP182026', models: ['OFCL'], groups: ['consensus'] };
    renderPopup();
    await user.click(screen.getByRole('button', { name: 'Choose models' }));
    expect(screen.getByRole('menuitemcheckbox', { name: /Consensus aids/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemcheckbox', { name: /^NHC Official/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemcheckbox', { name: /^HAFS-A/ })).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('button', { name: 'Hide Spaghetti Models' }));
    expect(app.setNhcModelTracks).toHaveBeenLastCalledWith(null);
  });

  it('lists each model with its run time, legacy models apart, and missing ones disabled', async () => {
    const user = userEvent.setup();
    modelData = ISAIAS_MODELS;
    app.nhcModelTracks = { atcfId: 'EP182026', ...DEFAULTS };
    renderPopup();
    await user.click(screen.getByRole('button', { name: 'Choose models' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'HAFS-A (HFSA), 00Z Oct 8' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemcheckbox', { name: 'NHC Official (OFCL), 06Z Oct 8' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: 'ECMWF (EMX), Not available' })).toBeDisabled();
    expect(screen.getByText('Legacy (historical)')).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: /^HWRF/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/updated .* latest cycle 12Z Oct 8/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Official only' }));
    expect(app.setNhcModelTracks).toHaveBeenLastCalledWith({ atcfId: 'EP182026', models: ['OFCL'], groups: [] });
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(app.setNhcModelTracks).toHaveBeenLastCalledWith({
      atcfId: 'EP182026', models: ['OFCL', 'HFSA', 'HFSB', 'AVNO', 'UKX', 'CMC', 'CTCX', 'HWRF', 'HMON'], groups: [],
    });
    await user.click(screen.getByRole('button', { name: 'None' }));
    expect(app.setNhcModelTracks).toHaveBeenLastCalledWith({ atcfId: 'EP182026', models: [], groups: [] });
  });

  it('warns when the guidance is stale', async () => {
    const user = userEvent.setup();
    modelData = { ...ISAIAS_MODELS, stale: true, staleReason: 'upstream-unavailable' };
    renderPopup();
    await user.click(screen.getByRole('button', { name: 'Choose models' }));
    expect(screen.getByText(/NOAA is not responding/)).toBeInTheDocument();
  });

  describe('outlook systems', () => {
    const renderOutlook = () => renderPopup({ kind: 'outlook', system: disturbance, via: 'Disturbance' });

    it('shows formation chances and finds the invest\'s model runs', () => {
      renderOutlook();
      expect(screen.getByText('High chance')).toBeInTheDocument();
      expect(screen.getByText('Formation: 2-day 100% · 7-day 100%')).toBeInTheDocument();
      expect(screen.getByText('Finding model runs…')).toBeInTheDocument();
    });

    it('shows the invest\'s spaghetti once found', async () => {
      const user = userEvent.setup();
      investRun = { status: 'found', atcfId: 'AL922026' };
      renderOutlook();
      await user.click(screen.getByRole('button', { name: 'Show Spaghetti Models' }));
      expect(app.setNhcModelTracks).toHaveBeenLastCalledWith({ atcfId: 'AL922026', ...DEFAULTS });
    });

    it('says so when an area of interest has no model runs yet', () => {
      investRun = { status: 'none', atcfId: null };
      renderPopup({ kind: 'outlook', system: { ...disturbance, kind: 'area', name: 'Atlantic area of interest 1' }, via: 'Area of interest' });
      expect(screen.getByText('No model runs for this system yet')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show Spaghetti Models' })).not.toBeInTheDocument();
    });
  });
});
