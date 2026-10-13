import type { TicketImage } from './ticket-images.js';

export function decodeTicketImage(image: TicketImage) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image.dataUrl);
  if (!match) throw new Error('Invalid image encoding.');
  const bytes = Buffer.from(match[2]!, 'base64');
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new Error('Images must be at most 2 MB.');
  const mimeType = match[1]!;
  const valid = mimeType === 'image/png'
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mimeType === 'image/jpeg'
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw new Error('Image contents do not match its format.');
  return { name: image.name, bytes: new Uint8Array(bytes), mimeType };
}
