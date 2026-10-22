export const DEFAULT_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const DEFAULT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];

/**
 * Client-side pre-check only. The server re-validates the real bytes, because a
 * file extension or browser-supplied MIME type can be spoofed.
 */
export function validateFile(
  file: File,
  maxSizeMB: number,
  acceptedFormats: string[] = DEFAULT_FORMATS
): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const typeAccepted = acceptedFormats.includes(file.type);
  const extensionAccepted = DEFAULT_EXTENSIONS.includes(extension);

  if (!typeAccepted && !extensionAccepted) {
    return 'Unsupported format. Please use JPG, PNG, WebP, or AVIF.';
  }
  if (file.size === 0) {
    return 'That file is empty. Please choose a valid image.';
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    return `File too large. Maximum size is ${maxSizeMB} MB.`;
  }
  return null;
}
