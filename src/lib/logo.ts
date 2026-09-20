export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_MAX_EDGE = 320;
const LOGO_JPEG_QUALITY = 0.72;
const LOGO_DATA_URL = /^data:image\/(png|jpeg|webp);base64,/i;

export function logoTypeError(type: string): string | null {
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(type)) {
    return "Logo must be a PNG, JPEG, or WebP image.";
  }
  return null;
}

/** Persist/render only png|jpeg|webp data URLs — never svg/gif. */
export function isAllowedLogoDataUrl(value: unknown): value is string {
  return typeof value === "string" && LOGO_DATA_URL.test(value) && value.length < 400_000;
}

export function isAllowedLogoFile(file: Pick<File, "type" | "size">): string | null {
  const typeError = logoTypeError(file.type);
  if (typeError) return typeError;
  if (file.size > LOGO_MAX_BYTES) return "Logo must be under 2MB.";
  return null;
}

export async function compressLogo(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LOGO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not compress logo.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", LOGO_JPEG_QUALITY);
}
