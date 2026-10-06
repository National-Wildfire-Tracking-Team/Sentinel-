import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

let selectedFire = null;

vi.mock('../../src/app/context/AppContext', () => ({
  useApp: () => ({ selectedFire, clearSelected: vi.fn() }),
}));
vi.mock('../../src/app/context/AppStatusContext', () => ({ useAppStatus: () => ({ alerts: [] }) }));
vi.mock('../../src/app/components/FireDetailPanel/IncidentSidebar', () => ({
  default: ({ fire }) => <div>incident sidebar for {fire.id} (aliases: {(fire.aliasIds || []).join(',')})</div>,
}));
vi.mock('../../src/app/components/FireDetailPanel/HurricaneSidebar', () => ({
  default: ({ fire, nhc }) => <div>hurricane sidebar for {fire.id} ({nhc?.cyclones?.length ?? 0} live storms)</div>,
}));
vi.mock('../../src/app/components/IncidentTimeline/IncidentTimeline', () => ({ default: () => null }));

const { default: FireDetailPanel } = await import('../../src/app/components/FireDetailPanel/FireDetailPanel');

const perimeter = (over) => ({
  type: 'perimeter', id: 'calfire-1', aliasIds: ['irwin-1'], name: 'Dagger', acres: 40, contained: 10, ...over,
});

function renderPanel(fire, props = {}) {
  selectedFire = fire;
  return render(<MemoryRouter><FireDetailPanel {...props} /></MemoryRouter>);
}

describe('FireDetailPanel routing', () => {
  it('opens a current perimeter in the incident sidebar with its aliases', () => {
    renderPanel(perimeter());
    expect(screen.getByText('incident sidebar for calfire-1 (aliases: irwin-1)')).toBeInTheDocument();
  });

  it('keeps the plain perimeter view for historical mapping captures', () => {
    renderPanel(perimeter({ historical: true }));
    expect(screen.queryByText(/incident sidebar/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dagger' })).toBeInTheDocument();
  });

  it('opens official and reporter incidents in the sidebar', () => {
    renderPanel({ type: 'incident', id: 'irwin-2', name: 'Ridge' });
    expect(screen.getByText(/incident sidebar for irwin-2/)).toBeInTheDocument();
  });

  it('opens NHC storms in the hurricane sidebar with the live NHC data', () => {
    renderPanel({ type: 'nhc-storm', id: 'nhc-storm-EP2', name: 'Rachel' }, { nhc: { cyclones: [{ id: 'nhc-storm-EP2' }] } });
    expect(screen.getByText('hurricane sidebar for nhc-storm-EP2 (1 live storms)')).toBeInTheDocument();
    expect(screen.queryByText(/incident sidebar/)).not.toBeInTheDocument();
  });
});
