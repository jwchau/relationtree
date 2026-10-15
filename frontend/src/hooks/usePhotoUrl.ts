// Photos move to Cloudflare R2 with presigned URLs in M10 (docs/backend-migration-plan.md).
// Until then nothing resolves, so avatars show their fallback icon.
export function usePhotoUrl(_photoKey: string | null | undefined): string | null {
  return null;
}
