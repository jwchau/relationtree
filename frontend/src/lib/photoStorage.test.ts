import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { MAX_PHOTO_SIZE_BYTES, photoProblem, uploadPersonPhoto } from './photoStorage';

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

describe('uploadPersonPhoto', () => {
  const original = file('image/jpeg', 3_000);
  const thumb = new Blob([new Uint8Array(500)], { type: 'image/webp' });
  let post: ReturnType<typeof vi.fn>;
  let put: ReturnType<typeof vi.fn>;
  let r2: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    post = vi.fn(async (_path: string, { body }: { body: { thumb?: unknown } }) => ({
      data: {
        upload_url: 'https://r2.test/photo',
        key: 'k/photo.jpg',
        thumb_upload_url: body.thumb ? 'https://r2.test/thumb' : null,
        thumb_key: body.thumb ? 'k/photo.thumb.webp' : null,
      },
      response: new Response(),
    }));
    put = vi.fn(async () => ({ data: { id: 'sam' }, response: new Response() }));
    vi.spyOn(api, 'POST').mockImplementation(post as unknown as typeof api.POST);
    vi.spyOn(api, 'PUT').mockImplementation(put as unknown as typeof api.PUT);
    r2 = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', r2);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uploads a thumbnail beside the photo and confirms both', async () => {
    await uploadPersonPhoto('sam', original, async () => thumb);

    expect(post.mock.calls[0][1].body).toEqual({
      content_type: 'image/jpeg',
      size: 3_000,
      thumb: { content_type: 'image/webp', size: 500 },
    });
    expect(r2).toHaveBeenCalledWith('https://r2.test/photo', {
      method: 'PUT',
      body: original,
      headers: { 'Content-Type': 'image/jpeg' },
    });
    expect(r2).toHaveBeenCalledWith('https://r2.test/thumb', {
      method: 'PUT',
      body: thumb,
      headers: { 'Content-Type': 'image/webp' },
    });
    expect(put.mock.calls[0][1].body).toEqual({ key: 'k/photo.jpg', thumb_key: 'k/photo.thumb.webp' });
  });

  it("still saves the photo when the thumbnail can't be made", async () => {
    await uploadPersonPhoto('sam', original, async () => {
      throw new Error('cannot decode');
    });

    expect(post.mock.calls[0][1].body).toEqual({ content_type: 'image/jpeg', size: 3_000 });
    expect(r2).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][1].body).toEqual({ key: 'k/photo.jpg' });
  });

  it("still saves the photo when the thumbnail's upload fails", async () => {
    r2.mockImplementation(async (url: string) =>
      new Response(null, { status: url.endsWith('/thumb') ? 403 : 200 }),
    );

    await uploadPersonPhoto('sam', original, async () => thumb);

    expect(put.mock.calls[0][1].body).toEqual({ key: 'k/photo.jpg' });
  });

  it("fails when the photo's own upload fails", async () => {
    r2.mockImplementation(async () => new Response(null, { status: 403 }));

    await expect(uploadPersonPhoto('sam', original, async () => thumb)).rejects.toThrow(
      'Photo upload failed',
    );
    expect(put).not.toHaveBeenCalled();
  });
});
