import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { FactoryAgent } from "@/lib/factory-bots";
import type { FactoryBotsState } from "@/hooks/use-factory-bots";
import { DoodOrb, type DoodOrbHandle } from "@/lib/dood-orb";
import {
  loadAgentDood,
  saveAgentDood,
  type AgentDood,
} from "@/lib/dood-state";
import {
  WEAR_ITEMS,
  WEAR_SLOTS,
  type WearItem,
  type WearSlot,
} from "@/lib/wear-items";

const STATUS_LABEL: Record<FactoryAgent["status"], string> = {
  idle: "Idle",
  working: "Working",
  blocked: "Blocked",
};

const SLOT_LABEL: Record<WearSlot, string> = {
  hat: "Hat",
  glasses: "Glasses",
  face: "Face",
  neck: "Neck",
};

/** The optional Bots/Threads switch at the top of Dockside. */
export function FactoryBotsTabs({
  tab,
  onChange,
}: {
  tab: "threads" | "bots";
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
        onClick={() => onChange("bots")}
        className={cn(
          "h-6 flex-1 rounded text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          tab === "bots"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Bots
      </button>
    </div>
  );
}

function CookieArt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M12 3.2c1.1 1.7 2.5 2.1 4.4 1.6 1.2-.3 2.2 0 3.1.9.8.8 1.1 1.9.7 3.2-.4 1.6 0 2.9 1.2 4.1.5.5.6 1.3.3 2-.9 2.5-3.2 4.6-5.8 5.4-4.9 1.5-10.5-1.4-11.8-6.4C3 8.9 5.8 4.5 10.4 3.8c.6-.1 1.1-.3 1.6-.6Z"
        fill="#C98A4B"
        stroke="#2B2117"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <g fill="#6B4423">
        <circle cx="8.1" cy="10" r="1.1" />
        <circle cx="13.7" cy="8.7" r="1" />
        <circle cx="10.7" cy="14.5" r="1.2" />
        <circle cx="16.4" cy="13.9" r="1" />
        <circle cx="14.4" cy="18" r="0.8" />
      </g>
    </svg>
  );
}

function WardrobeDialog({
  agent,
  dood,
  onDood,
  onClose,
}: {
  agent: FactoryAgent;
  dood: AgentDood;
  onDood: (next: AgentDood) => void;
  onClose: () => void;
}) {
  const owned = WEAR_ITEMS.filter((item) => dood.owned.includes(item.id));
  const groups = WEAR_SLOTS.map((slot) => ({
    slot,
    items: owned.filter((item) => item.slot === slot),
  })).filter((group) => group.items.length > 0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const wear = (item: WearItem): void => {
    onDood({ ...dood, outfit: { ...dood.outfit, [item.slot]: item.id } });
  };

  const takeOff = (slot: WearSlot): void => {
    const outfit = { ...dood.outfit };
    delete outfit[slot];
    onDood({ ...dood, outfit });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${agent.displayName} wardrobe`}
        className="max-h-[82vh] w-full max-w-sm overflow-y-auto rounded-xl border border-border bg-background p-4 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Dress {agent.displayName}
            </h2>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {owned.length} {owned.length === 1 ? "gift" : "gifts"} found
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close wardrobe"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Icon name="CircleX" className="size-4" aria-hidden />
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-border p-3 text-center text-2xs leading-relaxed text-muted-foreground">
            No gifts yet. Open Factory Bots to give {agent.displayName} a gift.
          </p>
        ) : (
          <div className="mt-3 grid gap-3">
            {groups.map((group) => (
              <div key={group.slot}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                    {SLOT_LABEL[group.slot]}
                  </p>
                  {dood.outfit[group.slot] === undefined ? null : (
                    <button
                      type="button"
                      onClick={() => takeOff(group.slot)}
                      className="text-2xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Take off
                    </button>
                  )}
                </div>
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {group.items.map((item) => {
                    const wearing = dood.outfit[group.slot] === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => wear(item)}
                          aria-pressed={wearing}
                          className={cn(
                            "rounded-md border px-2 py-1 text-2xs transition-colors",
                            wearing
                              ? "border-foreground bg-foreground text-background"
                              : "border-sidebar-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                          )}
                        >
                          {item.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md border border-sidebar-border px-2 py-1.5 text-xs font-medium text-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}

function FactoryBotRow({
  agent,
  onOpen,
}: {
  agent: FactoryAgent;
  onOpen: (agent: FactoryAgent) => void;
}) {
  const orb = useRef<DoodOrbHandle>(null);
  const [dood, setDood] = useState<AgentDood>(() => loadAgentDood(agent.name));
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const work =
    agent.statusReason ?? agent.currentWork ?? STATUS_LABEL[agent.status];

  useEffect(() => {
    saveAgentDood(agent.name, dood);
  }, [agent.name, dood]);

  const feed = (): void => {
    orb.current?.feed();
    setDood((value) => ({ ...value, fed: value.fed + 1 }));
  };

  return (
    <li className="border-b border-sidebar-border/60 last:border-b-0">
      <div
        className={cn(
          "group flex items-center gap-1 px-2.5 py-2.5 transition-colors",
          dragging && "bg-primary/5",
        )}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("text/factory-treat")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDragging(true);
          }
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.getData("text/factory-treat") !== "") {
            feed();
          }
        }}
      >
        <button
          type="button"
          onClick={() => onOpen(agent)}
          title={`${agent.displayName} · ${STATUS_LABEL[agent.status]} · ${work}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className="relative size-9 shrink-0">
            <DoodOrb
              ref={orb}
              agentId={agent.name}
              status={agent.status}
              size={36}
              outfit={dood.outfit}
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
            <span className="mt-1 flex min-w-0 items-center gap-1 text-2xs text-muted-foreground/80">
              <span className="truncate">{agent.column}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="shrink-0">#{agent.conversationId}</span>
            </span>
          </span>
          <span className="flex shrink-0 items-center border-l border-sidebar-border/60 pl-2">
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
        <span className="flex shrink-0 flex-col items-center gap-0.5">
          <button
            type="button"
            draggable
            onClick={feed}
            onDragStart={(event) => {
              event.dataTransfer.setData("text/factory-treat", "cookie");
              event.dataTransfer.effectAllowed = "copy";
            }}
            title="Give a treat — drag it onto the Dood or click"
            aria-label={`Give ${agent.displayName} a treat`}
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <CookieArt className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setWardrobeOpen(true)}
            title="Change outfit"
            aria-label={`Change ${agent.displayName}'s outfit`}
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Icon name="Edit" className="size-3" aria-hidden />
          </button>
        </span>
      </div>
      {wardrobeOpen ? (
        <WardrobeDialog
          agent={agent}
          dood={dood}
          onDood={setDood}
          onClose={() => setWardrobeOpen(false)}
        />
      ) : null}
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
