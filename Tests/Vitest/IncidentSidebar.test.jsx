import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tables = {};
const handlers = {};

vi.mock('../../src/shared/context/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null, isAuthenticated: false, isReporter: false, isAdmin: false }),
}));
vi.mock('../../src/app/components/WeatherModels/ModelForecastSummary', () => ({ default: () => null }));
vi.mock('../../src/shared/api/supabaseClient', () => {
  const query = (table) => {
    let ids = null;
    const q = {
      select: () => q, eq: () => q, order: () => q, limit: () => q,
      in: (column, values) => { if (column === 'incident_id') ids = values; return q; },
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve, reject) => Promise.resolve({
        data: (tables[table] ?? []).filter((r) => !ids || !r.incident_id || ids.includes(r.incident_id)),
        error: null,
      }).then(resolve, reject),
    };
    return q;
  };
  return {
    isSupabaseConfigured: true,
    supabase: {
      from: query,
      channel: () => {
        const ch = { on: (_e, cfg, cb) => { handlers[cfg.table] = cb; return ch; }, subscribe: () => ch };
        return ch;
      },
      removeChannel: () => {},
    },
  };
});

const { default: IncidentSidebar } = await import('../../src/app/components/FireDetailPanel/IncidentSidebar');

const fire = {
  type: 'user-report',
  id: 'inc-1',
  title: 'Dagger Fire',
  created_at: '2026-10-05T21:51:00Z',
  description: 'ADDRESS: 61600 Tamatea Rd, Anza, Riverside County, CA 92539\n\nINCIDENT NOTES:\nVeg fire.\n\nAcreage: 12',
  lat: 33.5, lng: -116.6,
};

function mockViewport(desktop) {
  window.matchMedia = (q) => ({ matches: desktop, media: q, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = class { observe() {} disconnect() {} };
}

function renderSidebar() {
  return render(
    <MemoryRouter>
      <IncidentSidebar fire={fire} onClose={vi.fn()} onShare={vi.fn()} shareStatus="" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  tables.incident_updates = [
    { id: 'u1', incident_id: 'inc-1', update_type: 'evacuation', source_type: 'reporter', source_name: 'jdoe', content: 'Evacuation order issued for zones RIV-E1042 and RIV-E1043.', created_at: new Date().toISOString() },
  ];
  tables.incident_evacuations = [
    { level: 'order', zones: ['RIV-E1042', 'RIV-E1043'], notes: 'Hwy 371 is the primary route out.', links: [{ label: 'Genasys evacuation map', url: 'https://protect.genasys.com' }] },
  ];
  tables.incident_shelters = [
    { id: 's1', kind: 'evacuation_center', name: 'Hamilton High School', address: '57430 Mitchell Rd, Anza, CA', status_note: 'Open · Red Cross' },
  ];
});

afterEach(() => vi.useRealTimers());

describe('IncidentSidebar', () => {
  it('renders header, metrics, situation, evacuations, tabs and footer (desktop)', async () => {
    mockViewport(true);
    renderSidebar();

    expect(screen.getByRole('heading', { name: 'Dagger Fire' })).toBeInTheDocument();
    expect(screen.getByText('Anza, Riverside County, CA')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument(); // unknown containment
    expect(await screen.findByText('Evacuation order issued')).toBeInTheDocument();
    expect(screen.getByText('Evacuation Order · Level 3 · Go')).toBeInTheDocument();
    expect(screen.getByText('RIV-E1042, RIV-E1043')).toBeInTheDocument();
    expect(screen.queryByText(/Evacuation Warning/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Genasys evacuation map' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Shelters/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Close incident details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Follow Incident' })).toBeInTheDocument();
  });

  it('highlights realtime inserts and flags Updates while another tab is open', async () => {
    mockViewport(true);
    const user = userEvent.setup();
    renderSidebar();
    await screen.findByText('Evacuation order issued');

    await user.click(screen.getByRole('tab', { name: /Shelters/ }));
    expect(screen.getByText('Hamilton High School')).toBeInTheDocument();

    act(() => {
      handlers.incident_updates({
        eventType: 'INSERT',
        new: { id: 'u2', incident_id: 'inc-1', update_type: 'road_closure', source_type: 'reporter', source_name: 'jdoe', content: 'Tamatea Rd closed.', created_at: new Date().toISOString() },
      });
    });
    expect(screen.getByLabelText('New updates')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Updates/ }));
    expect(screen.queryByLabelText('New updates')).not.toBeInTheDocument();
    const entry = screen.getByText('Tamatea Rd closed.').closest('article');
    expect(within(entry).getByText('New')).toBeInTheDocument();
    expect(within(entry).getByText('Road Closure')).toBeInTheDocument();
  });

  it('renders as a bottom sheet with a drag handle and no close button on mobile', async () => {
    mockViewport(false);
    renderSidebar();
    await screen.findByText('Evacuation order issued');
    expect(screen.getByRole('button', { name: 'Expand incident details' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close incident details' })).not.toBeInTheDocument();
  });
});

describe('IncidentSidebar with alias ids', () => {
  it('shows data stored under the fire\'s other ids, without duplicate automated diffs', async () => {
    mockViewport(true);
    tables.incident_updates = [
      { id: 'a1', incident_id: 'calfire-1', update_type: 'fire_growth', source_type: 'automated', source_name: 'CAL FIRE', content: 'Acres: 10 → 40', created_at: new Date().toISOString() },
      { id: 'a2', incident_id: 'irwin-1', update_type: 'fire_growth', source_type: 'automated', source_name: 'NIFC', content: 'Acres: 10 → 38', created_at: new Date().toISOString() },
      { id: 'r1', incident_id: 'irwin-1', update_type: 'road_closure', source_type: 'reporter', source_name: 'jdoe', content: 'Hwy 371 closed.', created_at: new Date().toISOString() },
      { id: 'x1', incident_id: 'unrelated', update_type: 'threat', source_type: 'reporter', source_name: 'x', content: 'Not this fire.', created_at: new Date().toISOString() },
    ];
    tables.incident_evacuations = [
      { incident_id: 'irwin-1', level: 'warning', zones: ['RIV-E1038'], notes: '', links: [], updated_at: 't' },
    ];
    tables.incident_shelters = [];

    render(
      <MemoryRouter>
        <IncidentSidebar
          fire={{ type: 'incident', id: 'calfire-1', aliasIds: ['irwin-1'], name: 'Dagger', source: 'CAL_FIRE', lat: 33.5, lng: -116.6 }}
          onClose={vi.fn()} onShare={vi.fn()} shareStatus=""
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Hwy 371 closed.')).toBeInTheDocument();
    expect(screen.getByText('Acres: 10 → 40')).toBeInTheDocument();
    expect(screen.queryByText('Acres: 10 → 38')).not.toBeInTheDocument();
    expect(screen.queryByText('Not this fire.')).not.toBeInTheDocument();
    expect(screen.getByText('Evacuation Warning · Level 2 · Set')).toBeInTheDocument();
    expect(screen.getByText('RIV-E1038')).toBeInTheDocument();
    expect(screen.getByText(/Reported by/)).toHaveTextContent('Reported by CAL FIRE');
  });
});
