// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeThumbnail, thumbnailCrop } from './thumbnail';

describe('thumbnailCrop', () => {
  it('takes the centre square of a landscape photo and scales it down to 256px', () => {
    expect(thumbnailCrop(4000, 3000)).toEqual({ sx: 500, sy: 0, side: 3000, out: 256 });
  });

  it('takes the centre square of a portrait photo', () => {
    expect(thumbnailCrop(1080, 1920)).toEqual({ sx: 0, sy: 420, side: 1080, out: 256 });
  });

  it("doesn't scale up a photo smaller than 256px", () => {
    expect(thumbnailCrop(200, 120)).toEqual({ sx: 40, sy: 0, side: 120, out: 120 });
  });
});

describe('makeThumbnail', () => {
  const photo = new File([new Uint8Array(10)], 'photo.jpg', { type: 'image/jpeg' });
  let drawImage: ReturnType<typeof vi.fn>;
  let canvasSizes: { width: number; height: number }[];
  let encodes: { type: string; quality: number }[];
  let canEncodeWebp: boolean;

  beforeEach(() => {
    drawImage = vi.fn();
    canvasSizes = [];
    encodes = [];
    canEncodeWebp = true;
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      canvasSizes.push({ width: this.width, height: this.height });
      return { drawImage } as unknown as CanvasRenderingContext2D;
    } as unknown as HTMLCanvasElement['getContext']);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done, type, quality) => {
      encodes.push({ type: type!, quality: quality as number });
      // Browsers that can't encode a type quietly hand back a PNG instead.
      const made = type === 'image/webp' && !canEncodeWebp ? 'image/png' : type!;
      done(new Blob([new Uint8Array(100)], { type: made }));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('draws the centre square at 256px and encodes it as WebP', async () => {
    const thumb = await makeThumbnail(photo);

    expect(createImageBitmap).toHaveBeenCalledWith(photo, { imageOrientation: 'from-image' });
    expect(canvasSizes).toEqual([{ width: 256, height: 256 }]);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 500, 0, 3000, 3000, 0, 0, 256, 256);
    expect(encodes).toEqual([{ type: 'image/webp', quality: 0.8 }]);
    expect(thumb?.type).toBe('image/webp');
  });

  it("falls back to JPEG where the browser can't encode WebP", async () => {
    canEncodeWebp = false;

    const thumb = await makeThumbnail(photo);

    expect(encodes.map((e) => e.type)).toEqual(['image/webp', 'image/jpeg']);
    expect(thumb?.type).toBe('image/jpeg');
  });
});
