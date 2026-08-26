import { describe, it, expect } from 'vitest';
import { isSafeHttpUrl, sanitizePhotoUrls } from '../../src/utils/safeUrl';

describe('isSafeHttpUrl', () => {
  it('accepts https URLs', () => {
    expect(isSafeHttpUrl('https://example.com/photo.jpg')).toBe(true);
  });

  it('accepts http URLs', () => {
    expect(isSafeHttpUrl('http://cdn.example.com/a.png')).toBe(true);
  });

  it('rejects javascript: URLs', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects relative paths', () => {
    expect(isSafeHttpUrl('/incident-photos/foo.jpg')).toBe(false);
  });

  it('rejects empty / non-string values', () => {
    expect(isSafeHttpUrl('')).toBe(false);
    expect(isSafeHttpUrl('   ')).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
    expect(isSafeHttpUrl(123)).toBe(false);
  });
});

describe('sanitizePhotoUrls', () => {
  it('keeps only absolute http(s) URLs', () => {
    expect(sanitizePhotoUrls([
      'https://ok.example/a.jpg',
      'javascript:alert(1)',
      'http://ok.example/b.png',
      'not a url',
    ])).toEqual([
      'https://ok.example/a.jpg',
      'http://ok.example/b.png',
    ]);
  });

  it('returns [] for non-arrays', () => {
    expect(sanitizePhotoUrls(null)).toEqual([]);
    expect(sanitizePhotoUrls(undefined)).toEqual([]);
    expect(sanitizePhotoUrls('https://x.com/a.jpg')).toEqual([]);
  });
});
