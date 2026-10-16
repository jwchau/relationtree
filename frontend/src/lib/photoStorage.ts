import { ApiError, api, unwrap, type Person } from '@/api/client';

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

/**
 * Upload straight from the browser to R2: the API signs a one-off URL, the browser PUTs the
 * bytes to R2 (they never touch the home server), then the API confirms and records the key.
 */
export async function uploadPersonPhoto(personId: string, file: File): Promise<Person> {
  const path = { person_id: personId };
  const { upload_url, key } = await unwrap(
    api.POST('/api/people/{person_id}/photo/upload-url', {
      params: { path },
      body: { content_type: file.type as PhotoType, size: file.size },
    }),
  );

  // Plain fetch, no credentials: this goes to R2, not our API.
  const upload = await fetch(upload_url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!upload.ok) throw new ApiError(upload.status, 'Photo upload failed');

  return unwrap(api.PUT('/api/people/{person_id}/photo', { params: { path }, body: { key } }));
}

export async function removePersonPhoto(personId: string): Promise<void> {
  await unwrap(api.DELETE('/api/people/{person_id}/photo', { params: { path: { person_id: personId } } }));
}
