import { z } from "zod";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
// GIFs are stored as uploaded: resizing through a canvas would drop every
// frame after the first, so they get a larger, fixed budget instead.
export const MAX_GIF_BYTES = 8 * 1024 * 1024;
// Stills are resized to this size; GIFs cannot be, so they must already fit
// within it to stay inside common GPU texture limits and frame memory.
export const MAX_GIF_SIDE = 4096;
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
export const SLOT_COUNT = 6;
export const PATTERNS = ["noise", "warp", "dots", "wave", "ripple", "swirl", "sphere"] as const;
export const DITHERS = ["random", "2x2", "4x4", "8x8"] as const;
export const PHOTO_MOTIONS = ["wave", "ripple", "drift", "shimmer", "still"] as const;
// Stored settings may come from a newer Aura build (for example after a user
// downgrades, or an older published release reads data written by this one).
// Unknown keys are stripped instead of rejecting the whole snapshot.
export const settingsSchema = z.object({
  enabled: z.boolean(),
  newThreadOnly: z.boolean().default(false),
  dimmerEnabled: z.boolean().default(true),
  activityOverview: z.boolean().default(false),
  effect: z.enum(["pixels", "none"]),
  pattern: z.enum(PATTERNS).default("noise"),
  dither: z.enum(DITHERS).default("8x8"),
  photoMotion: z.enum(PHOTO_MOTIONS).default("wave"),
  fps: z.union([z.literal(15), z.literal(30), z.literal(60)]).default(15),
  quality: z.enum(["performance", "balanced", "sharp"]).default("balanced"),
  tint: z.enum(["lavender", "theme"]),
  intensity: z.number().min(0).max(1),
  imageOpacity: z.number().min(0).max(1),
  fit: z.enum(["cover", "contain"]),
  fade: z.number().min(0).max(1),
});
export type BackgroundSettings = z.infer<typeof settingsSchema>;
export const defaults: BackgroundSettings = {
  enabled: true, newThreadOnly: false, dimmerEnabled: true, activityOverview: false, effect: "pixels", pattern: "noise", dither: "8x8", photoMotion: "wave", fps: 15, quality: "balanced", tint: "lavender", intensity: 0.5,
  imageOpacity: 0.7, fit: "cover", fade: 0.35,
};
export const imageInfoSchema = z.object({
  version: z.string().regex(/^[a-f0-9]{24}$/), name: z.string().max(160),
  mime: z.enum(["image/png", "image/jpeg", "image/gif"]), bytes: z.number().int().min(1).max(MAX_GIF_BYTES),
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
  dataUrl: z.string().max(Math.ceil(MAX_GIF_BYTES / 3) * 4 + 40),
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
  // The type hint lets the renderer pick the animated path without fetching
  // first; the server ignores it and serves the stored type.
  return image ? `/api/v1/plugins/aura/http/image?v=${image.version}${image.mime === "image/gif" ? "&type=gif" : ""}` : null;
}
export function isAnimatedImage(url: string | null): boolean {
  return url !== null && (url.startsWith("data:image/gif;") || url.endsWith("&type=gif"));
}
