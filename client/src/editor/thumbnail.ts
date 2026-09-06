/** Edge size of the square preview stored for the projects explorer. */
export const THUMBNAIL_PX = 384

/** WebP where the browser can encode it (Safari can't and silently returns PNG), otherwise JPEG. */
export function encodeThumbnail(canvas: HTMLCanvasElement): string {
  const webp = canvas.toDataURL('image/webp', 0.82)
  if (webp.startsWith('data:image/webp')) return webp
  return canvas.toDataURL('image/jpeg', 0.85)
}
