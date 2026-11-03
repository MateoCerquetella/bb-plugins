import { z } from "zod";

/** The subset of a Factory Bots agent card Dockside draws. */
export const factoryAgentSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  conversationId: z.string(),
  column: z.string(),
  ticketCount: z.number().int().nonnegative(),
  status: z.enum(["idle", "working", "blocked"]),
  statusReason: z.string().nullable(),
  currentWork: z.string().nullable(),
});

export type FactoryAgent = z.infer<typeof factoryAgentSchema>;

/** `factory-bots`' board result, narrowed to what this section needs. */
export const factoryBoardSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    agents: z.array(factoryAgentSchema),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.string(),
    message: z.string(),
  }),
]);

export const FACTORY_BOTS_PLUGIN_ID = "factory-bots";
export const FACTORY_BOTS_PANEL_PATH = "factory-bots";
