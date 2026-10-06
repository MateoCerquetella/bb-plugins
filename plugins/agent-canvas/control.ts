import { z } from "zod";

const id = z.string().min(1).max(240);
export const uiCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("fit") }).strict(),
  z.object({ action: z.literal("reorganize") }).strict(),
  z.object({ action: z.literal("zoom"), value: z.number().finite().min(0.1).max(1.5) }).strict(),
  z.object({ action: z.literal("focus"), threadId: id }).strict(),
  z.object({ action: z.literal("workspace"), workspaceId: id.nullable() }).strict(),
]);
export type UiCommand = z.infer<typeof uiCommandSchema>;
export const uiMessageSchema = z.object({
  requestId: id, clientId: id, controlThreadId: id, command: uiCommandSchema,
});
export const viewSchema = z.object({
  clientId: id, workspaceId: id.nullable(), zoom: z.number().finite().min(0.1).max(1.5),
  focusedThreadId: id.nullable(), visible: z.boolean(),
});
export type CanvasView = z.infer<typeof viewSchema>;

export function zoomAnchor(left: number, top: number, x: number, y: number, previous: number, next: number) {
  return { left: Math.max(0, (left + x) * next / previous - x), top: Math.max(0, (top + y) * next / previous - y) };
}
