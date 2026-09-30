import { z } from "zod";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
export const SLOT_COUNT = 6;
export const settingsSchema = z.object({
  enabled: z.boolean(),
  newThreadOnly: z.boolean().default(false),
  dimmerEnabled: z.boolean().default(true),
  effect: z.enum(["pixels", "none"]),
  tint: z.enum(["lavender", "theme"]),
  intensity: z.number().min(0).max(1),
  imageOpacity: z.number().min(0).max(1),
  fit: z.enum(["cover", "contain"]),
  fade: z.number().min(0).max(1),
}).strict();
export type BackgroundSettings = z.infer<typeof settingsSchema>;
export const defaults: BackgroundSettings = {
  enabled: true, newThreadOnly: false, dimmerEnabled: true, effect: "pixels", tint: "lavender", intensity: 0.5,
  imageOpacity: 0.7, fit: "cover", fade: 0.35,
};
export const imageInfoSchema = z.object({
  version: z.string().regex(/^[a-f0-9]{24}$/), name: z.string().max(160),
  mime: z.enum(["image/png", "image/jpeg"]), bytes: z.number().int().min(1).max(MAX_IMAGE_BYTES),
});
export const slotNumberSchema = z.number().int().min(1).max(SLOT_COUNT);
export const slotSchema = z.object({
  slot: slotNumberSchema, name: z.string().trim().min(1).max(60),
  settings: settingsSchema, image: imageInfoSchema.nullable(),
});
export const snapshotSchema = z.object({
  settings: settingsSchema, image: imageInfoSchema.nullable(),
  slots: z.array(slotSchema).max(SLOT_COUNT), activeSlot: slotNumberSchema.nullable(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const uploadSchema = z.object({
  name: z.string().trim().min(1).max(160),
  dataUrl: z.string().max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 40),
}).strict();
export const applySchema = z.object({
  settings: settingsSchema,
  image: z.discriminatedUnion("action", [
    z.object({ action: z.literal("keep") }).strict(),
    z.object({ action: z.literal("remove") }).strict(),
    uploadSchema.extend({ action: z.literal("replace") }).strict(),
  ]),
  saveSlot: z.object({ slot: slotNumberSchema, name: z.string().trim().min(1).max(60) }).strict().optional(),
}).strict();
export type ApplyInput = z.infer<typeof applySchema>;
export const CHANGED = "aura-changed";
export function imageUrl(image: Snapshot["image"]): string | null {
  return image ? `/api/v1/plugins/aura/http/image?v=${image.version}` : null;
}
