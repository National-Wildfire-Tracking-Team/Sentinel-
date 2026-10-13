import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let app;
let investRun;

vi.mock('react-map-gl', () => ({ Popup: ({ children }) => <div>{children}</div> }));
vi.mock('../../src/app/context/AppContext', () => ({ useApp: () => app }));
vi.mock('../../src/app/hooks/useNhcModelTracks', () => ({ useNhcModelTracks: (id) => ({ status: id ? 'ready' : 'idle', data: null }) }));
vi.mock('../../src/app/hooks/useInvestModelRun', () => ({ useInvestModelRun: () => investRun }));

const { default: StormMapPopup } = await import('../../src/app/components/Map/StormMapPopup');

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

  it('shows all models, or a group picked from the dropdown', async () => {
    const user = userEvent.setup();
    renderPopup();
    await user.click(screen.getByRole('button', { name: 'Show Spaghetti Models' }));
    expect(app.setNhcModelTracks).toHaveBeenLastCalledWith({ atcfId: 'EP182026', group: 'all' });
    await user.click(screen.getByRole('button', { name: 'Choose model group' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'GEFS ensemble members' }));
    expect(app.setNhcModelTracks).toHaveBeenLastCalledWith({ atcfId: 'EP182026', group: 'ensemble' });
  });

  it('hides the tracks when they are showing for this storm', async () => {
    const user = userEvent.setup();
    app.nhcModelTracks = { atcfId: 'EP182026', group: 'consensus' };
    renderPopup();
    await user.click(screen.getByRole('button', { name: 'Choose model group' }));
    expect(screen.getByRole('menuitemradio', { name: 'Official & consensus' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: 'Hide Spaghetti Models' }));
    expect(app.setNhcModelTracks).toHaveBeenLastCalledWith(null);
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
      expect(app.setNhcModelTracks).toHaveBeenLastCalledWith({ atcfId: 'AL922026', group: 'all' });
    });

    it('says so when an area of interest has no model runs yet', () => {
      investRun = { status: 'none', atcfId: null };
      renderPopup({ kind: 'outlook', system: { ...disturbance, kind: 'area', name: 'Atlantic area of interest 1' }, via: 'Area of interest' });
      expect(screen.getByText('No model runs for this system yet')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show Spaghetti Models' })).not.toBeInTheDocument();
    });
  });
});
