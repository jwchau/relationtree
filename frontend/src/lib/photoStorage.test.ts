import { describe, expect, it } from 'vitest';
import { MAX_PHOTO_SIZE_BYTES, photoProblem } from './photoStorage';

function file(type: string, size: number): File {
  return new File([new Uint8Array(size)], 'photo', { type });
}

describe('photoProblem', () => {
  it('accepts the image types the API allows, up to the size limit', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
      expect(photoProblem(file(type, MAX_PHOTO_SIZE_BYTES))).toBeNull();
    }
  });

  it('rejects other types, including SVG and HEIC', () => {
    for (const type of ['image/svg+xml', 'image/heic', 'application/pdf', '']) {
      expect(photoProblem(file(type, 10))).toMatch(/JPEG, PNG, WebP or GIF/);
    }
  });

  it('rejects files over 5MB', () => {
    expect(photoProblem(file('image/png', MAX_PHOTO_SIZE_BYTES + 1))).toMatch(/under 5MB/);
  });
});
