import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {documentSchema} from "./document.ts";
import {routineSchema,triggerSchema} from "./routines.ts";
import { viewSchema } from "./control.ts";

const id = z.string().min(1).max(240);
const text = z.string().max(240);
export const browserTargetSchema = z.object({
  hostId: id, instanceId: id, generation: id, threadId: id, tabId: id,
});
export const snapshotSchema = z.object({
  controlThreadId: id.nullable(),
  capturedAt: z.number().finite(), truncated: z.boolean(), browsersPartial: z.boolean(),
  threads: z.array(z.object({
    id, projectId: id, environmentId: id.nullable(), parentThreadId: id.nullable(),
    title: text, project: text, environment: text, branch: text,
    provider: text, state: z.enum(["working", "waiting", "failed", "completed", "idle"]),
    updatedAt: z.number().finite(),
  })).max(80),
  browsers: z.array(z.object({
    id, threadId: id, environmentId: id.nullable(), title: text,
    location: z.string().max(500),
    target: browserTargetSchema.nullable(),
  })).max(64),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const rpcContract = defineRpcContract({
  listRoutines:{input:z.object({projectId:id}),output:z.array(routineSchema).max(500)},
  createRoutine:{input:z.object({projectId:id,threadId:id,name:z.string().min(1).max(200),prompt:z.string().min(1).max(30000),trigger:triggerSchema}),output:routineSchema},
  updateRoutine:{input:z.object({projectId:id,automationId:id,threadId:id,name:z.string().min(1).max(200),prompt:z.string().min(1).max(30000),trigger:triggerSchema}),output:routineSchema},
  deleteRoutine:{input:z.object({projectId:id,automationId:id}),output:z.object({ok:z.literal(true)})},
  setRoutineEnabled:{input:z.object({projectId:id,automationId:id,enabled:z.boolean()}),output:routineSchema},
  listFiles: {input:z.object({environmentId:id,query:z.string().max(240)}),output:z.object({paths:z.array(z.object({path:z.string(),name:z.string(),kind:z.enum(["file","directory"])})).max(200),truncated:z.boolean()})},
  readFile: {input:z.object({environmentId:id,path:z.string().min(1).max(2000)}),output:z.object({content:z.string().max(200000),sha256:z.string()})},
  writeFile: {input:z.object({environmentId:id,path:z.string().min(1).max(2000),content:z.string().max(200000),sha256:z.string()}),output:z.object({ok:z.literal(true)})},
  readDocument: {input:z.null(),output:z.object({revision:z.number().int().nonnegative(),document:documentSchema})},
  saveDocument: {input:z.object({revision:z.number().int().nonnegative(),document:documentSchema}),output:z.object({revision:z.number().int().nonnegative()})},
  selectControl: { input: z.object({ threadId: id.nullable() }), output: z.object({ threadId: id.nullable() }) },
  presence: { input: viewSchema, output: z.object({ ok: z.literal(true) }) },
  acknowledge: {
    input: z.object({ clientId: id, requestId: id, applied: z.boolean(), detail: z.string().max(240) }),
    output: z.object({ ok: z.boolean() }),
  },
  snapshot: { input: z.null(), output: snapshotSchema },
  captureBrowser: {
    input: browserTargetSchema,
    output: z.object({ base64: z.string().max(8_000_000), mimeType: z.literal("image/jpeg") }),
  },
});
