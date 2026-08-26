const AVATAR_SIZE = 256;
const AVATAR_QUALITY = 0.85;

/**
 * Downscales/crops an image file to a square avatar client-side (canvas),
 * so the Worker never needs to do image processing. Cover-crops to a
 * centered square before resizing, exports as WebP.
 */
export async function resizeImageToAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", AVATAR_QUALITY)
  );
  if (!blob) throw new Error("Failed to encode avatar image");
  return blob;
}
