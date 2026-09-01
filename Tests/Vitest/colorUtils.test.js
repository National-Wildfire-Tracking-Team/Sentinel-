import { describe, it, expect } from 'vitest';
import {
  frpToColor,
  frpToLabel,
  FRP_COLOR_EXPRESSION,
  FRP_RADIUS_EXPRESSION,
  AQI_CATEGORIES,
  getAQICategory,
  aqiToColor,
  PERIMETER_COLORS,
  containmentToColor,
  alertTypeToColor,
} from '../../src/app/utils/colorUtils';

describe('frpToColor', () => {
  it('returns Extreme color for FRP >= 500', () => {
    expect(frpToColor(500)).toBe('#ff0000');
    expect(frpToColor(1000)).toBe('#ff0000');
  });

  it('returns Very High color for FRP >= 200', () => {
    expect(frpToColor(200)).toBe('#ff4500');
    expect(frpToColor(499)).toBe('#ff4500');
  });

  it('returns High color for FRP >= 100', () => {
    expect(frpToColor(100)).toBe('#ff8c00');
    expect(frpToColor(199)).toBe('#ff8c00');
  });

  it('returns Moderate color for FRP >= 50', () => {
    expect(frpToColor(50)).toBe('#ffaa00');
    expect(frpToColor(99)).toBe('#ffaa00');
  });

  it('returns Low color for FRP >= 10', () => {
    expect(frpToColor(10)).toBe('#ffea00');
    expect(frpToColor(49)).toBe('#ffea00');
  });

  it('returns Very Low color for FRP < 10', () => {
    expect(frpToColor(0)).toBe('#ffe066');
    expect(frpToColor(9)).toBe('#ffe066');
  });
});

describe('frpToLabel', () => {
  it('returns correct labels for each threshold', () => {
    expect(frpToLabel(500)).toBe('Extreme');
    expect(frpToLabel(200)).toBe('Very High');
    expect(frpToLabel(100)).toBe('High');
    expect(frpToLabel(50)).toBe('Moderate');
    expect(frpToLabel(10)).toBe('Low');
    expect(frpToLabel(0)).toBe('Very Low');
  });
});

describe('FRP expressions', () => {
  it('FRP_COLOR_EXPRESSION is a valid Mapbox interpolation expression', () => {
    expect(FRP_COLOR_EXPRESSION[0]).toBe('interpolate');
    expect(FRP_COLOR_EXPRESSION[1]).toEqual(['linear']);
  });

  it('FRP_RADIUS_EXPRESSION is a valid Mapbox interpolation expression', () => {
    expect(FRP_RADIUS_EXPRESSION[0]).toBe('interpolate');
    expect(FRP_RADIUS_EXPRESSION[1]).toEqual(['linear']);
  });
});

describe('AQI_CATEGORIES', () => {
  it('has 6 categories from 0 to 500', () => {
    expect(AQI_CATEGORIES).toHaveLength(6);
    expect(AQI_CATEGORIES[0].min).toBe(0);
    expect(AQI_CATEGORIES[5].max).toBe(500);
  });

  it('each category has required fields', () => {
    AQI_CATEGORIES.forEach(cat => {
      expect(cat).toHaveProperty('min');
      expect(cat).toHaveProperty('max');
      expect(cat).toHaveProperty('label');
      expect(cat).toHaveProperty('color');
      expect(cat).toHaveProperty('textColor');
    });
  });
});

describe('getAQICategory', () => {
  it('returns Good for AQI 0-50', () => {
    expect(getAQICategory(0).label).toBe('Good');
    expect(getAQICategory(25).label).toBe('Good');
    expect(getAQICategory(50).label).toBe('Good');
  });

  it('returns Moderate for AQI 51-100', () => {
    expect(getAQICategory(51).label).toBe('Moderate');
    expect(getAQICategory(100).label).toBe('Moderate');
  });

  it('returns Unhealthy for Sensitive Groups for AQI 101-150', () => {
    expect(getAQICategory(101).label).toBe('Unhealthy for Sensitive Groups');
    expect(getAQICategory(150).label).toBe('Unhealthy for Sensitive Groups');
  });

  it('returns Unhealthy for AQI 151-200', () => {
    expect(getAQICategory(151).label).toBe('Unhealthy');
    expect(getAQICategory(200).label).toBe('Unhealthy');
  });

  it('returns Very Unhealthy for AQI 201-300', () => {
    expect(getAQICategory(201).label).toBe('Very Unhealthy');
    expect(getAQICategory(300).label).toBe('Very Unhealthy');
  });

  it('returns Hazardous for AQI 301-500', () => {
    expect(getAQICategory(301).label).toBe('Hazardous');
    expect(getAQICategory(500).label).toBe('Hazardous');
  });

  it('returns Hazardous for AQI > 500 (fallback)', () => {
    expect(getAQICategory(600).label).toBe('Hazardous');
  });
});

describe('aqiToColor', () => {
  it('returns correct color for each category boundary', () => {
    expect(aqiToColor(0)).toBe('#00e400');
    expect(aqiToColor(51)).toBe('#ffff00');
    expect(aqiToColor(101)).toBe('#ff7e00');
    expect(aqiToColor(151)).toBe('#ff0000');
    expect(aqiToColor(201)).toBe('#8f3f97');
    expect(aqiToColor(301)).toBe('#7e0023');
  });
});

describe('containmentToColor', () => {
  it('returns green for >= 75%', () => {
    expect(containmentToColor(75)).toBe('#22c55e');
    expect(containmentToColor(100)).toBe('#22c55e');
  });

  it('returns lime for >= 50%', () => {
    expect(containmentToColor(50)).toBe('#84cc16');
    expect(containmentToColor(74)).toBe('#84cc16');
  });

  it('returns amber for >= 25%', () => {
    expect(containmentToColor(25)).toBe('#f59e0b');
    expect(containmentToColor(49)).toBe('#f59e0b');
  });

  it('returns red for < 25%', () => {
    expect(containmentToColor(0)).toBe('#ef4444');
    expect(containmentToColor(24)).toBe('#ef4444');
  });
});

describe('alertTypeToColor', () => {
  it('is a function', () => {
    expect(typeof alertTypeToColor).toBe('function');
  });

  it('returns a hex color for known alert types', () => {
    expect(alertTypeToColor('Tornado Warning')).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('returns default color for unknown alert type', () => {
    expect(alertTypeToColor('Unknown Event')).toBe('#3b82f6');
  });
});

describe('PERIMETER_COLORS', () => {
  it('has required fields', () => {
    expect(PERIMETER_COLORS).toHaveProperty('fill');
    expect(PERIMETER_COLORS).toHaveProperty('fillOpacity');
    expect(PERIMETER_COLORS).toHaveProperty('outline');
    expect(PERIMETER_COLORS).toHaveProperty('selectedFill');
    expect(PERIMETER_COLORS).toHaveProperty('selectedOpacity');
  });
});
