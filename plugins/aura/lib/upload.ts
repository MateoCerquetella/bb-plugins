import { MAX_GIF_BYTES, MAX_GIF_SIDE, MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES } from "./model.ts";

const TYPES = /^(image\/png|image\/jpeg|image\/gif)$/;

function readDataUrl(file: File, mime: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;/, `data:${mime};`));
    reader.onerror = () => reject(new Error("Could not read this image.")); reader.readAsDataURL(file);
  });
}

/** Accept camera-sized files; normalize only when necessary to fit storage. */
export async function readImage(file: File): Promise<{ dataUrl: string; resized: boolean }> {
  const mime = file.type || (/\.png$/i.test(file.name) ? "image/png" : /\.jpe?g$/i.test(file.name) ? "image/jpeg" : /\.gif$/i.test(file.name) ? "image/gif" : "");
  if (!TYPES.test(mime) || file.size > MAX_UPLOAD_BYTES || file.size === 0) throw new Error("Choose a PNG or JPG up to 32 MB, or a GIF up to 8 MB.");
  // Resizing a GIF through a canvas keeps only its first frame, so animated
  // images are stored as uploaded or refused.
  if (mime === "image/gif" && file.size > MAX_GIF_BYTES) throw new Error("Choose a GIF up to 8 MB. Larger GIFs cannot be resized without losing their animation.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url;
    try { await img.decode(); } catch { throw new Error("This image could not be read. Choose a valid PNG, JPG or GIF."); }
    if (img.naturalWidth > 16384 || img.naturalHeight > 16384) throw new Error("Choose an image no larger than 16,384 pixels per side.");
    if (mime === "image/gif") {
      if (Math.max(img.naturalWidth, img.naturalHeight) > MAX_GIF_SIDE) throw new Error("Choose a GIF no larger than 4,096 pixels per side.");
      return { dataUrl: await readDataUrl(file, mime), resized: false };
    }
    if (file.size <= MAX_IMAGE_BYTES && Math.max(img.naturalWidth, img.naturalHeight) <= 4096) {
      return { dataUrl: await readDataUrl(file, mime), resized: false };
    }
    let scale = Math.min(1, 4096 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    for (let attempt = 0; attempt < 10; attempt++) {
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Image resizing is unavailable in this browser.");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL(mime, 0.9);
      if (dataUrl.length <= Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 22) return { dataUrl, resized: true };
      scale *= 0.75;
    }
    throw new Error("Could not resize the image. Try a smaller PNG or JPG.");
  } finally { URL.revokeObjectURL(url); }
}
