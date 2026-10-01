/**
 * weatherModelsComponents.test.jsx
 * Weather Models UI rules: every value is shown with its model and run,
 * model output is labelled as such, unavailable variables say so, and the
 * comparison doesn't pick a winner.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ModelReadout from '../../src/app/components/WeatherModels/ModelReadout';
import RunBadges from '../../src/app/components/WeatherModels/RunBadges';
import ModelComparison from '../../src/app/components/WeatherModels/ModelComparison';

const UNITS = {
  temperature: '°F', relativeHumidity: '%', windSpeed: 'mph', windDirection: '°', windGust: 'mph',
  precipitationRate: 'in/h', precipitationAmount: 'in', pressureSurface: 'hPa',
};

const entry = (over = {}) => ({
  validTime: '2026-10-01T18:00:00Z', forecastHour: 6, precipitationPeriodHours: 1,
  temperature: 87.2, relativeHumidity: 31, windSpeed: 14.2, windDirection: 225, windGust: 22.4,
  precipitationRate: 0, precipitationAmount: 0, pressureSurface: 1012.3, ...over,
});

const hrrr = (over = {}) => ({
  model: { id: 'hrrr', name: 'HRRR', fullName: 'High-Resolution Rapid Refresh', operator: 'NOAA NWS NCEP', resolution: '3 km' },
  modelSelection: { requested: 'hrrr', mode: 'explicit' },
  run: { runTime: '2026-10-01T12:00:00Z', ageMinutes: 130, stale: false, complete: true, forecastHoursAvailable: 48, selection: 'latest', newestRunTime: '2026-10-01T12:00:00Z' },
  retrievedAt: '2026-10-01T14:10:00Z',
  units: UNITS,
  unavailableVariables: [],
  forecast: [entry()],
  ...over,
});

const gfsUnits = { ...UNITS };
delete gfsUnits.windGust;
const gfs = (over = {}) => hrrr({
  model: { id: 'gfs', name: 'GFS', fullName: 'Global Forecast System', operator: 'NOAA NWS NCEP', resolution: '0.25°' },
  run: { ...hrrr().run, runTime: '2026-10-01T06:00:00Z' },
  units: gfsUnits,
  unavailableVariables: ['windGust'],
  forecast: [entry({ temperature: 84.9, windGust: undefined, windDirection: 240 })],
  ...over,
});

describe('RunBadges', () => {
  it('identifies model, run, valid time, forecast hour and age', () => {
    const data = hrrr();
    render(<RunBadges data={data} entry={data.forecast[0]} />);
    expect(screen.getByText('HRRR')).toBeInTheDocument();
    expect(screen.getByText(/12Z/)).toBeInTheDocument();
    expect(screen.getByText('18Z')).toBeInTheDocument();
    expect(screen.getByText('+6 h')).toBeInTheDocument();
    expect(screen.getByText('2 h 10 min old')).toBeInTheDocument();
    expect(screen.getByText('HRRR').getAttribute('title')).toMatch(/Numerical model forecast/);
  });

  it('warns about stale, incomplete and fallback data', () => {
    const data = gfs({
      run: { ...gfs().run, stale: true, ageMinutes: 800, complete: false, forecastHoursAvailable: 18 },
      modelSelection: { requested: 'auto', fallbackFrom: 'hrrr' },
    });
    render(<RunBadges data={data} entry={data.forecast[0]} />);
    expect(screen.getByText(/older than usual/)).toBeInTheDocument();
    expect(screen.getByText(/still arriving.*\+18 h/)).toBeInTheDocument();
    expect(screen.getByText(/HRRR was unavailable for this location, so this is GFS/)).toBeInTheDocument();
  });
});

describe('ModelReadout', () => {
  it('shows values with units and the precipitation window', () => {
    const data = hrrr();
    render(<ModelReadout data={data} entry={data.forecast[0]} />);
    expect(screen.getByText('87°F')).toBeInTheDocument();
    expect(screen.getByText('22.4 mph')).toBeInTheDocument();
    expect(screen.getByText('from SW')).toBeInTheDocument();
    expect(screen.getByText('Total in the 1 h ending at this time')).toBeInTheDocument();
  });

  it('says GFS has no gusts instead of showing a number', () => {
    const data = gfs();
    render(<ModelReadout data={data} entry={data.forecast[0]} />);
    expect(screen.getByText('Not in GFS')).toBeInTheDocument();
  });

  it('missing values are dashes', () => {
    const data = hrrr({ forecast: [entry({ relativeHumidity: null })] });
    render(<ModelReadout data={data} entry={data.forecast[0]} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('ModelComparison', () => {
  it('shows both runs and a neutral difference', () => {
    render(<ModelComparison hrrr={hrrr()} gfs={gfs()} validTime="2026-10-01T18:00:00Z" />);
    expect(screen.getByText('run 12Z')).toBeInTheDocument();
    expect(screen.getByText('run 06Z')).toBeInTheDocument();
    expect(screen.getByText('+2°F')).toBeInTheDocument(); // 87 vs 85 rounded
    expect(screen.getByText('15° apart')).toBeInTheDocument();
    expect(screen.getByText('Not in GFS')).toBeInTheDocument();
    expect(screen.getByText(/not that either one is wrong/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/more accurate|better|winner|correct/i);
  });

  it('handles a valid time GFS doesn’t have', () => {
    render(<ModelComparison hrrr={hrrr()} gfs={gfs({ forecast: [] })} validTime="2026-10-01T18:00:00Z" />);
    expect(screen.getByText('GFS has no forecast step at this exact time.')).toBeInTheDocument();
  });
});
