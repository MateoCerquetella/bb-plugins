import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { FactoryAgent } from "@/lib/factory-bots";
import type { FactoryBotsState } from "@/hooks/use-factory-bots";
import { FactoryBotAvatar } from "./factory-bot-avatar";

const STATUS_LABEL: Record<FactoryAgent["status"], string> = {
  idle: "Idle",
  working: "Working",
  blocked: "Blocked",
};

/**
 * The optional Factory Bots strip at the top of Dockside. It is additive: the
 * native BB thread list below stays exactly as Dockside draws it.
 */
export function FactoryBotSection({
  state,
  onOpen,
  onOpenPanel,
}: {
  state: FactoryBotsState;
  onOpen: (agent: FactoryAgent) => void;
  onOpenPanel: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const count = state.agents.length;

  return (
    <section
      aria-label="Factory bots"
      className="shrink-0 border-b border-sidebar-border/70 pb-1"
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex h-8 w-full items-center gap-2 px-2.5 text-left text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Icon name="Bot" className="size-3.5" aria-hidden />
        <span className="text-2xs font-semibold uppercase tracking-wider">
          Factory bots
        </span>
        <span className="tabular-nums text-2xs text-muted-foreground/70">
          {count}
        </span>
        <span className="ml-auto flex size-5 items-center justify-center">
          <Icon
            name="ChevronDown"
            className={cn(
              "size-3 transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </button>

      {!expanded ? null : state.status === "error" ? (
        <div className="px-2.5 pb-2 text-2xs leading-snug text-muted-foreground">
          <p>{state.message ?? "Factory Bots is unavailable."}</p>
          <button
            type="button"
            onClick={onOpenPanel}
            className="mt-1 rounded border border-sidebar-border px-1.5 py-0.5 font-medium text-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Open Factory Bots
          </button>
        </div>
      ) : state.agents.length === 0 ? (
        <p className="px-2.5 pb-2 text-2xs text-muted-foreground">
          {state.status === "loading"
            ? "Reading factory…"
            : "No factory bots returned."}
        </p>
      ) : (
        <ul className="flex flex-col gap-px">
          {state.agents.map((agent) => {
            const work =
              agent.statusReason ??
              agent.currentWork ??
              (agent.status === "idle" ? "No active task" : "Working");
            return (
              <li key={agent.name}>
                <button
                  type="button"
                  onClick={() => onOpen(agent)}
                  title={`${agent.displayName} · ${STATUS_LABEL[agent.status]} · ${work}`}
                  className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span className="relative size-7 shrink-0">
                    <FactoryBotAvatar agentId={agent.name} />
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
                    <span className="block truncate text-xs font-medium text-foreground">
                      {agent.displayName}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-2xs",
                        agent.status === "blocked"
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {work}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1 text-2xs text-muted-foreground/80">
                      <span className="truncate">{agent.column}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="shrink-0">#{agent.conversationId}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {agent.ticketCount > 0 ? (
                      <span className="flex flex-col items-end leading-none">
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {agent.ticketCount}
                        </span>
                        <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                          {agent.ticketCount === 1 ? "ticket" : "tickets"}
                        </span>
                      </span>
                    ) : (
                      <Icon
                        name="ChevronRight"
                        className="size-3 text-muted-foreground/70"
                        aria-hidden
                      />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
