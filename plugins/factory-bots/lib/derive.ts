import type {
  AgentCard,
  AgentStatus,
  BoardSnapshot,
  FactoryStatusPayload,
  StageCount,
  TaskSummary,
  TicketSummary,
} from "../contract.js";

/** The factory's documented roster order. Only returned agents are rendered. */
export const AGENT_ORDER = [
  "orchestrator",
  "sieve",
  "helm",
  "lens",
  "warden",
  "audit",
  "lookback",
] as const;

/** The column each agent owns, from the factory's own ownership table. */
const AGENT_COLUMNS: Record<string, string> = {
  orchestrator: "Triage",
  sieve: "In Specification, Todo",
  helm: "In Implementation",
  lens: "In Review",
  warden: "In Staging, Ready for Production, Done",
  audit: "Factory:audit Triage tickets",
  lookback: "Lookback: <pattern> proposals",
};

const STAGE_ORDER = [
  "triage",
  "specification",
  "todo",
  "implement",
  "verify",
  "integrate",
  "review",
  "staging",
  "production",
  "done",
] as const;

const STAGE_LABELS: Record<string, string> = {
  triage: "Triage",
  specification: "Specification",
  todo: "Todo",
  implement: "Implement",
  verify: "Verify",
  integrate: "Integrate",
  review: "Review",
  staging: "Staging",
  production: "Production",
  done: "Done",
};

export function stageLabel(stage: string): string {
  const known = STAGE_LABELS[stage];
  if (known !== undefined) return known;
  return stage
    .split(/[-_]/)
    .filter((part) => part !== "")
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

export function displayAgentName(name: string): string {
  return name === "" ? name : name[0]!.toUpperCase() + name.slice(1);
}

export function agentColumn(name: string): string {
  return AGENT_COLUMNS[name] ?? "No column";
}

/** Known agents first in documented order, then any extra returned agent. */
export function orderAgents(names: readonly string[]): string[] {
  const present = new Set(names);
  const known = AGENT_ORDER.filter((name) => present.has(name));
  const extras = [...present]
    .filter((name) => !(AGENT_ORDER as readonly string[]).includes(name))
    .sort((left, right) => left.localeCompare(right));
  return [...known, ...extras];
}

export function deriveSnapshot(
  status: FactoryStatusPayload,
  tickets: readonly TicketSummary[],
): BoardSnapshot {
  const counts = status.byStage ?? tallyStages(tickets);
  return {
    bots: Object.keys(status.bots).length,
    tickets: status.tickets ?? tickets.length,
    byStage: stageCounts(counts),
    startedAt: status.startedAt ?? null,
  };
}

export function stageCounts(
  counts: Readonly<Record<string, number>>,
): StageCount[] {
  const present = Object.keys(counts).filter((stage) => (counts[stage] ?? 0) > 0);
  const known = STAGE_ORDER.filter((stage) => present.includes(stage));
  const extras = present
    .filter((stage) => !(STAGE_ORDER as readonly string[]).includes(stage))
    .sort((left, right) => left.localeCompare(right));
  return [...known, ...extras].map((stage) => ({
    stage,
    label: stageLabel(stage),
    count: counts[stage] ?? 0,
  }));
}

function tallyStages(tickets: readonly TicketSummary[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ticket of tickets) {
    counts[ticket.stage] = (counts[ticket.stage] ?? 0) + 1;
  }
  return counts;
}

export interface TicketStopReasons {
  /** `stopReason` from `factory_ticket`, keyed by ticket id. */
  [linearId: string]: string | null;
}

/**
 * One card per agent in `factory_status.bots`. `working` is task-driven;
 * `blocked` outranks it and keeps the factory's wording verbatim.
 */
export function deriveAgents(input: {
  status: FactoryStatusPayload;
  tickets: readonly TicketSummary[];
  tasks: readonly TaskSummary[];
  stopReasons: TicketStopReasons;
}): AgentCard[] {
  const { status, tickets, tasks, stopReasons } = input;
  const names = orderAgents(Object.keys(status.bots));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  return names.map((name) => {
    const conversationId = status.bots[name] ?? "";
    const held = tickets.filter((ticket) => ticket.bot === name);
    const conversations = new Set<string>([conversationId]);
    for (const ticket of held) conversations.add(ticket.conversationId);

    const agentTasks = tasks.filter((task) => {
      if (task.owner === name) return true;
      if (conversations.has(task.conversationId)) return true;
      // A nested task's owner is another task id; follow it to that task's
      // conversation so its work still counts for the agent.
      const ownerTask = task.owner === null ? undefined : tasksById.get(task.owner);
      return ownerTask !== undefined && conversations.has(ownerTask.conversationId);
    });

    const taskReasons = agentTasks
      .map((task) => task.blocked)
      .filter((reason): reason is string => typeof reason === "string" && reason !== "");
    const ticketReasons = held
      .map((ticket) => stopReasons[ticket.linearId])
      .filter((reason): reason is string => typeof reason === "string" && reason !== "");
    const reasons = unique([...ticketReasons, ...taskReasons]);

    const agentStatus: AgentStatus =
      reasons.length > 0 ? "blocked" : agentTasks.length > 0 ? "working" : "idle";

    return {
      name,
      displayName: displayAgentName(name),
      conversationId,
      column: agentColumn(name),
      ticketCount: held.length,
      status: agentStatus,
      statusReason: reasons[0] ?? null,
      statusReasonCount: reasons.length,
      currentWork: currentWork(agentTasks, held),
      taskCount: agentTasks.length,
    };
  });
}

function currentWork(
  tasks: readonly TaskSummary[],
  held: readonly TicketSummary[],
): string | null {
  const task = tasks[0];
  if (task !== undefined) {
    const ticket = held.find(
      (candidate) => candidate.conversationId === task.conversationId,
    );
    if (ticket !== undefined) return ticket.title;
    const parts = [task.kind];
    if (task.phase !== null && task.phase !== "") parts.push(task.phase);
    if (task.status !== "running") parts.push(task.status);
    return parts.join(" · ");
  }
  return null;
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function escapeAttentionToken(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function reasonMentions(reason: string, token: string): boolean {
  if (token === "") return false;
  return new RegExp(
    `(^|[^a-z0-9])${escapeAttentionToken(token)}(?=$|[^a-z0-9])`,
    "iu",
  ).test(reason);
}

/**
 * The ticket a blocked agent names in its status reason. The reason carries
 * the feature path, for example `empirical-sdd-sdd-170`; matching that path is
 * the difference between a useful alert and opening the agent's first ticket.
 */
export function agentAttentionTicket(
  agent: AgentCard,
  tickets: readonly TicketSummary[],
): TicketSummary | null {
  if (agent.status !== "blocked" || agent.statusReason === null) return null;
  const owned = tickets.filter((ticket) => ticket.bot === agent.name);
  const reason = agent.statusReason;
  return (
    owned.find((ticket) => reasonMentions(reason, ticket.linearId)) ??
    owned.find(
      (ticket) =>
        ticket.feature !== null && reasonMentions(reason, ticket.feature),
    ) ??
    null
  );
}

/** Ticket id → agent display name, for per-thread attention badges. */
export function attentionTicketMap(
  agents: readonly AgentCard[],
  tickets: readonly TicketSummary[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const agent of agents) {
    const ticket = agentAttentionTicket(agent, tickets);
    if (ticket !== null) map.set(ticket.linearId, agent.displayName);
  }
  return map;
}
