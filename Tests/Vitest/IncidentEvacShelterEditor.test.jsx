import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const saveIncidentEvacuations = vi.fn(async () => {});
const saveIncidentShelter = vi.fn(async () => {});
const insertReporterUpdate = vi.fn(async () => {});

vi.mock('../../src/app/hooks/useIncidentDetails', () => ({
  useIncidentEvacuations: () => [
    { id: 'e1', level: 'warning', zones: ['RIV-E1038'], notes: 'Hwy 371 out.', links: [], updated_at: 't1' },
  ],
  useIncidentShelters: () => [],
  saveIncidentEvacuations: (...args) => saveIncidentEvacuations(...args),
  saveIncidentShelter: (...args) => saveIncidentShelter(...args),
  deleteIncidentShelter: vi.fn(),
}));
vi.mock('../../src/app/hooks/useIncidentUpdates', () => ({
  insertReporterUpdate: (...args) => insertReporterUpdate(...args),
}));

const { default: IncidentEvacShelterEditor } = await import('../../src/app/pages/reporter-dashboard/IncidentEvacShelterEditor');

describe('IncidentEvacShelterEditor', () => {
  it('saves levels and posts an evacuation update to the timeline', async () => {
    const user = userEvent.setup();
    render(<IncidentEvacShelterEditor incidentId="inc-1" profile={{ email: 'jdoe@x.test' }} userId="u1" />);

    // Starts from saved rows: warning on with its zones, order off.
    expect(screen.getByLabelText('Evacuation Warning · Level 2 · Set zones')).toHaveValue('RIV-E1038');
    await user.click(screen.getByLabelText('Evacuation Order · Level 3 · Go'));
    await user.type(screen.getByLabelText('Evacuation Order · Level 3 · Go zones'), 'RIV-E1042, RIV-E1043');
    await user.click(screen.getByRole('button', { name: /Save Evacuations/ }));

    expect(saveIncidentEvacuations).toHaveBeenCalledWith({
      incidentId: 'inc-1',
      levels: { order: { zones: ['RIV-E1042', 'RIV-E1043'] }, warning: { zones: ['RIV-E1038'] } },
      notes: 'Hwy 371 out.',
      links: [],
      userId: 'u1',
    });
    expect(insertReporterUpdate).toHaveBeenCalledWith(expect.objectContaining({
      incidentId: 'inc-1',
      updateType: 'evacuation',
      content: 'Evacuation order issued for RIV-E1042, RIV-E1043.',
    }));
    expect(await screen.findByText('Saved and posted to the timeline.')).toBeInTheDocument();
  });

  it('adds a shelter', async () => {
    const user = userEvent.setup();
    render(<IncidentEvacShelterEditor incidentId="inc-1" profile={{}} userId="u1" />);
    await user.click(screen.getByRole('button', { name: /Add shelter/ }));
    await user.type(screen.getByPlaceholderText('e.g. Hamilton High School'), 'Hamilton High School');
    await user.click(screen.getByRole('button', { name: /Save Shelter/ }));
    expect(saveIncidentShelter).toHaveBeenCalledWith(expect.objectContaining({
      incidentId: 'inc-1', userId: 'u1', kind: 'evacuation_center', name: 'Hamilton High School', sort_order: 0,
    }));
  });
});
