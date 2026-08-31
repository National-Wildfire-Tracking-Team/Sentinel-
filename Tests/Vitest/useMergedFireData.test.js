import { describe, it, expect } from 'vitest';
import { getFireMatchKey } from '../../src/app/hooks/useMergedFireData';

describe('getFireMatchKey', () => {
  it('normalizes a basic fire name', () => {
    expect(getFireMatchKey('RIDGE FIRE')).toBe('RIDGE');
  });

  it('strips PERIMETER suffix', () => {
    expect(getFireMatchKey('RIDGE FIRE PERIMETER')).toBe('RIDGE');
  });

  it('strips INCIDENT suffix', () => {
    expect(getFireMatchKey('RIDGE FIRE INCIDENT')).toBe('RIDGE');
  });

  it('handles slash-separated names (takes last)', () => {
    expect(getFireMatchKey('AREA A/RIDGE FIRE')).toBe('RIDGE');
  });

  it('collapses whitespace', () => {
    expect(getFireMatchKey('RIDGE  FIRE')).toBe('RIDGE');
  });

  it('returns null for null/undefined', () => {
    expect(getFireMatchKey(null)).toBeNull();
    expect(getFireMatchKey(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getFireMatchKey('')).toBeNull();
  });

  it('returns null for "Unknown"', () => {
    expect(getFireMatchKey('Unknown')).toBeNull();
  });

  it('returns null for "Unknown Fire"', () => {
    expect(getFireMatchKey('Unknown Fire')).toBeNull();
  });

  it('returns null for "Unnamed"', () => {
    expect(getFireMatchKey('Unnamed')).toBeNull();
  });

  it('returns null for whitespace-only string that normalizes to empty', () => {
    expect(getFireMatchKey('   ')).toBeNull();
  });

  it('handles lowercase input', () => {
    expect(getFireMatchKey('ridge fire')).toBe('RIDGE');
  });

  it('handles mixed case', () => {
    expect(getFireMatchKey('Ridge Fire')).toBe('RIDGE');
  });

  it('strips multiple FIRE PERIMETER occurrences', () => {
    expect(getFireMatchKey('CREEK FIRE PERIMETER')).toBe('CREEK');
  });

  it('handles single-word names', () => {
    expect(getFireMatchKey('CREEK')).toBe('CREEK');
  });

  it('returns null when normalization leaves empty string', () => {
    // "FIRE" alone becomes empty after stripping
    expect(getFireMatchKey('FIRE')).toBeNull();
  });

  it('handles names with numbers', () => {
    expect(getFireMatchKey('HIGHWAY 5 FIRE')).toBe('HIGHWAY5');
  });
});
