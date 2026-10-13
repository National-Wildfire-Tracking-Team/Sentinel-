import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let app;
let appStatus;
let stormText;

vi.mock('../../src/app/context/AppContext', () => ({ useApp: () => app }));
vi.mock('../../src/app/context/AppStatusContext', () => ({ useAppStatus: () => appStatus }));
vi.mock('../../src/app/hooks/useNhcStormText', () => ({ useNhcStormText: () => stormText }));
vi.mock('../../src/app/data/countyPopulation.json', () => ({
  default: {
    source: 'ACS test',
    counties: { '12086': ['Miami-Dade County, Florida', 2700000], '12087': ['Monroe County, Florida', 82000] },
  },
}));
vi.mock('../../src/shared/context/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null, isAuthenticated: false, isReporter: false, isAdmin: false }),
}));
vi.mock('../../src/shared/api/supabaseClient', () => {
  const q = {
    select: () => q, eq: () => q, order: () => q, limit: () => q, in: () => q,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
  };
  return {
    isSupabaseConfigured: true,
    supabase: {
      from: () => q,
      channel: () => {
        const ch = { on: () => ch, subscribe: () => ch };
        return ch;
      },
      removeChannel: () => {},
    },
  };
});

const { default: HurricaneSidebar } = await import('../../src/app/components/FireDetailPanel/HurricaneSidebar');

const fc = (features) => ({ type: 'FeatureCollection', features });
const feature = (properties) => ({ type: 'Feature', geometry: null, properties });

const storm = {
  type: 'nhc-storm',
  id: 'nhc-storm-EP2',
  slot: 'EP2',
  basin: 'East Pacific',
  name: 'Hurricane Rachel',
  stormType: 'Hurricane',
  stormNumber: 2,
  category: 'Category 1',
  maxWindKt: 75,
  maxWindMph: 86,
  gustKt: 90,
  mslp: 977,
  movement: 'NW at 7 kt (8 mph)',
  motionDir: 'NW',
  motionMph: 8,
  advisoryNum: '38',
  advisoryDate: '800 AM PDT Tue Oct 06 2026',
  lat: 18.2,
  lng: -108.4,
};

const forecastPoints = fc([
  feature({ slot: 'EP2', tau: 0, category: 'Category 1', maxWindMph: 86, fullDateLabel: '2026-10-06 5:00 AM Tue PDT' }),
  feature({ slot: 'EP2', tau: 24, category: 'Category 1', maxWindMph: 81, dateLabel: '5:00 AM Wed' }),
  feature({ slot: 'EP2', tau: 48, category: 'Tropical Storm', maxWindMph: 58, dateLabel: '5:00 AM Thu' }),
]);

const NOT_FETCHED = { probKt: null, radii: false, arrival: false, surge: false };

function nhcData({ watchWarnings = [], windHazards = {} } = {}) {
  return {
    cyclones: [storm],
    forecastPointsGeoJSON: forecastPoints,
    pastPointsGeoJSON: fc([]),
    watchWarningGeoJSON: fc(watchWarnings),
    windHazards: {
      windProbGeoJSON: fc([]), windRadiiGeoJSON: fc([]), arrivalGeoJSON: fc([]), earliestArrivalGeoJSON: fc([]),
      surgeImageLayerIds: [], surgeSlots: [], fetched: NOT_FETCHED,
      ...windHazards,
    },
  };
}

const hurricaneWarning = feature({ slot: 'EP2', wwType: 'Hurricane Warning', advisoryNum: '38', advisoryDate: '800 AM PDT Tue Oct 06 2026' });
const tsWatch = feature({ slot: 'EP2', wwType: 'Tropical Storm Watch', advisoryNum: '38', advisoryDate: '800 AM PDT Tue Oct 06 2026' });

function renderSidebar(nhc, props = {}) {
  return render(
    <MemoryRouter>
      <HurricaneSidebar fire={storm} nhc={nhc} onClose={vi.fn()} onShare={vi.fn()} shareStatus="" {...props} />
    </MemoryRouter>,
  );
}

const product = () => document.getElementById('hurricane-product');
const railButton = (name) => within(screen.getByRole('navigation', { name: 'NHC products' })).getByRole('button', { name });

beforeEach(() => {
  window.matchMedia = (q) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = class { observe() {} disconnect() {} };
  app = {
    layers: { nhcTropical: true, nhcWatchWarning: true, nhcWindProb: false, nhcWindRadii: false, nhcArrival: false, nhcSurge: false },
    toggleLayer: vi.fn(),
    nhcWindProbKt: 34,
    setNhcWindProbKt: vi.fn(),
  };
  appStatus = { alerts: [], alertsStatus: { lastRefresh: '2026-10-06T15:00:00Z' } };
  stormText = { loaded: true, tcp: null, tcd: null, tcm: null, pws: null };
});

