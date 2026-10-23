/**
 * fireDangerFeed.test.jsx
 * Wildfire sidebar "Fire Danger" tab, rendered from the recorded FEMS run in
 * fixtures/femsStations.json (two current stations, MT and GA).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const FIX = JSON.parse(readFileSync(resolve(process.cwd(), 'Tests/Vitest/fixtures/femsStations.json'), 'utf8'));

const setLayer = vi.fn();
const setViewport = vi.fn();
let layers = {};
let hasFireDangerAccess = true;
vi.mock('../../src/shared/hooks/usePlan', () => ({ usePlan: () => ({ hasFireDangerAccess }) }));
vi.mock('../../src/app/context/AppContext', () => ({ useApp: () => ({ layers, setLayer }) }));
vi.mock('../../src/app/context/ViewportContext', () => ({ useViewport: () => ({ setViewport }) }));
vi.mock('../../src/app/api/fireDanger/stations', async (importOriginal) => ({
  ...(await importOriginal()),
  FIRE_DANGER_URL: 'https://cdn.example/fire-danger',
  fetchFireDangerManifest: vi.fn(async () => FIX.manifest),
  fetchStations: vi.fn(async () => FIX.stations),
}));

const { default: FireDangerFeed } = await import('../../src/app/components/Sidebar/FireDangerFeed');

beforeEach(() => { setLayer.mockClear(); setViewport.mockClear(); layers = {}; hasFireDangerAccess = true; });

describe('FireDangerFeed', () => {
  it('is locked to Plus and Pro, without loading stations, on a free plan', async () => {
    hasFireDangerAccess = false;
    const { fetchFireDangerManifest } = await import('../../src/app/api/fireDanger/stations');
    fetchFireDangerManifest.mockClear();
    render(<FireDangerFeed />);
    expect(screen.getByText(/included with Sentinel Plus and Pro/)).toBeTruthy();
    expect(fetchFireDangerManifest).not.toHaveBeenCalled();
  });

  it('shows the national picture for current stations', async () => {
    render(<FireDangerFeed />);
    expect(await screen.findByText(/How dry fuels are at 2 fire weather stations/)).toBeTruthy();
    expect(screen.getByText('The week ahead')).toBeTruthy();
    expect(screen.getByText('ARMELLS CREEK, MT')).toBeTruthy();
    expect(screen.getByText(/not your area's official fire danger rating/)).toBeTruthy();
  });

  it('flies to a station and turns on the ERC layer when no station layer is on', async () => {
    render(<FireDangerFeed />);
    fireEvent.click(await screen.findByText('ARMELLS CREEK, MT'));
    expect(setViewport).toHaveBeenCalledWith({ longitude: -108.86808, latitude: 47.58875, zoom: 9 });
    expect(setLayer).toHaveBeenCalledWith('fdErc', true);
    expect(setLayer).toHaveBeenCalledWith('fdBi', false);
  });

  it('keeps the station layer the user already chose', async () => {
    layers = { fdDeadFm: true };
    render(<FireDangerFeed />);
    fireEvent.click(await screen.findByText('ARMUCHEE, GA'));
    expect(setLayer).not.toHaveBeenCalled();
    expect(setViewport).toHaveBeenCalled();
  });
});
