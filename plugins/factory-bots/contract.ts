import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/**
 * Factory MCP payloads. The factory's read API is the only source, so these
 * schemas mirror the exact fields the five permitted tools return; unknown
 * fields pass through untouched, and only what the board renders is typed.
 */

export const ConversationIdSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value));

export const AgentStatusSchema = z.enum(["idle", "working", "blocked"]);

export const TicketSummarySchema = z.object({
  linearId: z.string(),
  title: z.string(),
  stage: z.string(),
  bot: z.string(),
  feature: z.string().nullable(),
  conversationId: ConversationIdSchema,
  labels: z.array(z.string()),
});

export const TicketDetailSchema = TicketSummarySchema.extend({
  worktree: z.string().nullable(),
  attempts: z.number().int(),
  stageAttempts: z.number().int(),
  stopReason: z.string().nullable(),
  decisions: z.array(z.string()),
  handoff: z
    .object({ from: z.string(), to: z.string(), reason: z.string() })
    .nullable(),
  lineage: z.array(ConversationIdSchema),
});

export const TaskSummarySchema = z.object({
  id: ConversationIdSchema,
  kind: z.string(),
  status: z.string(),
  phase: z.string().nullable(),
  owner: z
    .union([z.string(), z.number()])
    .nullable()
    .transform((value) => (value === null ? null : String(value))),
  conversationId: ConversationIdSchema,
  blocked: z.string().nullable(),
  background: z.boolean(),
});

export const TranscriptEntrySchema = z.object({
  kind: z.string(),
  text: z.string(),
});

export const TranscriptSchema = z.object({
  linearId: z.string(),
  conversationId: ConversationIdSchema,
  entries: z.array(TranscriptEntrySchema),
  /** Pi Durable's live document: unknown by design, normalized for display. */
  live: z.unknown(),
});

export const FactoryStatusPayloadSchema = z.object({
  ok: z.boolean().optional(),
  rootId: z.string().optional(),
  bots: z.record(z.string(), ConversationIdSchema),
  tickets: z.number().int().nonnegative().optional(),
  byStage: z.record(z.string(), z.number().int().nonnegative()).optional(),
  storage: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
});

export const FactoryTicketsPayloadSchema = z.object({
  tickets: z.array(TicketSummarySchema),
});

export const FactoryTasksPayloadSchema = z.object({
  tasks: z.array(TaskSummarySchema),
});

export const StageCountSchema = z.object({
  stage: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
});

export const BoardSnapshotSchema = z.object({
  bots: z.number().int().nonnegative(),
  tickets: z.number().int().nonnegative(),
  byStage: z.array(StageCountSchema),
  storage: z.string().nullable(),
  startedAt: z.string().nullable(),
});

export const AgentCardSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  conversationId: z.string(),
  column: z.string(),
  ticketCount: z.number().int().nonnegative(),
  status: AgentStatusSchema,
  /** Present only when the agent is blocked; the factory's text, verbatim. */
  statusReason: z.string().nullable(),
  statusReasonCount: z.number().int().nonnegative(),
  currentWork: z.string().nullable(),
  taskCount: z.number().int().nonnegative(),
});

export const FailureReasonSchema = z.enum(["not-running", "unavailable"]);

/** Both RPCs fail the same way; one schema keeps the two shapes from drifting. */
export const FailureSchema = z.object({
  ok: z.literal(false),
  reason: FailureReasonSchema,
  message: z.string(),
  startCommand: z.string().nullable(),
  fetchedAt: z.number(),
});

export const BoardOnlineSchema = z.object({
  ok: z.literal(true),
  fetchedAt: z.number(),
  snapshot: BoardSnapshotSchema,
  agents: z.array(AgentCardSchema),
  tickets: z.array(TicketSummarySchema),
  tasks: z.array(TaskSummarySchema),
});

export const BoardResultSchema = z.discriminatedUnion("ok", [
  BoardOnlineSchema,
  FailureSchema,
]);

export const TicketOnlineSchema = z.object({
  ok: z.literal(true),
  fetchedAt: z.number(),
  ticket: TicketDetailSchema,
  transcript: TranscriptSchema.nullable(),
  transcriptError: z.string().nullable(),
  /** True when the stage or conversation changed and a read was attempted. */
  transcriptRefetched: z.boolean(),
});

export const TicketResultSchema = z.discriminatedUnion("ok", [
  TicketOnlineSchema,
  FailureSchema,
]);

export type AgentCard = z.infer<typeof AgentCardSchema>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type BoardFailure = z.infer<typeof FailureSchema>;
export type BoardOnline = z.infer<typeof BoardOnlineSchema>;
export type BoardResult = z.infer<typeof BoardResultSchema>;
export type BoardSnapshot = z.infer<typeof BoardSnapshotSchema>;
export type FactoryStatusPayload = z.infer<typeof FactoryStatusPayloadSchema>;
export type StageCount = z.infer<typeof StageCountSchema>;
export type TaskSummary = z.infer<typeof TaskSummarySchema>;
export type TicketDetail = z.infer<typeof TicketDetailSchema>;
export type TicketFailure = z.infer<typeof FailureSchema>;
export type TicketOnline = z.infer<typeof TicketOnlineSchema>;
export type TicketResult = z.infer<typeof TicketResultSchema>;
export type TicketSummary = z.infer<typeof TicketSummarySchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;

export const rpcContract = defineRpcContract({
  getBoard: {
    input: z.null(),
    output: BoardResultSchema,
  },
  getTicket: {
    input: z.object({ linearId: z.string().min(1) }).strict(),
    output: TicketResultSchema,
  },
});
