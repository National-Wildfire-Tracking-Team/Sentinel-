import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatAcres,
  formatFRP,
  formatAQI,
  formatRelativeTime,
  formatDateTime,
  formatDate,
  formatPersonnel,
  formatWindSpeed,
  formatTemp,
  formatHumidity,
  formatContainment,
  formatStatus,
  abbreviateNumber,
} from '../../src/app/utils/formatUtils';

describe('formatAcres', () => {
  it('formats large acreage with commas', () => {
    expect(formatAcres(1234567)).toMatch(/1\.23M acres/);
  });

  it('formats small acreage with commas', () => {
    expect(formatAcres(1234)).toBe('1,234 acres');
  });

  it('formats zero acres', () => {
    expect(formatAcres(0)).toBe('0 acres');
  });

  it('returns Unknown for null/undefined', () => {
    expect(formatAcres(null)).toBe('Unknown');
    expect(formatAcres(undefined)).toBe('Unknown');
  });

  it('returns Unknown for NaN', () => {
    expect(formatAcres('not-a-number')).toBe('Unknown');
  });

  it('truncates to two decimals', () => {
    expect(formatAcres(1234.567)).toBe('1,234.56 acres');
  });
});

describe('formatFRP', () => {
  it('formats FRP with one decimal', () => {
    expect(formatFRP(123.456)).toBe('123.5 MW');
  });

  it('formats zero FRP', () => {
    expect(formatFRP(0)).toBe('0.0 MW');
  });

  it('returns Unknown for null/undefined', () => {
    expect(formatFRP(null)).toBe('Unknown');
    expect(formatFRP(undefined)).toBe('Unknown');
  });

  it('returns Unknown for Infinity', () => {
    expect(formatFRP(Infinity)).toBe('Unknown');
  });
});

describe('formatAQI', () => {
  it('formats AQI with category', () => {
    expect(formatAQI(42, 'Good')).toBe('42 – Good');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns Just now for < 60 seconds ago', () => {
    expect(formatRelativeTime(new Date('2025-06-15T11:59:30Z'))).toBe('Just now');
  });

  it('returns minutes ago', () => {
    expect(formatRelativeTime(new Date('2025-06-15T11:55:00Z'))).toBe('5m ago');
  });

  it('returns hours ago', () => {
    expect(formatRelativeTime(new Date('2025-06-15T09:00:00Z'))).toBe('3h ago');
  });

  it('returns days ago', () => {
    expect(formatRelativeTime(new Date('2025-06-12T12:00:00Z'))).toBe('3d ago');
  });

  it('returns formatted date for >= 7 days', () => {
    expect(formatRelativeTime(new Date('2025-06-01T12:00:00Z'))).toBe('Jun 1');
  });

  it('returns Unknown for null', () => {
    expect(formatRelativeTime(null)).toBe('Unknown');
  });

  it('returns Unknown for invalid date', () => {
    expect(formatRelativeTime('not-a-date')).toBe('Unknown');
  });
});

describe('formatDateTime', () => {
  it('formats a valid date', () => {
    const result = formatDateTime('2025-06-15T12:00:00Z');
    expect(result).toContain('Jun');
    expect(result).toContain('2025');
  });

  it('returns Unknown for null', () => {
    expect(formatDateTime(null)).toBe('Unknown');
  });
});

describe('formatDate', () => {
  it('formats a valid date', () => {
    const result = formatDate('2025-06-15T12:00:00Z');
    expect(result).toContain('Jun');
    expect(result).toContain('15');
    expect(result).toContain('2025');
  });

  it('returns Unknown for null', () => {
    expect(formatDate(null)).toBe('Unknown');
  });
});

describe('formatPersonnel', () => {
  it('formats with locale commas', () => {
    expect(formatPersonnel(1234)).toBe('1,234');
  });

  it('returns Unknown for null/undefined', () => {
    expect(formatPersonnel(null)).toBe('Unknown');
    expect(formatPersonnel(undefined)).toBe('Unknown');
  });

  it('formats zero', () => {
    expect(formatPersonnel(0)).toBe('0');
  });
});

describe('formatWindSpeed', () => {
  it('formats with mph suffix', () => {
    expect(formatWindSpeed(25)).toBe('25 mph');
  });

  it('returns Unknown for null/undefined', () => {
    expect(formatWindSpeed(null)).toBe('Unknown');
  });
});

describe('formatTemp', () => {
  it('rounds and formats temperature', () => {
    expect(formatTemp(72.6)).toBe('73°F');
  });

  it('formats zero', () => {
    expect(formatTemp(0)).toBe('0°F');
  });

  it('returns Unknown for null/undefined', () => {
    expect(formatTemp(null)).toBe('Unknown');
  });
});

describe('formatHumidity', () => {
  it('formats with % RH suffix', () => {
    expect(formatHumidity(65)).toBe('65% RH');
  });

  it('rounds decimal humidity', () => {
    expect(formatHumidity(65.7)).toBe('66% RH');
  });

  it('returns Unknown for null/undefined', () => {
    expect(formatHumidity(null)).toBe('Unknown');
  });
});

describe('formatContainment', () => {
  it('formats with % suffix', () => {
    expect(formatContainment(75)).toBe('75%');
  });

  it('returns Unknown for null', () => {
    expect(formatContainment(null)).toBe('Unknown');
  });

  it('returns Unknown for undefined', () => {
    expect(formatContainment(undefined)).toBe('Unknown');
  });
});

describe('formatStatus', () => {
  it('capitalizes known statuses', () => {
    expect(formatStatus('active')).toBe('Active');
    expect(formatStatus('containment')).toBe('In Containment');
    expect(formatStatus('controlled')).toBe('Controlled');
    expect(formatStatus('out')).toBe('Out');
  });

  it('returns original string for unknown status', () => {
    expect(formatStatus('unknown')).toBe('unknown');
  });
});

describe('abbreviateNumber', () => {
  it('returns string for numbers < 1000', () => {
    expect(abbreviateNumber(999)).toBe('999');
  });

  it('abbreviates thousands with k suffix', () => {
    expect(abbreviateNumber(1000)).toBe('1.0k');
    expect(abbreviateNumber(1500)).toBe('1.5k');
    expect(abbreviateNumber(25000)).toBe('25.0k');
  });
});
