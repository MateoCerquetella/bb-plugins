import { z } from 'zod';
import { empiricalObservationSchema } from '../empirical/contract.ts';

export const factoryExecutionSchema = z.object({
  providerId: z.string().min(1).max(200),
  model: z.string().min(1).max(500),
  permissionMode: z.enum(['full', 'auto', 'accept-edits']),
  reasoningLevel: z.enum([
    'none', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'ultracode'
  ]),
  serviceTier: z.enum(['default', 'fast'])
}).strict();
export type FactoryExecution = z.infer<typeof factoryExecutionSchema>;

export const factoryProjectPolicySchema = z.object({
  projectId: z.string().startsWith('proj_').max(500),
  enabled: z.boolean().default(false),
  provider: z.enum(['github', 'gitlab', 'linear', 'jira', 'gitea']),
  intake: z.literal('todo').default('todo'),
  maxConcurrent: z.number().int().min(1).max(20).default(1),
  execution: factoryExecutionSchema.nullable().default(null),
  updatedAt: z.string()
}).strict();
export type FactoryProjectPolicy = z.infer<typeof factoryProjectPolicySchema>;
export const factoryAdmissionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manual') }).strict(),
  z.object({ kind: z.literal('factory'), claimedAt: z.string() }).strict()
]);
export type FactoryAdmission = z.infer<typeof factoryAdmissionSchema>;
export const factoryScanObservationSchema = z.object({
  projectId: z.string().startsWith('proj_').max(500),
  observedAt: z.string(),
  kind: z.enum(['success', 'blocked']),
  reason: z.string().nullable(),
  candidates: z.number().int().nonnegative(),
  pendingCandidates: z.number().int().nonnegative().nullable().default(null)
}).strict();
export type FactoryScanObservation = z.infer<typeof factoryScanObservationSchema>;
const factoryProjectObservation = {
  queue: z.number().int().nonnegative().nullable(),
  lastScan: factoryScanObservationSchema.nullable()
};
export const factoryProjectStatusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('disabled'), policy: factoryProjectPolicySchema, ...factoryProjectObservation }).strict(),
  z.object({ kind: z.literal('running'), policy: factoryProjectPolicySchema, active: z.number().int().nonnegative(), available: z.number().int().nonnegative(), ...factoryProjectObservation }).strict(),
  z.object({ kind: z.literal('paused'), policy: factoryProjectPolicySchema, active: z.number().int().nonnegative(), ...factoryProjectObservation }).strict(),
  z.object({ kind: z.literal('blocked'), policy: factoryProjectPolicySchema, reason: z.string(), active: z.number().int().nonnegative(), ...factoryProjectObservation }).strict()
]);
export type FactoryProjectStatus = z.infer<typeof factoryProjectStatusSchema>;

