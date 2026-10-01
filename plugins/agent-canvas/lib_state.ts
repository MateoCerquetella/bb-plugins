import { z } from "zod";
const item = z.object({
  x: z.number().finite().min(-100000).max(100000), y: z.number().finite().min(-100000).max(100000),
  w: z.number().finite().min(320).max(900), h: z.number().finite().min(260).max(900),
});
const schema = z.object({ panes: z.record(z.string().max(500), item).refine((panes) => Object.keys(panes).length <= 160), coordinator: z.string().max(240).nullable() });
export type CanvasState = z.infer<typeof schema>;
export const defaults: CanvasState = { panes: {}, coordinator: null };
export function readState(workspace: string): CanvasState {
  try { const parsed = schema.safeParse(JSON.parse(localStorage.getItem(`agent-canvas:v3:${workspace}`) || "null")); return parsed.success ? parsed.data : defaults; }
  catch { return defaults; }
}
export function writeState(workspace: string, value: CanvasState) {
  try { localStorage.setItem(`agent-canvas:v3:${workspace}`, JSON.stringify(schema.parse(value))); } catch { /* storage is optional */ }
}
