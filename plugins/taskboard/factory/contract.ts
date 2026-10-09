import { z } from 'zod';

export const factoryIdentitySchema = z.object({
  projectId: z.string().startsWith('proj_').max(500),
  source: z.enum(['github', 'gitlab', 'linear', 'jira']),
  locator: z.string().min(1).max(2000)
}).strict();
export type FactoryIdentity = z.infer<typeof factoryIdentitySchema>;
export const factoryRunKindSchema = z.enum(['investigate', 'plan', 'build', 'review']);
export type FactoryRunKind = z.infer<typeof factoryRunKindSchema>;
export const factoryReviewResultSchema = z.object({
  verdict: z.enum(['blocked', 'passed', 'unknown']),
  findings: z.string().max(100_000)
}).strict();
export const factoryBuildResultSchema = z.object({
  verdict: z.enum(['implemented', 'blocked', 'needs_input', 'unknown']),
  summary: z.string().max(100_000),
  revision: z.string().max(500).nullable()
}).strict();
const planSchema = z.object({
  revision: z.number().int().positive(),
  body: z.string().min(1).max(100_000),
  digest: z.string(),
  scopeDigest: z.string(),
  createdAt: z.string()
}).strict();
export const factoryRunSchema = z.object({
  id: z.string(),
  kind: factoryRunKindSchema,
  status: z.enum(['starting', 'running', 'finished', 'failed', 'canceled', 'uncertain']),
  threadId: z.string().nullable(),
  environmentId: z.string().nullable(),
  cursor: z.number().int().nonnegative(),
  turnId: z.string().nullable(),
  planDigest: z.string().nullable(),
  scopeDigest: z.string().nullable().default(null),
  activity: z.string(),
  error: z.string().nullable(),
  output: z.string(),
  reviewResult: factoryReviewResultSchema.nullable().default(null),
  buildResult: factoryBuildResultSchema.nullable().default(null),
  repairOf: z.string().nullable().default(null),
  updates: z.array(z.object({ id: z.string(), text: z.string(), at: z.string() }).strict()).default([]),
  checks: z.array(z.object({
    id: z.string(), command: z.string(), exitCode: z.number().nullable(),
    output: z.string()
  }).strict()).default([]),
  changedFiles: z.array(z.string()).default([]),
  steps: z.array(z.object({
    step: z.string(), status: z.enum(['active', 'completed', 'failed', 'pending'])
  }).strict()).default([]),
  startedAt: z.string(),
  finishedAt: z.string().nullable()
}).strict();
export type FactoryRun = z.infer<typeof factoryRunSchema>;
export const factoryRecordSchema = factoryIdentitySchema.extend({
  schemaVersion: z.literal(1),
  version: z.number().int().nonnegative(),
  stage: z.enum(['Intake', 'Triage', 'Planning', 'Build', 'Review', 'Done']),
  scopeDigest: z.string(),
  plans: z.array(planSchema),
  approvedDigest: z.string().nullable(),
  // Older dispatched items also adopt the automatic investigate -> plan -> build flow.
  automatic: z.boolean().default(true),
  automationError: z.string().nullable().default(null),
  trackerProgress: z.object({
    status: z.enum(['pending', 'synced', 'unavailable', 'failed']),
    message: z.string().nullable()
  }).strict().default({ status: 'pending', message: null }),
  runs: z.array(factoryRunSchema),
  updatedAt: z.string()
}).strict();
export type FactoryRecord = z.infer<typeof factoryRecordSchema>;
export const factoryVersionInputSchema = factoryIdentitySchema.extend({
  expectedVersion: z.number().int().nonnegative()
}).strict();
export const factoryRpcMethods = {
  factoryStartTask: {
    input: factoryIdentitySchema.extend({
      contextThreadId: z.string().min(1).nullable()
    }).strict(),
    output: z.object({ record: factoryRecordSchema }).strict()
  },
  factoryRetryStatus: {
    input: factoryIdentitySchema,
    output: z.object({ record: factoryRecordSchema }).strict()
  },
  factoryRecover: {
    input: factoryVersionInputSchema.extend({ threadId: z.string().min(1).max(500) }).strict(),
    output: z.object({ record: factoryRecordSchema }).strict()
  },
  factoryGet: {
    input: factoryIdentitySchema,
    output: z.object({ record: factoryRecordSchema.nullable() }).strict()
  },
  factoryForThread: {
    input: z.object({ threadId: z.string().min(1) }).strict(),
    output: z.object({ record: factoryRecordSchema.nullable() }).strict()
  },
  factoryStart: {
    input: factoryVersionInputSchema.extend({
      kind: factoryRunKindSchema,
      contextThreadId: z.string().min(1).nullable(),
      retry: z.boolean().default(false)
    }).strict(),
    output: z.object({ record: factoryRecordSchema }).strict()
  },
  factorySavePlan: {
    input: factoryVersionInputSchema.extend({
      body: z.string().trim().min(1).max(100_000)
    }).strict(),
    output: z.object({ record: factoryRecordSchema }).strict()
  },
  factoryApprovePlan: {
    input: factoryVersionInputSchema.extend({
      digest: z.string().min(1)
    }).strict(),
    output: z.object({ record: factoryRecordSchema }).strict()
  }
};