export const factoryIdentitySchema = z.object({
  projectId: z.string().startsWith('proj_').max(500),
  source: z.enum(['github', 'gitlab', 'linear', 'jira', 'gitea']),
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
  hostId: z.string().nullable().default(null),
  checkoutRoot: z.string().nullable().default(null),
  cursor: z.number().int().nonnegative(),
  turnId: z.string().nullable(),
  pendingCompletion: z.object({
    status: z.enum(['finished', 'failed', 'canceled']),
    activity: z.string()
  }).strict().nullable().default(null),
  planDigest: z.string().nullable(),
  scopeDigest: z.string().nullable().default(null),
  activity: z.string(),
  error: z.string().nullable(),
  output: z.string(),
  reviewResult: factoryReviewResultSchema.nullable().default(null),
  buildResult: factoryBuildResultSchema.nullable().default(null),
  repairOf: z.string().nullable().default(null),
  continuationOf: z.string().nullable().default(null),
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
const coordinatorIntent = {
  intentId: z.string().min(1),
  startedAt: z.string().datetime(),
  legacyRunCount: z.number().int().nonnegative().default(0)
};
export const factoryCoordinatorSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }).strict(),
  z.object({ status: z.literal('starting'), ...coordinatorIntent }).strict(),
  z.object({ status: z.literal('uncertain'), ...coordinatorIntent, error: z.string() }).strict(),
  z.object({ status: z.literal('failed'), ...coordinatorIntent, error: z.string() }).strict(),
  z.object({
    status: z.literal('ready'), ...coordinatorIntent, threadId: z.string().min(1),
    nativeStatus: z.enum(['active', 'error', 'idle', 'starting', 'stopping']).default('starting'),
    error: z.string().nullable().default(null)
  }).strict()
]);
export type FactoryCoordinator = z.infer<typeof factoryCoordinatorSchema>;
export const factoryStatusTargetSchema = z.enum(['in_progress', 'review', 'done']);
export type FactoryStatusTarget = z.infer<typeof factoryStatusTargetSchema>;
export const factoryRecordSchema = factoryIdentitySchema.extend({
  schemaVersion: z.literal(1),
  version: z.number().int().nonnegative(),
  stage: z.enum(['Intake', 'Triage', 'Planning', 'Build', 'Review', 'Done']),
  scopeDigest: z.string(),
  plans: z.array(planSchema),
  approvedDigest: z.string().nullable(),
  admission: factoryAdmissionSchema.default({ kind: 'manual' }),
  execution: factoryExecutionSchema.nullable().default(null),
  // Older dispatched items also adopt the automatic investigate -> plan -> build flow.
  automatic: z.boolean().default(true),
  automationError: z.string().nullable().default(null),
  coordinator: factoryCoordinatorSchema.nullable().default(null),
  trackerProgress: z.object({
    status: z.enum(['pending', 'synced', 'unavailable', 'failed']),
    message: z.string().nullable(),
    target: factoryStatusTargetSchema.nullable().optional(),
    statusName: z.string().max(500).nullable().optional()
  }).strict().default({ status: 'pending', message: null }),
  runs: z.array(factoryRunSchema),
  updatedAt: z.string()
}).strict();
export type FactoryRecord = z.infer<typeof factoryRecordSchema>;
export const factoryVersionInputSchema = factoryIdentitySchema.extend({
  expectedVersion: z.number().int().nonnegative()
}).strict();
export const factoryPickerRoutingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('host'), hostId: z.string().min(1).max(500) }).strict(),
  z.object({ kind: z.literal('environment'), environmentId: z.string().min(1).max(500) }).strict()
]);
export type FactoryPickerRouting = z.infer<typeof factoryPickerRoutingSchema>;
export const factoryExecutionOptionsSchema = z.object({
  defaults: factoryExecutionSchema.nullable(),
  selected: factoryExecutionSchema.nullable(),
  routing: factoryPickerRoutingSchema.nullable()
}).strict();
export type FactoryExecutionOptions = z.infer<typeof factoryExecutionOptionsSchema>;
export const factoryRpcMethods = {
  factoryGetProject: {
    input: z.object({ projectId: z.string().startsWith('proj_') }).strict(),
    output: z.object({ policy: factoryProjectPolicySchema, status: factoryProjectStatusSchema }).strict()
  },
  factoryExecutionOptions: {
    input: z.object({
      projectId: z.string().startsWith('proj_'),
      providerId: z.string().min(1).max(200).nullable().default(null),
      threadId: z.string().min(1).max(500).nullable().default(null)
    }).strict(),
    output: factoryExecutionOptionsSchema
  },
  factorySaveProject: {
    input: factoryProjectPolicySchema.omit({ updatedAt: true }).strict(),
    output: z.object({ policy: factoryProjectPolicySchema, status: factoryProjectStatusSchema }).strict()
  },
  factoryScanProject: {
    input: z.object({ projectId: z.string().startsWith('proj_') }).strict(),
    output: z.object({ status: factoryProjectStatusSchema }).strict()
  },
  factoryEmpirical: {
    input: factoryIdentitySchema,
    output: empiricalObservationSchema
  },
  factoryDiff: {
    input: factoryIdentitySchema.extend({
      runId: z.string().min(1).max(500), path: z.string().min(1).max(4000)
    }).strict(),
    output: z.object({
      patch: z.string().max(200_000).nullable(), message: z.string().nullable(),
      truncated: z.boolean()
    }).strict()
  },
  factoryStartTask: {
    input: factoryIdentitySchema.extend({
      contextThreadId: z.string().min(1).nullable(),
      execution: factoryExecutionSchema.nullable().optional()
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
  factoryAdoptCoordinator: {
    input: factoryVersionInputSchema,
    output: z.object({ record: factoryRecordSchema }).strict()
  },
  factoryRetryCoordinator: {
    input: factoryVersionInputSchema.extend({ intentId: z.string().min(1).max(500) }).strict(),
    output: z.object({ record: factoryRecordSchema }).strict()
  },
  factoryRecoverCoordinator: {
    input: factoryVersionInputSchema.extend({
      intentId: z.string().min(1).max(500), threadId: z.string().min(1).max(500)
    }).strict(),
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
  factorySetExecution: {
    input: factoryVersionInputSchema.extend({
      execution: factoryExecutionSchema.nullable()
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
