import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const sessionStatusSchema = z.enum(["idle", "live", "released", "failed"]);

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

export const createOptionsSchema = z
  .object({
    blockAds: z.boolean(),
    width: z.number().int().min(320).max(3840),
    height: z.number().int().min(320).max(2160),
  })
  .strict();

export const rpcContract = defineRpcContract({
  dashboard: {
    input: z.null(),
    output: dashboardSchema,
  },
  createSession: {
    input: createOptionsSchema,
    output: browserSessionSchema,
  },
  releaseSession: {
    input: z.object({ sessionId: z.string().uuid() }).strict(),
    output: z
      .object({
        sessionId: z.string().uuid(),
        success: z.boolean(),
      })
      .strict(),
  },
});

export type BrowserSession = z.infer<typeof browserSessionSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type CreateOptions = z.infer<typeof createOptionsSchema>;
