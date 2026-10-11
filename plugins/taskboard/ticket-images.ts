import { z } from 'zod';

export const ticketImageSchema = z.object({
  name: z.string().min(1).max(200),
  dataUrl: z.string().max(2_800_000)
}).strict();
export type TicketImage = z.infer<typeof ticketImageSchema>;
export const MAX_TICKET_IMAGES = 5;

export async function readTicketImages(files: File[]): Promise<TicketImage[]> {
  if (files.length > MAX_TICKET_IMAGES) throw new Error('Attach up to five images.');
  return Promise.all(files.map(async file => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 2 * 1024 * 1024) {
      throw new Error('Use PNG, JPEG or WebP images up to 2 MB each.');
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read the image.'));
      reader.readAsDataURL(file);
    });
    return { name: file.name.slice(0, 200) || 'clipboard.png', dataUrl };
  }));
}

export async function clipboardTicketImages(): Promise<TicketImage[]> {
  if (!navigator.clipboard?.read) throw new Error('Paste images into the ticket instead.');
  const items = await navigator.clipboard.read();
  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find(type => ['image/png', 'image/jpeg', 'image/webp'].includes(type));
    if (type) files.push(new File([await item.getType(type)], `clipboard-${files.length + 1}.${type.split('/')[1]}`, { type }));
  }
  return readTicketImages(files);
}
