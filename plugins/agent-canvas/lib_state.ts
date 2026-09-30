import { z } from "zod";
const item = z.object({
  x: z.number().finite().min(0).max(5000), y: z.number().finite().min(0).max(5000),
  w: z.number().finite().min(320).max(900), h: z.number().finite().min(260).max(900),
});
const schema = z.object({ panes: z.record(z.string(), item), coordinator: z.string().max(240).nullable() });
export type CanvasState = z.infer<typeof schema>;
export const defaults: CanvasState = { panes: {}, coordinator: null };
export function readState(): CanvasState {
  try { const parsed = schema.safeParse(JSON.parse(localStorage.getItem("agent-canvas:v1") || "null")); return parsed.success ? parsed.data : defaults; }
  catch { return defaults; }
}
export function writeState(value: CanvasState) {
  try { localStorage.setItem("agent-canvas:v1", JSON.stringify(schema.parse(value))); } catch { /* storage is optional */ }
}
