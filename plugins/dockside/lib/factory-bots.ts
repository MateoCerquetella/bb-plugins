import { z } from "zod";

/** The raw agent fields the Factory Bots board returns. */
const boardAgentSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  conversationId: z.string(),
  column: z.string(),
  ticketCount: z.number().int().nonnegative(),
  status: z.enum(["idle", "working", "blocked"]),
  statusReason: z.string().nullable(),
  currentWork: z.string().nullable(),
});

/** The board ticket fields needed to find the ticket a bot is blocked on. */
const boardTicketSchema = z
  .object({
    linearId: z.string(),
    title: z.string(),
    bot: z.string(),
    feature: z.string().nullable().optional(),
  })
  .passthrough();

export type FactoryBoardTicket = z.infer<typeof boardTicketSchema>;

/** The subset Dockside draws, plus the ticket the agent should open. */
export const factoryAgentSchema = boardAgentSchema.extend({
  /**
   * The ticket that needs a person when blocked, otherwise the first ticket
   * this agent owns. The factory's status reason names the blocked feature;
   * opening a different first ticket is what made two alerts unanswerable.
   */
  ticketId: z.string().nullable(),
  ticketTitle: z.string().nullable(),
});

export type FactoryAgent = z.infer<typeof factoryAgentSchema>;

/** `factory-bots`' board result, narrowed to what this section needs. */
export const factoryBoardSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    agents: z.array(boardAgentSchema),
    tickets: z.array(boardTicketSchema),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.string(),
    message: z.string(),
  }),
]);

export const FACTORY_BOTS_PLUGIN_ID = "factory-bots";
export const FACTORY_BOTS_PANEL_PATH = "factory-bots";

/** The ticket detail shape used only to enrich an attention notification. */
export const factoryTicketQuestionSchema = z
  .object({
    ok: z.boolean(),
    ticket: z
      .object({
        title: z.string(),
        comments: z
          .array(z.object({ body: z.string(), createdAt: z.string() }).passthrough())
          .default([]),
      })
      .passthrough()
      .optional(),
    message: z.string().optional(),
  })
  .passthrough();

export function factoryQuestionFromComments(
  comments: readonly { body: string }[],
): string | null {
  const comment = comments.find((entry) =>
    /\bi need (?:a person|you|someone) to (?:answer|decide|confirm|choose)\b/iu.test(
      entry.body,
    ),
  );
  if (comment === undefined) return null;
  const normalized = comment.body
    .replace(/\*\*/gu, "")
    .replace(/`/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const marker =
    /\bi need (?:a person|you|someone) to (?:answer|decide|confirm|choose)\b/iu.exec(
      normalized,
    );
  return (marker?.index === undefined
    ? normalized
    : normalized.slice(marker.index)
  ).slice(0, 600);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function mentions(text: string, token: string): boolean {
  if (token === "") return false;
  const escaped = escapeRegExp(token);
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "iu").test(text);
}

/**
 * The factory's status reason carries the feature path of the blocked work,
 * for example `empirical-sdd-sdd-179`. Prefer that exact ticket over the
 * agent's first ticket; fall back only when the reason names no owned ticket.
 */
export function factoryTicketForAgent(
  agent: Pick<FactoryAgent, "name" | "status" | "statusReason">,
  tickets: readonly FactoryBoardTicket[],
): FactoryBoardTicket | null {
  const owned = tickets.filter((ticket) => ticket.bot === agent.name);
  const first = owned[0] ?? null;
  if (agent.status !== "blocked" || agent.statusReason === null) return first;

  const reason = agent.statusReason;
  return (
    owned.find((ticket) => mentions(reason, ticket.linearId)) ??
    owned.find(
      (ticket) =>
        ticket.feature !== null &&
        ticket.feature !== undefined &&
        mentions(reason, ticket.feature),
    ) ??
    first
  );
}

/**
 * One alert per blocked episode. While the agent stays blocked, a changing
 * reason or ticket must not send another native notification; unblocking
 * removes the entry, so a later block alerts again.
 */
export function factoryAttentionKey(agent: Pick<FactoryAgent, "name">): string {
  return agent.name;
}

export function factoryNeedsPerson(agents: readonly FactoryAgent[]): FactoryAgent[] {
  return agents.filter((agent) => agent.status === "blocked");
}
