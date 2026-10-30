// The app never shows a photo bigger than 80px; 256px stays sharp on 3x screens.
const THUMB_SIZE = 256;

/**
 * Which part of a photo the thumbnail keeps: the centre square (avatars crop the same way),
 * scaled down to THUMB_SIZE but never up.
 */
export function thumbnailCrop(
  width: number,
  height: number,
): { sx: number; sy: number; side: number; out: number } {
  const side = Math.min(width, height);
  return {
    sx: Math.floor((width - side) / 2),
    sy: Math.floor((height - side) / 2),
    side,
    out: Math.min(side, THUMB_SIZE),
  };
}

const QUALITY = 0.8;

/**
 * A small square copy of a photo for avatars, or null when this browser can't make one.
 * WebP where the browser can encode it, else JPEG. An animated GIF gives its first frame,
 * and a phone photo's EXIF rotation is applied so portraits don't come out sideways.
 */
export async function makeThumbnail(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const { sx, sy, side, out } = thumbnailCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = out;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);

    const webp = await encode(canvas, 'image/webp');
    // Browsers that can't encode WebP hand back a PNG instead, which would be far bigger.
    if (webp?.type === 'image/webp') return webp;
    return await encode(canvas, 'image/jpeg');
  } finally {
    bitmap.close();
  }
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}
