import { z } from 'zod';

export const empiricalStatusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('uninitialized') }).strict(),
  z.object({ kind: z.literal('unavailable'), reason: z.string().max(500) }).strict(),
  z.object({ kind: z.literal('invalid'), reason: z.string().max(500) }).strict(),
  z.object({ kind: z.literal('empty') }).strict(),
  z.object({
    kind: z.literal('feature'),
    feature: z.string().max(200),
    revision: z.number().int().nonnegative(),
    phase: z.string().max(100),
    status: z.string().max(100),
    nextAction: z.string().max(1000),
    verification: z.enum(['verified', 'skipped', 'pending']),
    completionLevel: z.string().max(100),
    completionMethod: z.string().max(200).nullable(),
    ownership: z.enum(['selected', 'unclaimed', 'conflict', 'unknown']).optional(),
    owners: z.array(z.string().max(4096)).max(128).optional(),
    mergedButUnclosed: z.boolean().optional()
  }).strict()
]);
export type EmpiricalStatus = z.infer<typeof empiricalStatusSchema>;

export const empiricalHostObservationSchema = z.object({
  environmentId: z.string().min(1),
  root: z.string().min(1).max(4096),
  status: empiricalStatusSchema
}).strict();

export const empiricalSnapshotSchema = z.object({
  hostId: z.string(),
  environmentId: z.string(),
  checkoutRoot: z.string(),
  observedAt: z.number().int().nonnegative(),
  status: empiricalStatusSchema
}).strict();
export type EmpiricalSnapshot = z.infer<typeof empiricalSnapshotSchema>;

export const empiricalObservationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unbound'), reason: z.string().max(500) }).strict(),
  z.object({
    kind: z.literal('observation'),
    hostId: z.string(),
    environmentId: z.string(),
    checkoutRoot: z.string(),
    threadId: z.string(),
    observedAt: z.number().int().nonnegative(),
    status: empiricalStatusSchema,
    lastKnown: empiricalSnapshotSchema.nullable()
  }).strict()
]);
export type EmpiricalObservation = z.infer<typeof empiricalObservationSchema>;
