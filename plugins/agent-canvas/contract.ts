import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const id = z.string().min(1).max(240);
const text = z.string().max(240);
export const snapshotSchema = z.object({
  capturedAt: z.number().finite(), truncated: z.boolean(),
  threads: z.array(z.object({
    id, title: text, project: text, environment: text, branch: text,
    provider: text, state: z.enum(["working", "waiting", "failed", "completed", "idle"]),
    updatedAt: z.number().finite(),
  })).max(80),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const rpcContract = defineRpcContract({
  snapshot: { input: z.null(), output: snapshotSchema },
});
