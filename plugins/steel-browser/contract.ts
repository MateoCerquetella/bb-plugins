import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const sessionStatusSchema = z.enum(["idle", "live", "released", "failed"]);
export const scopeSchema = z.object({
  threadId: z.string().min(1).max(200).optional(),
  projectId: z.string().min(1).max(200).optional(),
}).strict().refine(value => !!value.threadId || !!value.projectId, "A BB project or thread is required.");
export const enginePolicySchema = z.object({
  engine: z.enum(["playwright", "jev", "auto"]),
  fallback: z.boolean(),
}).strict();
export const bindingSchema = z.object({
  apiUrl: z.string().url(),
  cdpUrl: z.string().url(),
  viewerUrl: z.string().url(),
}).strict();
export const projectStateSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  policy: enginePolicySchema,
  binding: bindingSchema.nullable(),
}).strict();

export const browserSessionSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.string().min(1),
    status: sessionStatusSchema,
    durationMs: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    websocketUrl: z.string(),
    debugUrl: z.string(),
    debuggerUrl: z.string(),
    viewerUrl: z.string(),
    dimensions: z
      .object({
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const dashboardSchema = z
  .object({
    endpoint: z.string().url(),
    connected: z.boolean(),
    checkedAt: z.string(),
    error: z.string().nullable(),
    uiUrl: z.string().url(),
    docsUrl: z.string().url(),
    sessions: z.array(browserSessionSchema),
  })
  .strict();
export const projectSummarySchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  configured: z.boolean(),
  connected: z.boolean(),
  activeSessions: z.number().int().nonnegative(),
}).strict();

export const createOptionsSchema = z
  .object({
    blockAds: z.boolean(),
    width: z.number().int().min(320).max(3840),
    height: z.number().int().min(320).max(2160),
  })
  .strict();

export const navigationUrlSchema = z.string().url().max(2000).refine(value => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
}, "Use an HTTP(S) URL without embedded credentials.");

export const rpcContract = defineRpcContract({
  navigate: {
    input: z.object({scope:scopeSchema,url:navigationUrlSchema}).strict(),
    output: z.object({url:z.string(),title:z.string(),viewerUrl:z.string().url()}).strict(),
  },
  dashboard: {
    input: scopeSchema,
    output: dashboardSchema,
  },
  allProjects: {
    input: z.object({}).strict(),
    output: z.array(projectSummarySchema),
  },
  createSession: {
    input: z.object({ scope: scopeSchema, options: createOptionsSchema }).strict(),
    output: browserSessionSchema,
  },
  releaseSession: {
    input: z.object({ scope: scopeSchema, sessionId: z.string().uuid() }).strict(),
    output: z
      .object({
        sessionId: z.string().uuid(),
        success: z.boolean(),
      })
      .strict(),
  },
  project: { input: scopeSchema, output: projectStateSchema },
  setEngine: {
    input: z.object({ scope: scopeSchema, policy: enginePolicySchema }).strict(),
    output: projectStateSchema,
  },
});

export type BrowserSession = z.infer<typeof browserSessionSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type CreateOptions = z.infer<typeof createOptionsSchema>;
export type Scope = z.infer<typeof scopeSchema>;
export type EnginePolicy = z.infer<typeof enginePolicySchema>;
export type ProjectState = z.infer<typeof projectStateSchema>;
export type Binding = z.infer<typeof bindingSchema>;
