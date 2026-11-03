import { z } from "zod";

import { FailureSchema, BotNameSchema } from "./soul-contract.js";

/** One bot's live capability state. */
export const CapabilitySchema = z
  .object({
    bot: BotNameSchema,
    enabled: z.boolean(),
  })
  .strict();

export const CapabilitiesPayloadSchema = z
  .object({
    bots: z.array(CapabilitySchema),
    enabled: z.array(BotNameSchema),
    disabled: z.array(BotNameSchema),
  })
  .strict();

export const CapabilityAuditEntrySchema = z
  .object({
    at: z.string(),
    bot: BotNameSchema,
    enabled: z.boolean(),
    previous: z.boolean(),
    author: z.string(),
    digest: z.string(),
  })
  .strict();

export const CapabilityAuditPayloadSchema = z
  .object({ entries: z.array(CapabilityAuditEntrySchema) })
  .strict();

export const CapabilityPartitionSchema = z
  .object({
    enabled: z.array(BotNameSchema),
    disabled: z.array(BotNameSchema),
  })
  .strict();

export const CapabilitySetPayloadSchema = z
  .object({
    bot: BotNameSchema,
    enabled: z.boolean(),
    previous: z.boolean(),
    author: z.string(),
    /** The write response carries the partition, not the board's bots array. */
    capabilities: CapabilityPartitionSchema,
  })
  .strict();

export const CapabilitiesResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    fetchedAt: z.number(),
    capabilities: CapabilitiesPayloadSchema,
  }),
  FailureSchema,
]);

export const CapabilityAuditResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    fetchedAt: z.number(),
    entries: z.array(CapabilityAuditEntrySchema),
  }),
  FailureSchema,
]);

export const CapabilitySetResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    fetchedAt: z.number(),
    bot: BotNameSchema,
    enabled: z.boolean(),
    previous: z.boolean(),
    author: z.string(),
    capabilities: z.object({
      enabled: z.array(BotNameSchema),
      disabled: z.array(BotNameSchema),
    }),
  }),
  FailureSchema,
]);

export const SetCapabilityInputSchema = z
  .object({
    bot: BotNameSchema,
    enabled: z.boolean(),
  })
  .strict();

export type Capability = z.infer<typeof CapabilitySchema>;
export type CapabilitiesPayload = z.infer<typeof CapabilitiesPayloadSchema>;
export type CapabilityAuditEntry = z.infer<typeof CapabilityAuditEntrySchema>;
export type CapabilitiesResult = z.infer<typeof CapabilitiesResultSchema>;
export type CapabilityAuditResult = z.infer<typeof CapabilityAuditResultSchema>;
export type CapabilitySetResult = z.infer<typeof CapabilitySetResultSchema>;
