export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

// Photo uploads are disabled until M10 moves storage to Cloudflare R2.
export const PHOTO_UPLOADS_ENABLED = false;

export function isPhotoTooLarge(file: File): boolean {
  return file.size > MAX_PHOTO_SIZE_BYTES;
}
