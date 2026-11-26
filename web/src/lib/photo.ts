/**
 * Making photos smaller before they are uploaded, and turning a camera frame into a photo.
 *
 * The model only sees a 128-pixel square, and zoom search works on at most about 1000 pixels a side, so a
 * 12-megapixel phone photo carries far more than the model uses. Shrinking it to 1600 pixels on the long side
 * makes the upload around ten times smaller and changes nothing the model sees in practice
 * (docs/decisions.md 6.1). Whatever cannot be shrunk (a format the browser cannot decode, such as HEIC
 * outside Safari) is sent as it is; the server reads those itself.
 */

/** Longest side of an uploaded photo, in pixels */
export const MAX_SIDE = 1600;
/** Photos already within MAX_SIDE are re-encoded only if they are bigger than this */
const SMALL_ENOUGH_BYTES = 1.5 * 1024 * 1024;
const JPEG_QUALITY = 0.9;

/** The size that fits within max x max pixels and keeps the shape; never enlarges. */
export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function jpegName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
}

/** Draws a picture into a JPEG of the given size. Transparent areas become white, as the server does. */
function encode(
  source: CanvasImageSource,
  size: { width: number; height: number },
  name: string,
): Promise<File | null> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return new Promise((resolve) =>
    canvas.toBlob(
      (blob) => resolve(blob ? new File([blob], jpegName(name), { type: "image/jpeg" }) : null),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
}

/** A smaller JPEG copy of the photo, or the photo itself if it is already small or cannot be decoded here. */
export async function shrinkPhoto(file: File, max = MAX_SIDE): Promise<File> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap;
  try {
    // from-image applies the EXIF rotation, so the copy is upright without it
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    if (Math.max(bitmap.width, bitmap.height) <= max && file.size <= SMALL_ENOUGH_BYTES) return file;
    const small = await encode(bitmap, fitWithin(bitmap.width, bitmap.height, max), file.name);
    return small && small.size < file.size ? small : file;
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

/** The camera's current frame as a JPEG photo, at most MAX_SIDE on the long side. */
export async function frameToPhoto(video: HTMLVideoElement, max = MAX_SIDE): Promise<File | null> {
  if (!video.videoWidth || !video.videoHeight) return null;
  return encode(video, fitWithin(video.videoWidth, video.videoHeight, max), `camera-${Date.now()}.jpg`);
}
