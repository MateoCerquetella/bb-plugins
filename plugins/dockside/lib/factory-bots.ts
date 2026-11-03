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

/** The subset Dockside draws, plus the first ticket for opening live work. */
export const factoryAgentSchema = boardAgentSchema.extend({
  /** The first ticket this agent owns, for opening its live work directly. */
  ticketId: z.string().nullable(),
});

export type FactoryAgent = z.infer<typeof factoryAgentSchema>;

/** `factory-bots`' board result, narrowed to what this section needs. */
export const factoryBoardSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    agents: z.array(boardAgentSchema),
    tickets: z.array(
      z.object({ linearId: z.string(), bot: z.string() }).passthrough(),
    ),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.string(),
    message: z.string(),
  }),
]);

export const FACTORY_BOTS_PLUGIN_ID = "factory-bots";
export const FACTORY_BOTS_PANEL_PATH = "factory-bots";

/** Stable key for one blocked need; a changed reason or ticket is a new alert. */
export function factoryAttentionKey(
  agent: Pick<FactoryAgent, "name" | "statusReason" | "currentWork" | "ticketId">,
): string {
  return [
    agent.name,
    agent.statusReason ?? agent.currentWork ?? "",
    agent.ticketId ?? "",
  ].join("\u0000");
}

export function factoryNeedsPerson(agents: readonly FactoryAgent[]): FactoryAgent[] {
  return agents.filter((agent) => agent.status === "blocked");
}
