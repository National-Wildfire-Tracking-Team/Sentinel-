import { describe, it, expect } from 'vitest';
import {
  NWS_ALERT_COLORS,
  nwsAlertCategory,
  nwsAlertColor,
  DEFAULT_NWS_COLOR,
  NWS_WWA_STYLES,
  getNWSWWAStyle,
  nwsWwaStyleMatchExpression,
  nwsColorMatchExpression,
} from '../../src/app/utils/nwsColors';

describe('NWS_ALERT_COLORS', () => {
  it('contains warning entries', () => {
    expect(NWS_ALERT_COLORS['Tornado Warning']).toBe('#E43831');
    expect(NWS_ALERT_COLORS['Hurricane Warning']).toBe('#CC2936');
  });

  it('contains watch entries', () => {
    expect(NWS_ALERT_COLORS['Tornado Watch']).toBe('#FDF24D');
  });

  it('contains advisory entries', () => {
    expect(NWS_ALERT_COLORS['Wind Advisory']).toBe('#D2691E');
  });

  it('contains FEMA EAS entries', () => {
    expect(NWS_ALERT_COLORS['AMBER Alert']).toBe('#FF6600');
  });

  it('contains statement entries', () => {
    expect(NWS_ALERT_COLORS['Special Weather Statement']).toBe('#6EFAF7');
  });
});

describe('nwsAlertCategory', () => {
  it('returns warning for warning events', () => {
    expect(nwsAlertCategory('Tornado Warning')).toBe('warning');
  });

  it('returns watch for watch events', () => {
    expect(nwsAlertCategory('Tornado Watch')).toBe('watch');
  });

  it('returns advisory for advisory events', () => {
    expect(nwsAlertCategory('Wind Advisory')).toBe('advisory');
  });

  it('returns statement for statement events', () => {
    expect(nwsAlertCategory('Special Weather Statement')).toBe('statement');
  });

  it('returns eas for FEMA EAS events', () => {
    expect(nwsAlertCategory('AMBER Alert')).toBe('eas');
  });

  it('returns other for unknown events', () => {
    expect(nwsAlertCategory('Unknown Event')).toBe('other');
  });
});

describe('nwsAlertColor', () => {
  it('returns correct color for known event', () => {
    expect(nwsAlertColor('Tornado Warning')).toBe('#E43831');
  });

  it('returns default color for unknown event', () => {
    expect(nwsAlertColor('Unknown Event')).toBe(DEFAULT_NWS_COLOR);
  });
});

describe('DEFAULT_NWS_COLOR', () => {
  it('is a valid hex color', () => {
    expect(DEFAULT_NWS_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe('NWS_WWA_STYLES', () => {
  it('has a default style', () => {
    expect(NWS_WWA_STYLES.default).toBeDefined();
    expect(NWS_WWA_STYLES.default).toHaveProperty('color');
    expect(NWS_WWA_STYLES.default).toHaveProperty('fill');
    expect(NWS_WWA_STYLES.default).toHaveProperty('stroke');
    expect(NWS_WWA_STYLES.default).toHaveProperty('width');
  });

  it('has style for Tornado Warning', () => {
    expect(NWS_WWA_STYLES['Tornado Warning']).toBeDefined();
    expect(NWS_WWA_STYLES['Tornado Warning'].fill).toBeGreaterThan(0);
  });
});

describe('getNWSWWAStyle', () => {
  it('returns default style for null event', () => {
    expect(getNWSWWAStyle(null)).toEqual(NWS_WWA_STYLES.default);
  });

  it('returns default style for empty string', () => {
    expect(getNWSWWAStyle('')).toEqual(NWS_WWA_STYLES.default);
  });

  it('returns specific style for known event', () => {
    expect(getNWSWWAStyle('Tornado Warning')).toEqual(NWS_WWA_STYLES['Tornado Warning']);
  });

  it('returns default style for unknown event', () => {
    expect(getNWSWWAStyle('Unknown Event')).toEqual(NWS_WWA_STYLES.default);
  });
});

describe('Mapbox expressions', () => {
  it('nwsWwaStyleMatchExpression returns a match expression', () => {
    const expr = nwsWwaStyleMatchExpression('color');
    expect(expr[0]).toBe('match');
    expect(expr[1]).toEqual(['get', 'type']);
  });

  it('nwsColorMatchExpression returns a match expression', () => {
    const expr = nwsColorMatchExpression();
    expect(expr[0]).toBe('match');
    expect(expr[1]).toEqual(['get', 'type']);
    expect(expr[expr.length - 1]).toBe(DEFAULT_NWS_COLOR);
  });
});
