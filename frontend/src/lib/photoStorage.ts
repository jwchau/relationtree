import { ApiError, api, unwrap, type Person } from '@/api/client';
import { makeThumbnail } from '@/lib/thumbnail';

// Must match the API's limits (backend/relationtree/photos.py); the API re-checks them, and
// R2 enforces the exact type and size signed into the upload URL.
export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type PhotoType = (typeof ALLOWED_PHOTO_TYPES)[number];

/** Why this file can't be used as a photo, or null if it's fine. */
export function photoProblem(file: File): string | null {
  if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return 'Photo must be a JPEG, PNG, WebP or GIF';
  }
  if (file.size > MAX_PHOTO_SIZE_BYTES) return 'Photo must be under 5MB';
  return null;
}

type ThumbType = 'image/webp' | 'image/jpeg';

/**
 * Upload straight from the browser to R2: the API signs one-off URLs, the browser PUTs the
 * photo and its thumbnail to R2 (they never touch the home server), then the API confirms and
 * records the keys.
 */
export async function uploadPersonPhoto(
  personId: string,
  file: File,
  makeThumb: (file: File) => Promise<Blob | null> = makeThumbnail,
): Promise<Person> {
  const path = { person_id: personId };
  // The thumbnail is a nicety: without it the app shows the original, so never fail over it.
  const thumb = await makeThumb(file).catch(() => null);
  const { upload_url, key, thumb_upload_url, thumb_key } = await unwrap(
    api.POST('/api/people/{person_id}/photo/upload-url', {
      params: { path },
      body: {
        content_type: file.type as PhotoType,
        size: file.size,
        ...(thumb && { thumb: { content_type: thumb.type as ThumbType, size: thumb.size } }),
      },
    }),
  );

  await putToR2(upload_url, file);
  const thumbSaved =
    thumb && thumb_upload_url
      ? await putToR2(thumb_upload_url, thumb).then(
          () => true,
          () => false,
        )
      : false;

  return unwrap(
    api.PUT('/api/people/{person_id}/photo', {
      params: { path },
      body: { key, ...(thumbSaved && thumb_key && { thumb_key }) },
    }),
  );
}

async function putToR2(url: string, body: Blob) {
  // Plain fetch, no credentials: this goes to R2, not our API.
  const upload = await fetch(url, { method: 'PUT', body, headers: { 'Content-Type': body.type } });
  if (!upload.ok) throw new ApiError(upload.status, 'Photo upload failed');
}

export async function removePersonPhoto(personId: string): Promise<void> {
  await unwrap(api.DELETE('/api/people/{person_id}/photo', { params: { path: { person_id: personId } } }));
}
