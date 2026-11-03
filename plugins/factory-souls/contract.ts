import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** The factory's fixed bot order. A returned bot outside this list is ignored. */
export const BOT_ORDER = [
  "orchestrator",
  "sieve",
  "helm",
  "lens",
  "warden",
  "audit",
  "lookback",
] as const;

export const BotNameSchema = z.enum(BOT_ORDER);

export const SoulRecordSchema = z.object({
  bot: z.string(),
  soul: z.string(),
});

export const SoulsPayloadSchema = z.object({
  souls: z.array(SoulRecordSchema),
});

const ToolMapSchema = z.record(z.string(), z.array(z.string()));

/**
 * factory_status currently returns a bot-to-conversation map, not authority.
 * Accept the optional tool maps a future status may report, without inferring
 * authority when they are absent.
 */
export const FactoryStatusPayloadSchema = z
  .object({
    toolsByBot: ToolMapSchema.optional(),
    tools: ToolMapSchema.optional(),
    bots: z.unknown().optional(),
    storage: z.string().nullable().optional(),
    startedAt: z.string().nullable().optional(),
  })
  .passthrough();

export const AuditEntrySchema = z.object({
  at: z.string(),
  bot: z.string(),
  author: z.string(),
  digest: z.string(),
  charactersBefore: z.number().int().nonnegative().optional(),
  charactersAfter: z.number().int().nonnegative().optional(),
});

export const SoulAuditPayloadSchema = z.object({
  entries: z.array(AuditEntrySchema),
});

export const SoulSavePayloadSchema = z.object({
  bot: z.string(),
  saved: z.boolean(),
  author: z.string(),
  digest: z.string(),
});

export const FailureReasonSchema = z.enum(["not-running", "unavailable"]);

export const FailureSchema = z.object({
  ok: z.literal(false),
  reason: FailureReasonSchema,
  message: z.string(),
  startCommand: z.string().nullable(),
  fetchedAt: z.number(),
});

export const SoulsResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    fetchedAt: z.number(),
    souls: z.array(SoulRecordSchema),
  }),
  FailureSchema,
]);

export const StatusResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    fetchedAt: z.number(),
    toolsByBot: ToolMapSchema.nullable(),
  }),
  FailureSchema,
]);

export const AuditResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    fetchedAt: z.number(),
    entries: z.array(AuditEntrySchema),
  }),
  FailureSchema,
]);

export const SaveResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    fetchedAt: z.number(),
    bot: z.string(),
    digest: z.string(),
  }),
  FailureSchema,
]);

export const SaveSoulInputSchema = z
  .object({
    bot: BotNameSchema,
    soul: z.string().min(1).max(200_000),
    author: z.string().trim().min(1).max(200),
  })
  .strict();

export const rpcContract = defineRpcContract({
  getSouls: {
    input: z.null(),
    output: SoulsResultSchema,
  },
  getStatus: {
    input: z.null(),
    output: StatusResultSchema,
  },
  getAudit: {
    input: z.null(),
    output: AuditResultSchema,
  },
  saveSoul: {
    input: SaveSoulInputSchema,
    output: SaveResultSchema,
  },
});

export type AuditEntry = z.infer<typeof AuditEntrySchema>;
export type BotName = z.infer<typeof BotNameSchema>;
export type FactoryStatusPayload = z.infer<typeof FactoryStatusPayloadSchema>;
export type Failure = z.infer<typeof FailureSchema>;
export type SaveResult = z.infer<typeof SaveResultSchema>;
export type SoulRecord = z.infer<typeof SoulRecordSchema>;
export type SoulsResult = z.infer<typeof SoulsResultSchema>;
export type StatusResult = z.infer<typeof StatusResultSchema>;
export type AuditResult = z.infer<typeof AuditResultSchema>;
export type ToolsByBot = z.infer<typeof ToolMapSchema>;
