import { describe, it, expect } from 'vitest';
import { isAllowedPhotoFile, photoFileExtension } from '../../src/api/incidentPhotos';

describe('isAllowedPhotoFile', () => {
  it('accepts JPEG / PNG / WebP / GIF by MIME', () => {
    expect(isAllowedPhotoFile({ type: 'image/jpeg', name: 'a.jpg' })).toBe(true);
    expect(isAllowedPhotoFile({ type: 'image/png', name: 'a.png' })).toBe(true);
    expect(isAllowedPhotoFile({ type: 'image/webp', name: 'a.webp' })).toBe(true);
    expect(isAllowedPhotoFile({ type: 'image/gif', name: 'a.gif' })).toBe(true);
  });

  it('rejects SVG even when named like a raster file', () => {
    expect(isAllowedPhotoFile({ type: 'image/svg+xml', name: 'a.png' })).toBe(false);
    expect(isAllowedPhotoFile({ type: 'image/svg+xml', name: 'a.svg' })).toBe(false);
  });

  it('rejects HTML and executables', () => {
    expect(isAllowedPhotoFile({ type: 'text/html', name: 'a.html' })).toBe(false);
    expect(isAllowedPhotoFile({ type: 'application/octet-stream', name: 'a.exe' })).toBe(false);
  });

  it('falls back to a whitelisted extension when MIME is missing', () => {
    expect(isAllowedPhotoFile({ type: '', name: 'shot.JPEG' })).toBe(true);
    expect(isAllowedPhotoFile({ type: '', name: 'shot.bmp' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isAllowedPhotoFile(null)).toBe(false);
  });
});

describe('photoFileExtension', () => {
  it('prefers MIME over filename', () => {
    expect(photoFileExtension({ type: 'image/png', name: 'foo.jpg' })).toBe('png');
  });

  it('normalizes jpeg to jpg', () => {
    expect(photoFileExtension({ type: 'image/jpeg', name: 'foo.jpeg' })).toBe('jpg');
    expect(photoFileExtension({ type: '', name: 'foo.jpeg' })).toBe('jpg');
  });

  it('returns null for disallowed types', () => {
    expect(photoFileExtension({ type: 'image/svg+xml', name: 'x.svg' })).toBe(null);
    expect(photoFileExtension({ type: '', name: 'x.exe' })).toBe(null);
  });
});
