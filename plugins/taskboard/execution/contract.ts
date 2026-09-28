import { z } from 'zod';

const text = z.string().trim().min(1).max(20_000);
export const executionIdSchema = z.string().regex(/^tb_[a-f0-9]{32}$/);
export const routeSchema = z.enum(['direct', 'delegated', 'structured']);
export const engineSchema = z.enum(['local', 'symphony']);
export const checkSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    argv: z.array(z.string().min(1).max(4000)).min(1).max(50),
    inputs: z.array(z.string().min(1).max(500)).max(100).default([]),
    timeoutMs: z.number().int().min(1000).max(900_000).default(120_000)
  })
  .strict();
export const executionScopeSchema = z
  .object({
    repository: text,
    branch: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,199}$/),
    baseBranch: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,199}$/),
    baseRevision: z.string().regex(/^[a-f0-9]{40,64}$/),
    route: routeSchema,
    plan: text,
    context: z.string().max(50_000).default(''),
    acceptanceCriteria: z.array(text).min(1).max(50),
    verificationRequirements: z.array(checkSchema).min(1).max(20)
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.repository.startsWith('/')) {
      try {
        const url = new URL(value.repository);
        if (
          !['https:', 'ssh:'].includes(url.protocol) ||
          url.password ||
          (url.protocol === 'https:' && url.username)
        )
          throw new Error();
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: ['repository'],
          message:
            'Use an absolute shared repository path or credential-free HTTPS/SSH URL'
        });
      }
    }
    for (const key of ['branch', 'baseBranch'] as const) {
      if (/\.\.|\/\.|\.lock(?:\/|$)|[/.]$|\/\//.test(value[key])) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Invalid Git branch'
        });
      }
    }
    if (
      new Set(value.verificationRequirements.map(check => check.id)).size !==
      value.verificationRequirements.length
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['verificationRequirements'],
        message: 'Check IDs must be unique'
      });
    }
    for (const check of value.verificationRequirements) {
      if (
        check.inputs.some(
          path =>
            path.startsWith('/') ||
            path.split('/').includes('..') ||
            path.startsWith(':')
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['verificationRequirements'],
          message: 'Check inputs must be repository-relative paths'
        });
      }
    }
  });
export const taskReferenceSchema = z
  .object({
    projectId: z.string().min(1),
    source: z.enum(['github', 'linear', 'jira']),
    locator: z.string().min(1)
  })
  .strict();
export const executionRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    taskId: text,
    task: taskReferenceSchema,
    title: z.string().max(1000),
    description: z.string().max(100_000),
    scope: executionScopeSchema,
    metadata: z
      .object({ trackerKey: text, trackerUrl: z.string().max(2000) })
      .strict()
  })
  .strict();
export const executionStateSchema = z.enum([
  'queued',
  'running',
  'retrying',
  'blocked',
  'canceling',
  'canceled',
  'failed',
  'implementation_complete',
  'verifying',
  'verified'
]);
export const runtimeEventSchema = z
  .object({
    eventId: z.string().min(1).max(120),
    generation: z.number().int().positive(),
    state: z.enum([
      'running',
      'retrying',
      'blocked',
      'failed',
      'implementation_complete',
      'canceled'
    ]),
    retryCount: z.number().int().nonnegative().default(0),
    error: z.string().max(2000).nullable().default(null),
    head: z
      .string()
      .regex(/^[a-f0-9]{40,64}$/)
      .nullable()
      .default(null),
    pr: z.string().url().max(2000).nullable().default(null),
    agent: z.string().max(100).default('Codex'),
    runId: z.string().max(200).nullable().default(null)
  })
  .strict();
export const checkResultSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  passed: z.boolean(),
  reused: z.boolean(),
  output: z.string(),
  finishedAt: z.string()
});
export const executionRunSchema = z
  .object({
    id: executionIdSchema,
    dispatchKey: z.string(),
    request: executionRequestSchema,
    digest: z.string(),
    engine: engineSchema,
    endpoint: z.string(),
    runtimeId: z.string(),
    workspace: z.string(),
    state: executionStateSchema,
    generation: z.number().int().positive(),
    iteration: z.number().int().positive(),
    parentId: executionIdSchema.nullable(),
    feedback: z.string(),
    createdAt: z.string(),
    generationStartedAt: z.string(),
    generationRetryBase: z.number().int().nonnegative(),
    startedAt: z.string().nullable(),
    endedAt: z.string().nullable(),
    retryCount: z.number().int().nonnegative(),
    lastError: z.string().nullable(),
    agent: z.string(),
    runId: z.string().nullable(),
    head: z.string().nullable(),
    pr: z.string().nullable(),
    runtimeReleased: z.boolean(),
    verificationAttempted: z.boolean(),
    checks: z.array(checkResultSchema),
    verifiedHead: z.string().nullable(),
    acceptanceReviewed: z.boolean(),
    version: z.number().int().nonnegative()
  })
  .strict();
export const executionConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    defaultEngine: engineSchema.default('local'),
    endpoint: z.string().default('http://127.0.0.1:4000'),
    runtimeId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,80}$/)
      .default('taskboard'),
    workspaceRoot: z.string().default(''),
    maxConcurrency: z.number().int().min(1).max(64).default(4),
    maxRetries: z.number().int().min(0).max(20).default(3),
    runTimeoutMs: z
      .number()
      .int()
      .min(60_000)
      .max(86_400_000)
      .default(3_600_000),
    maxFixIterations: z.number().int().min(0).max(10).default(2)
  })
  .strict();
export type ExecutionRequest = z.infer<typeof executionRequestSchema>;
export type ExecutionScope = z.infer<typeof executionScopeSchema>;
export type ExecutionRun = z.infer<typeof executionRunSchema>;
export type ExecutionState = z.infer<typeof executionStateSchema>;
export type ExecutionConfig = z.infer<typeof executionConfigSchema>;
export type RuntimeEvent = z.infer<typeof runtimeEventSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;
export type TaskReference = z.infer<typeof taskReferenceSchema>;

export const executionRpc = {
  executionDefaults: {
    input: taskReferenceSchema,
    output: z
      .object({
        repository: z.string(),
        baseBranch: z.string(),
        baseRevision: z.string()
      })
      .strict()
  },
  executionConfig: { input: z.null(), output: executionConfigSchema },
  prepareExecution: {
    input: z
      .object({
        task: taskReferenceSchema,
        scope: executionScopeSchema,
        engine: engineSchema
      })
      .strict(),
    output: z
      .object({
        request: executionRequestSchema,
        digest: z.string(),
        engine: engineSchema,
        prompt: z.string()
      })
      .strict()
  },
  startExecution: {
    input: z
      .object({
        request: executionRequestSchema,
        digest: z.string(),
        dispatchKey: z.string().min(1).max(100)
      })
      .strict(),
    output: executionRunSchema
  },
  executionStatus: {
    input: taskReferenceSchema,
    output: z.object({ runs: z.array(executionRunSchema) }).strict()
  },
  executionAction: {
    input: z
      .object({
        id: executionIdSchema,
        action: z.enum(['stop', 'resume', 'verify', 'accept', 'fix']),
        expectedVersion: z.number().int().nonnegative()
      })
      .strict(),
    output: executionRunSchema
  }
};