describe('HurricaneSidebar', () => {
  it('shows the storm header, stats and the watch/warning headline', () => {
    renderSidebar(nhcData({ watchWarnings: [hurricaneWarning, tsWatch] }));
    expect(screen.getByRole('heading', { name: 'Hurricane Rachel' })).toBeInTheDocument();
    expect(screen.getByText('Category 1 Hurricane')).toBeInTheDocument();
    expect(screen.getByText('977')).toBeInTheDocument();
    expect(screen.getByText('NW 8')).toBeInTheDocument();
    expect(screen.getByText('Hurricane Warning and Tropical Storm Watch in effect')).toBeInTheDocument();
  });

  it('opens on Watches & warnings when any exist, one card per type', () => {
    renderSidebar(nhcData({ watchWarnings: [hurricaneWarning, hurricaneWarning, tsWatch] }));
    expect(product()).toHaveAccessibleName('Watches & warnings');
    expect(within(product()).getByText('2 coastline segments · shown on the map')).toBeInTheDocument();
    expect(within(product()).getAllByText('Advisory 38 · Issued 800 AM PDT Tue Oct 06 2026')).toHaveLength(2);
  });

  it('opens on Current stats with forecast intensity when nothing is in effect', () => {
    renderSidebar(nhcData());
    expect(product()).toHaveAccessibleName('Current stats');
    expect(within(product()).getByText('Now')).toBeInTheDocument();
    expect(within(product()).getByText('48 hr')).toBeInTheDocument();
    expect(within(product()).getByText('TS')).toBeInTheDocument();
    expect(within(product()).getByText('Thu 5 AM')).toBeInTheDocument();
    expect(within(product()).getByText('58 mph')).toBeInTheDocument();
    expect(screen.queryByText(/in effect$/)).not.toBeInTheDocument();
  });

  it('switches products from the rail and turns on the matching map layer', async () => {
    const user = userEvent.setup();
    renderSidebar(nhcData());
    await user.click(railButton('Storm surge'));
    expect(product()).toHaveAccessibleName('Storm surge');
    expect(app.toggleLayer).toHaveBeenCalledWith('nhcSurge');

    await user.click(railButton('Watches & warnings'));
    expect(product()).toHaveAccessibleName('Watches & warnings');
    // Already on: left alone rather than toggled off.
    expect(app.toggleLayer).not.toHaveBeenCalledWith('nhcWatchWarning');
  });

  it('reports the selection to the caller so it is kept per storm', async () => {
    const user = userEvent.setup();
    const onProductChange = vi.fn();
    renderSidebar(nhcData(), { product: 'rainfall', onProductChange });
    expect(product()).toHaveAccessibleName('Rainfall');
    await user.click(railButton('Time of arrival'));
    expect(onProductChange).toHaveBeenCalledWith('arrival');
  });

  it('changes the wind probability threshold shared with the map', async () => {
    const user = userEvent.setup();
    stormText.pws = [
      { location: 'San Diego CA', kt: 34, cumulative: { 12: 0, 24: 3, 36: 9, 48: 22, 72: 30, 96: 31, 120: 31 } },
      { location: 'Ensenada', kt: 50, cumulative: { 12: 0, 24: 0, 36: 2, 48: 8, 72: 12, 96: 12, 120: 12 } },
    ];
    function Harness() {
      const [kt, setKt] = useState(34);
      app = { ...app, nhcWindProbKt: kt, setNhcWindProbKt: setKt };
      return (
        <HurricaneSidebar fire={storm} nhc={nhcData()} product="windProb" onProductChange={() => {}} onClose={() => {}} onShare={() => {}} />
      );
    }
    render(<MemoryRouter><Harness /></MemoryRouter>);
    const row = () => within(product()).getAllByRole('row')[1];
    expect(row()).toHaveTextContent(/San Diego CA\s*3%\s*22%\s*31%/);
    await user.click(within(product()).getByRole('button', { name: '50 kt' }));
    expect(within(product()).getByRole('button', { name: '50 kt' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(product()).getByText(/Chance of 50-kt \(58 mph\)/)).toBeInTheDocument();
    expect(row()).toHaveTextContent(/Ensenada\s*<1%\s*8%\s*12%/);
    expect(within(product()).queryByText('San Diego CA')).not.toBeInTheDocument();
  });

  it('uses the public advisory for named watch areas, the headline and current details', () => {
    stormText.tcp = {
      place: '190 mi SW of Ensenada Mexico',
      watchWarnings: [
        { type: 'Tropical Storm Warning', areas: ['Punta Eugenia to Ensenada'] },
        { type: 'Hurricane Watch', areas: ['Ensenada to the U.S./Mexico border'] },
      ],
      windExtentMi: { 34: 140, 64: 30 },
      nextAdvisory: 'Next complete advisory at 8:00 PM PDT',
      surge: { rows: [{ area: 'Ensenada to U.S./Mexico border', minFt: 3, maxFt: 5 }], text: '' },
      rainfall: 'Rachel is expected to produce 2 to 4 inches.',
    };
    stormText.tcm = { eyeDiameterNm: 20 };
    stormText.tcd = { discussion: ['First para.'], keyMessages: [], tauNotes: { 48: 'inland' } };
    // Stale layer segments are ignored once the advisory has spoken.
    renderSidebar(nhcData({ watchWarnings: [tsWatch] }), { product: 'current', onProductChange() {} });

    expect(screen.getByText('Hurricane Watch from Ensenada to the U.S./Mexico border. Tropical Storm Warning from Punta Eugenia to Ensenada.')).toBeInTheDocument();
    expect(screen.getByText('190 mi SW of Ensenada Mexico')).toBeInTheDocument();
    expect(screen.getByText('Oct 6, 8:00 AM PDT', { exact: false })).toBeInTheDocument();
    expect(within(product()).getByText('20 nm')).toBeInTheDocument();
    expect(within(product()).getByText('Hurricane-force 30 mi, tropical-storm-force 140 mi from center')).toBeInTheDocument();
    expect(within(product()).getByText(/Thu 5 AM/).closest('li')).toHaveTextContent('· inland');
  });

  it('shows peak surge by area from the advisory', () => {
    stormText.tcp = { watchWarnings: [], surge: { rows: [{ area: 'Ensenada to U.S./Mexico border', minFt: 3, maxFt: 5 }], text: '' } };
    renderSidebar(nhcData(), { product: 'surge', onProductChange() {} });
    expect(within(product()).getByText('Ensenada to U.S./Mexico border').closest('li')).toHaveTextContent('3–5 ft');
  });

  describe('empty states', () => {
    it('says there is no surge threat once surge has loaded without one', () => {
      renderSidebar(nhcData({ windHazards: { fetched: { ...NOT_FETCHED, surge: true } } }), { product: 'surge', onProductChange() {} });
      expect(within(product()).getByText('No U.S. surge threat.')).toBeInTheDocument();
    });

    it('shows the surge legend when the storm has a surge footprint', () => {
      renderSidebar(
        nhcData({ windHazards: { surgeSlots: ['EP2'], surgeImageLayerIds: [181], fetched: { ...NOT_FETCHED, surge: true } } }),
        { product: 'surge', onProductChange() {} },
      );
      expect(within(product()).getByText('Greater than 9 ft above ground')).toBeInTheDocument();
    });

    it.each([
      ['watches', 'No coastal watches or warnings for this storm.'],
      ['rainfall', 'No rainfall statement in this advisory.'],
      ['affected', 'No U.S. counties under tropical watches or warnings.'],
      ['discussion', 'No discussion published for this advisory yet.'],
    ])('%s renders a single muted line with no data', (key, text) => {
      renderSidebar(nhcData(), { product: key, onProductChange() {} });
      expect(within(product()).getByText(text)).toBeInTheDocument();
    });

    it('lists arrival times with how far off they are', async () => {
      const user = userEvent.setup();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-06T15:00:00Z')); // 8 AM PDT
      try {
        renderSidebar(
          nhcData({
            windHazards: {
              arrivalGeoJSON: fc([feature({ slot: 'EP2', arrivalTime: 'Wed 2 am' })]),
              earliestArrivalGeoJSON: fc([]),
              fetched: { ...NOT_FETCHED, arrival: true },
            },
          }),
          { product: 'arrival', onProductChange() {} },
        );
        expect(within(product()).getByText('Wed 2 am')).toBeInTheDocument();
        expect(within(product()).getByText('in 18 hr')).toBeInTheDocument();
        await user.click(within(product()).getByRole('button', { name: 'Earliest reasonable' }));
        expect(within(product()).getByText('No arrival times published for this storm.')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('totals population for the counties under this storm\'s alerts', async () => {
      const alert = (type, same, etn) => ({
        type, geocode: { SAME: same }, parameters: { VTEC: [`/O.NEW.KMFL.${type.startsWith('Hurricane') ? 'HU' : 'TR'}.W.${etn}.2026T0000Z-000000T0000Z/`] },
      });
      appStatus.alerts = [
        alert('Tropical Storm Warning', ['012086', '012087'], 1002),
        alert('Hurricane Watch', ['012087'], 1002),
        alert('Hurricane Warning', ['048201'], 1005), // another storm
        { type: 'Flood Warning', geocode: { SAME: ['012086'] } },
      ];
      renderSidebar(nhcData(), { product: 'affected', onProductChange() {} });
      expect(await within(product()).findByText('2,782,000')).toBeInTheDocument();
      expect(within(product()).getByText('82,000', { selector: 'p' })).toBeInTheDocument();
      expect(within(product()).getByText('Monroe County, Florida').closest('li')).toHaveTextContent('Tropical Storm Warning');
      expect(within(product()).queryByText(/County 48201/)).not.toBeInTheDocument();
      expect(within(product()).getByText('No data')).toBeInTheDocument();
    });

    it('says when no evacuations are posted', async () => {
      const user = userEvent.setup();
      renderSidebar(nhcData());
      await user.click(screen.getByRole('tab', { name: 'Evacuations' }));
      expect(screen.getByText('No evacuation orders or warnings posted for this storm.')).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: /Shelters/ })).not.toBeInTheDocument();
    });
  });
});
