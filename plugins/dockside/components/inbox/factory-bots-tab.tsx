import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { FactoryAgent } from "@/lib/factory-bots";
import type { FactoryBotsState } from "@/hooks/use-factory-bots";
import { DoodOrb } from "@/lib/dood-orb";
import { loadAgentDood } from "@/lib/dood-state";

const STATUS_LABEL: Record<FactoryAgent["status"], string> = {
  idle: "Idle",
  working: "Working",
  blocked: "Blocked",
};

/** The optional Bots/Threads switch at the top of Dockside. */
export function FactoryBotsTabs({
  tab,
  needsPerson,
  needsPersonDetail,
  onChange,
}: {
  tab: "threads" | "bots";
  needsPerson: number;
  needsPersonDetail?: string;
  onChange: (tab: "threads" | "bots") => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Bots and threads"
      className="mx-3 mt-3 flex shrink-0 rounded-md border border-sidebar-border bg-sidebar-accent/40 p-1 sm:mx-2.5 sm:mt-2 sm:p-0.5"
    >
      <button
        type="button"
        role="tab"
        aria-selected={tab === "threads"}
        onClick={() => onChange("threads")}
        className={cn(
          "h-6 flex-1 rounded text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          tab === "threads"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Threads
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "bots"}
        aria-label={
          needsPerson > 0
            ? `Bots, ${needsPerson} ${needsPerson === 1 ? "needs" : "need"} a person`
            : "Bots"
        }
        title={needsPersonDetail === "" ? undefined : needsPersonDetail}
        onClick={() => onChange("bots")}
        className={cn(
          "h-6 flex-1 items-center justify-center gap-1 rounded text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "flex",
          tab === "bots"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span>Bots</span>
        {needsPerson > 0 ? (
          <span
            className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-none text-destructive-foreground"
            aria-hidden
          >
            {needsPerson > 99 ? "99+" : needsPerson}
          </span>
        ) : null}
      </button>
    </div>
  );
}

function FactoryBotRow({
  agent,
  onOpen,
}: {
  agent: FactoryAgent;
  onOpen: (agent: FactoryAgent) => void;
}) {
  const work =
    agent.statusReason ?? agent.currentWork ?? STATUS_LABEL[agent.status];
  const blockedTicket =
    agent.status === "blocked" && agent.ticketId !== null
      ? `${agent.ticketId}${agent.ticketTitle === null ? "" : ` · ${agent.ticketTitle}`}`
      : null;

  return (
    <li className="border-b border-sidebar-border/60 last:border-b-0">
      <button
        type="button"
        onClick={() => onOpen(agent)}
        aria-label={
          blockedTicket === null
            ? `Open ${agent.displayName}: ${work}`
            : `Answer ${agent.displayName}'s ${blockedTicket}: ${work}`
        }
        title={`${agent.displayName} · ${STATUS_LABEL[agent.status]} · ${
          blockedTicket === null ? work : `${blockedTicket} · ${work}`
        }`}
        className="flex w-full items-center gap-2.5 px-2.5 py-2.5 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className="relative size-11 shrink-0">
          <DoodOrb
            agentId={agent.name}
            status={agent.status}
            size={44}
            outfit={loadAgentDood(agent.name).outfit}
          />
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 size-2 rounded-full border-2 border-sidebar",
              agent.status === "working" && "bg-emerald-500",
              agent.status === "blocked" && "bg-destructive",
              agent.status === "idle" &&
                "border-muted-foreground/60 bg-transparent",
            )}
            aria-hidden
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground">
            {agent.displayName}
          </span>
          {blockedTicket === null ? null : (
            <span className="mt-0.5 flex min-w-0 items-center gap-1 text-2xs">
              <span className="shrink-0 font-semibold text-destructive">
                {agent.ticketId}
              </span>
              {agent.ticketTitle === null ? null : (
                <span className="truncate text-destructive/90">
                  {agent.ticketTitle}
                </span>
              )}
            </span>
          )}
          <span
            className={cn(
              "mt-0.5 block truncate text-2xs",
              agent.status === "blocked"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {work}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1 text-2xs text-muted-foreground/80">
            <span className="truncate">{agent.column}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="shrink-0">#{agent.conversationId}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 border-l border-sidebar-border/60 pl-2">
          {agent.status === "blocked" ? (
            <span className="rounded-[5px] border border-destructive/45 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-destructive">
              Answer
            </span>
          ) : null}
          {agent.ticketCount > 0 ? (
            <span className="flex flex-col items-end leading-none">
              <span className="text-base font-semibold tabular-nums text-foreground">
                {agent.ticketCount}
              </span>
              <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                {agent.ticketCount === 1 ? "ticket" : "tickets"}
              </span>
            </span>
          ) : (
            <Icon
              name="ChevronRight"
              className="size-3.5 text-muted-foreground/70"
              aria-hidden
            />
          )}
        </span>
      </button>
    </li>
  );
}

function FactorySection({
  label,
  agents,
  onOpen,
}: {
  label: string;
  agents: FactoryAgent[];
  onOpen: (agent: FactoryAgent) => void;
}) {
  if (agents.length === 0) return null;
  return (
    <section aria-label={label} className="px-0.5">
      <div className="mt-3 flex items-center gap-2 px-2 pb-1">
        <span className="text-2xs font-medium italic text-muted-foreground/80">
          {label}
        </span>
        <span className="h-px flex-1 bg-sidebar-border" />
        <span className="text-2xs tabular-nums text-muted-foreground/60">
          {agents.length}
        </span>
      </div>
      <ul className="flex flex-col">
        {agents.map((agent) => (
          <FactoryBotRow key={agent.name} agent={agent} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

/** The Bots tab: the factory's agents, in the same sectioned shape as the board. */
export function FactoryBotsPage({
  state,
  onOpen,
  onOpenPanel,
}: {
  state: FactoryBotsState;
  onOpen: (agent: FactoryAgent) => void;
  onOpenPanel: () => void;
}) {
  if (state.status === "error") {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-2xs leading-snug text-muted-foreground">
        <p>{state.message ?? "Factory Bots is unavailable."}</p>
        <button
          type="button"
          onClick={onOpenPanel}
          className="rounded border border-sidebar-border px-2 py-1 font-medium text-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Open Factory Bots
        </button>
      </div>
    );
  }

  if (state.agents.length === 0) {
    return (
      <p className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-2xs text-muted-foreground">
        {state.status === "loading" ? "Reading factory…" : "No factory bots returned."}
      </p>
    );
  }

  return (
    <div
      role="tabpanel"
      aria-label="Factory bots"
      className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3"
    >
      <FactorySection
        label="In motion"
        agents={state.agents.filter((agent) => agent.status === "working")}
        onOpen={onOpen}
      />
      <FactorySection
        label="Needs a person"
        agents={state.agents.filter((agent) => agent.status === "blocked")}
        onOpen={onOpen}
      />
      <FactorySection
        label="On call"
        agents={state.agents.filter((agent) => agent.status === "idle")}
        onOpen={onOpen}
      />
    </div>
  );
}
