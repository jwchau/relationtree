import { uploadData, remove } from 'aws-amplify/storage';

export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

export function isPhotoTooLarge(file: File): boolean {
  return file.size > MAX_PHOTO_SIZE_BYTES;
}

export async function uploadPersonPhoto(personId: string, file: File): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const result = await uploadData({
    path: ({ identityId }) => `photos/${identityId}/${personId}-${Date.now()}.${ext}`,
    data: file,
  }).result;
  return result.path;
}

export async function deletePersonPhoto(path: string): Promise<void> {
  await remove({ path });
}
