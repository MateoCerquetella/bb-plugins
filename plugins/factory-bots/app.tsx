import "./app.css";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Markdown,
  definePluginApp,
  experimental_ProviderModelPicker as ProviderModelPicker,
  useBbNavigate,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type {
  ExperimentalProviderModelPickerValue,
  PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";

import type {
  AgentCard,
  AgentStatus,
  BoardResult,
  ChatResult,
  TicketDetail,
  TicketResult,
  TicketSummary,
  Transcript,
  rpcContract,
} from "./contract";
import { DoodOrb, type DoodOrbHandle } from "./lib/dood-orb";
import { GiftDialog } from "./lib/gift-dialog";
import {
  CHAT_CHANGED,
  CHAT_PENDING,
  appendChatEntry,
  clearChatEntries,
  loadChatEntries,
  saveChatEntries,
  setChatPending,
} from "./lib/chat-store";
import { WardrobeDialog } from "./lib/wardrobe-dialog";
import { Pixels } from "./lib/pixels";
import { DoodAvatar, avatarLook } from "./lib/dood";
import {
  boxCountdown,
  grantGift,
  loadAgentDood,
  saveAgentDood,
  type AgentDood,
} from "./lib/dood-state";
import { activeLiveTool, isGenerating, readLiveTools } from "./lib/live";
import { SoulsView } from "./lib/souls-view";
import { CapabilitiesView } from "./lib/capabilities-view";
import { attentionTicketMap, blockedAgentCount, boardHealth, stageLabel } from "./lib/derive";
import { FactoriesView, useFactories } from "./lib/factories-view";
import type { Factory } from "./lib/factories";
import { BoardPulse, FactoryTabs, ForemanBar, type ShellTab } from "./lib/shell";
import {
  PANEL_PATH,
  agentRoute,
  boardRoute,
  capabilitiesRoute,
  parsePanelRoute,
  soulsRoute,
  ticketRoute,
  type FactoryView,
} from "./lib/route";

const REFRESH_MS = 5_000;
const CHAT_WIDTH_KEY = "factory-bots:chat-width:v1";
const CHAT_OPEN_KEY = "factory-bots:chat-open:v1";
const MIN_CHAT_WIDTH = 300;
const MAX_CHAT_WIDTH = 560;
const DEFAULT_CHAT_WIDTH = 360;

function clampChatWidth(value: number): number {
  return Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, Math.round(value)));
}

function readChatWidth(): number {
  try {
    const stored = Number(localStorage.getItem(CHAT_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0
      ? clampChatWidth(stored)
      : DEFAULT_CHAT_WIDTH;
  } catch {
    return DEFAULT_CHAT_WIDTH;
  }
}

function readChatOpen(): boolean {
  try {
    return localStorage.getItem(CHAT_OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

type RpcClient = ReturnType<typeof useRpc<typeof rpcContract>>;

interface Polled<T> {
  data: T | null;
  error: string | null;
}

interface FactoryPoll {
  board: Polled<BoardResult>;
  ticket: Polled<TicketResult>;
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function chatFailureText(result: ChatResult): string {
  if (result.ok) return "";
  if (result.reason !== "not-running" || result.startCommand === null) {
    return result.message;
  }
  return `${result.message}\n\nStart it with:\n${result.startCommand}`;
}

function statusLabel(status: AgentStatus): string {
  return status === "idle" ? "Idle" : status === "working" ? "Working" : "Blocked";
}

function useFactoryPoll(
  rpc: RpcClient,
  factoryId: string,
  linearId: string | null,
): FactoryPoll {
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const linearIdRef = useRef(linearId);
  linearIdRef.current = linearId;
  const wakeRef = useRef<() => void>(() => {});
  const firstSelection = useRef(true);
  const [board, setBoard] = useState<Polled<BoardResult>>({
    data: null,
    error: null,
  });
  const [ticket, setTicket] = useState<Polled<TicketResult>>({
    data: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let queued = false;

    const run = async (): Promise<void> => {
      if (cancelled) return;
      if (inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        inFlight = false;
        timer = setTimeout(() => void run(), REFRESH_MS);
        return;
      }

      let boardOnline = false;
      try {
        const data = await rpcRef.current.call("getBoard", { factoryId });
        if (!cancelled) {
          setBoard({ data, error: null });
          boardOnline = data.ok;
        }
      } catch (cause) {
        if (!cancelled) setBoard({ data: null, error: errorText(cause) });
      }

      const selected = linearIdRef.current;
      if (selected !== null) {
        if (boardOnline) {
          try {
            const data = await rpcRef.current.call("getTicket", {
              factoryId,
              linearId: selected,
            });
            if (!cancelled) setTicket({ data, error: null });
          } catch (cause) {
            if (!cancelled) setTicket({ data: null, error: errorText(cause) });
          }
        } else if (!cancelled) {
          setTicket({ data: null, error: null });
        }
      }

      inFlight = false;
      if (cancelled) return;
      if (queued) {
        queued = false;
        void run();
        return;
      }
      timer = setTimeout(() => void run(), REFRESH_MS);
    };

    wakeRef.current = () => {
      if (cancelled) return;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      void run();
    };

    void run();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      wakeRef.current = () => {};
    };
  }, [factoryId]);

  // A route change resets the pane and wakes the one loop; it never mounts a
  // second loop, and the loop's queued flag prevents overlapping reads.
  useEffect(() => {
    setTicket({ data: null, error: null });
    if (firstSelection.current) {
      firstSelection.current = false;
      return;
    }
    wakeRef.current();
  }, [linearId]);

  return { board, ticket };
}

function StatusDot({ status }: { status: AgentStatus }) {
  return <span className={`fb-dot fb-dot--${status}`} aria-hidden="true" />;
}

function StatusTag({ status }: { status: AgentStatus }) {
  return <span className={`fb-status fb-status--${status}`}>{statusLabel(status)}</span>;
}

function StageTag({ stage }: { stage: string }) {
  return (
    <span className="fb-stage" data-stage={stage}>
      {stage}
    </span>
  );
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1_500);
    } catch {
      // Clipboard access is a convenience; the command stays selectable text.
    }
  };

  return (
    <div className="fb-command">
      <code>{command}</code>
      <button type="button" onClick={() => void copy()}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function FailureView({
  failure,
  compact = false,
}: {
  failure: { reason: "not-running" | "unavailable"; message: string; startCommand: string | null };
  compact?: boolean;
}) {
  const notRunning = failure.reason === "not-running";
  return (
    <div className={`fb-failure${compact ? " fb-failure--compact" : ""}`} role="status">
      <span className="fb-failure-mark" aria-hidden="true">
        !
      </span>
      <div className="fb-failure-body">
        <h2>{notRunning ? "Factory is not running" : "Factory data unavailable"}</h2>
        <p>
          {notRunning
            ? "The Factory MCP could not reach the factory process. Start it and this board reconnects on its own."
            : failure.message}
        </p>
        {notRunning && failure.startCommand !== null ? (
          <CopyCommand command={failure.startCommand} />
        ) : null}
        {notRunning ? (
          <p className="fb-muted">
            This plugin is read-only: it never starts the factory for you.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RpcError({ message }: { message: string }) {
  return (
    <div className="fb-failure" role="status">
      <span className="fb-failure-mark" aria-hidden="true">
        !
      </span>
      <div className="fb-failure-body">
        <h2>Could not reach the plugin</h2>
        <p>{message}</p>
        <p className="fb-muted">The board retries every 5 seconds.</p>
      </div>
    </div>
  );
}

type BoardTab = "bots" | "threads";

function ListHead({ label, count }: { label: string; count: number }) {
  return (
    <div className="fb-list-head">
      <h2>{label}</h2>
      <span>{count}</span>
    </div>
  );
}

function BotRow({
  agent,
  onOpen,
}: {
  agent: AgentCard;
  onOpen: (name: string) => void;
}) {
  const work = agent.statusReason ?? agent.currentWork;
  const full = work ?? "No active task";

  return (
    <button
      type="button"
      className="fb-list-row"
      data-status={agent.status}
      onClick={() => onOpen(agent.name)}
      aria-label={`${agent.displayName}, ${agent.column}, conversation ${
        agent.conversationId
      }, ${agent.ticketCount} ${
        agent.ticketCount === 1 ? "ticket" : "tickets"
      }, ${agent.status}${agent.statusReason === null ? "" : `: ${agent.statusReason}`}`}
    >
      <span className="fb-avatar-wrap fb-list-avatar">
        <DoodOrb
          agentId={agent.name}
          status={agent.status}
          size={40}
          outfit={loadAgentDood(agent.name).outfit}
        />
        <StatusDot status={agent.status} />
      </span>
      <span className="fb-list-body">
        <span className="fb-list-title">{agent.displayName}</span>
        <span
          className={`fb-list-sub${
            agent.status === "blocked" ? " fb-list-sub--blocked" : ""
          }`}
          title={full}
        >
          {work === null || work === "" ? "No active task" : work}
          {agent.status === "blocked" && agent.statusReasonCount > 1 ? (
            <span className="fb-more"> +{agent.statusReasonCount - 1} more</span>
          ) : null}
        </span>
        <span className="fb-list-meta">
          <StatusTag status={agent.status} />
          <span className="fb-list-column" title={agent.column}>
            {agent.column}
          </span>
          <span className="fb-list-conv">#{agent.conversationId}</span>
        </span>
      </span>
      <span className="fb-list-side">
        {agent.ticketCount === 0 ? null : (
          <span className="fb-list-stat">
            <b>{agent.ticketCount}</b>
            <span>{agent.ticketCount === 1 ? "ticket" : "tickets"}</span>
          </span>
        )}
        <span className="fb-list-chevron" aria-hidden="true" />
      </span>
    </button>
  );
}

function BotList({
  agents,
  onOpen,
}: {
  agents: readonly AgentCard[];
  onOpen: (name: string) => void;
}) {
  const sections = [
    {
      key: "working",
      label: "In motion",
      agents: agents.filter((agent) => agent.status === "working"),
    },
    {
      key: "blocked",
      label: "Needs a person",
      agents: agents.filter((agent) => agent.status === "blocked"),
    },
    {
      key: "idle",
      label: "On call",
      agents: agents.filter((agent) => agent.status === "idle"),
    },
  ].filter((section) => section.agents.length > 0);

  if (sections.length === 0) {
    return (
      <p className="fb-list-empty">
        The factory did not return any agents. Nothing is invented here.
      </p>
    );
  }

  return (
    <section className="fb-list" aria-label="Factory bots">
      {sections.map((section) => (
        <div className="fb-list-section" key={section.key}>
          <ListHead label={section.label} count={section.agents.length} />
          {section.agents.map((agent) => (
            <BotRow key={agent.name} agent={agent} onOpen={onOpen} />
          ))}
        </div>
      ))}
    </section>
  );
}

function ThreadRow({
  ticket,
  agent,
  attention,
  onOpen,
}: {
  ticket: TicketSummary;
  agent: AgentCard | undefined;
  attention: string | null;
  onOpen: (ticket: TicketSummary) => void;
}) {
  const botName = agent?.displayName ?? ticket.bot;

  return (
    <button
      type="button"
      className={`fb-list-row${attention === null ? "" : " fb-list-row--attention"}`}
      onClick={() => onOpen(ticket)}
      aria-label={`${ticket.title}, ${ticket.linearId}, ${stageLabel(
        ticket.stage,
      )}, ${botName}${attention === null ? "" : `, ${attention} needs an answer`}`}
    >
      <span className="fb-avatar-wrap fb-list-avatar">
        {agent === undefined ? (
          <span className="fb-bot-mark" aria-hidden="true">
            {botName.slice(0, 1).toUpperCase()}
          </span>
        ) : (
          <DoodOrb
          agentId={agent.name}
          status={agent.status}
          size={40}
          outfit={loadAgentDood(agent.name).outfit}
        />
        )}
        {agent === undefined ? null : <StatusDot status={agent.status} />}
      </span>
      <span className="fb-list-body">
        <span className="fb-list-title">{ticket.title}</span>
        <span className="fb-list-sub">
          <span>{ticket.linearId}</span>
          <span className="fb-list-bot">{botName}</span>
        </span>
        <span className="fb-list-meta">
          <span className="fb-model-pill">{botName}</span>
          {attention === null ? null : (
            <span className="fb-attention-pill" title={`${attention} needs an answer`}>
              Needs answer
            </span>
          )}
          {ticket.feature === null ? null : (
            <span className="fb-list-feature" title={ticket.feature}>
              {ticket.feature}
            </span>
          )}
          {ticket.labels.slice(0, 2).map((label) => (
            <span className="fb-label-pill" key={label}>
              {label}
            </span>
          ))}
        </span>
      </span>
      <span className="fb-list-side">
        <StageTag stage={ticket.stage} />
        <span className="fb-list-chevron" aria-hidden="true" />
      </span>
    </button>
  );
}

function ThreadList({
  tickets,
  agents,
  attentionByTicket,
  onOpen,
}: {
  tickets: readonly TicketSummary[];
  agents: readonly AgentCard[];
  attentionByTicket: ReadonlyMap<string, string>;
  onOpen: (ticket: TicketSummary) => void;
}) {
  const sections = [
    {
      key: "motion",
      label: "In motion",
      tickets: tickets.filter(
        (ticket) =>
          !["staging", "production", "done"].includes(ticket.stage),
      ),
    },
    {
      key: "on-call",
      label: "On call",
      tickets: tickets.filter((ticket) =>
        ["staging", "production"].includes(ticket.stage),
      ),
    },
    {
      key: "settled",
      label: "Settled",
      tickets: tickets.filter((ticket) => ticket.stage === "done"),
    },
  ].filter((section) => section.tickets.length > 0);

  if (sections.length === 0) {
    return (
      <p className="fb-list-empty">
        No threads yet. The factory will list one here when a request arrives.
      </p>
    );
  }

  return (
    <section className="fb-list" aria-label="Factory threads">
      {sections.map((section) => (
        <div className="fb-list-section" key={section.key}>
          <ListHead label={section.label} count={section.tickets.length} />
          {section.tickets.map((ticket) => (
            <ThreadRow
              key={ticket.linearId}
              ticket={ticket}
              agent={agents.find((agent) => agent.name === ticket.bot)}
              attention={attentionByTicket.get(ticket.linearId) ?? null}
              onOpen={onOpen}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

function BoardView({
  board,
  tab,
  attentionByTicket,
  onOpenAgent,
  onOpenTicket,
}: {
  board: Polled<BoardResult>;
  tab: BoardTab;
  attentionByTicket: Map<string, string>;
  onOpenAgent: (name: string) => void;
  onOpenTicket: (ticket: TicketSummary) => void;
}) {
  const data = board.data;
  if (board.error !== null) return <RpcError message={board.error} />;
  if (data === null) return <p className="fb-placeholder">Reading the factory…</p>;
  if (!data.ok) return <FailureView failure={data} />;
  return (
    <>
      <BoardPulse
        snapshot={data.snapshot}
        blocked={blockedAgentCount(data.agents)}
        fetchedAt={data.fetchedAt}
      />
      {tab === "threads" ? (
        <ThreadList
          tickets={data.tickets}
          agents={data.agents}
          attentionByTicket={attentionByTicket}
          onOpen={onOpenTicket}
        />
      ) : (
        <BotList agents={data.agents} onOpen={onOpenAgent} />
      )}
    </>
  );
}

function AgentHeader({
  agent,
  onBack,
  compact = false,
}: {
  agent: AgentCard;
  onBack: () => void;
  compact?: boolean;
}) {
  const orb = useRef<DoodOrbHandle>(null);
  const [dood, setDood] = useState<AgentDood>(() => loadAgentDood(agent.name));
  const [giftOpen, setGiftOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [treatOver, setTreatOver] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const gift = boxCountdown(dood, now);
  const feed = (): void => {
    orb.current?.feed();
    setDood((value) => ({ ...value, fed: value.fed + 1 }));
  };

  useEffect(() => {
    saveAgentDood(agent.name, dood);
  }, [agent.name, dood]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`fb-agent-head${compact ? " fb-agent-head--compact" : ""}`}>
      <button type="button" className="fb-back" onClick={onBack}>
        ← All agents
      </button>
      <div className="fb-agent-hero">
        <div
          className={`fb-avatar-wrap fb-avatar-wrap--hero${
            treatOver ? " is-treat-target" : ""
          }`}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("text/factory-treat")) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setTreatOver(true);
            }
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return;
            }
            setTreatOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setTreatOver(false);
            if (event.dataTransfer.getData("text/factory-treat") !== "") feed();
          }}
        >
          <DoodOrb
            ref={orb}
            agentId={agent.name}
            status={agent.status}
            size={compact ? 64 : 160}
            outfit={dood.outfit}
          />
          <StatusDot status={agent.status} />
        </div>
        <div className="fb-agent-copy">
          <div className="fb-agent-title">
            <h2>{agent.displayName}</h2>
            <StatusTag status={agent.status} />
          </div>
          <p className="fb-agent-sub">
            <span>Conversation <span className="fb-mono">#{agent.conversationId}</span></span>
            <span>{agent.column}</span>
            <span>{agent.ticketCount} {agent.ticketCount === 1 ? "ticket" : "tickets"}</span>
          </p>
          <p
            className={`fb-agent-work${
              agent.status === "blocked" ? " fb-agent-work--blocked" : ""
            }`}
          >
            {agent.statusReason ??
              agent.currentWork ??
              "No active task. This agent is waiting for work."}
          </p>
          <div className="fb-agent-care">
            <button
              type="button"
              draggable
              onClick={feed}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/factory-treat", "cookie");
                event.dataTransfer.effectAllowed = "copy";
              }}
              onDragEnd={() => setTreatOver(false)}
              title="Drag this cookie onto the Dood, or click to feed"
              aria-label="Drag a cookie onto the Dood to feed it"
              className="fb-treat-button"
            >
              <Pixels art="cookie" className="fb-treat-art" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!gift.ready) return;
                if (dood.boxes === 0 && gift.due !== dood) setDood(gift.due);
                setGiftOpen(true);
              }}
              disabled={!gift.ready}
              title={
                gift.ready
                  ? "A gift box is waiting"
                  : `Next gift in ${gift.label}`
              }
              aria-label={
                gift.ready
                  ? "Open the gift"
                  : `Next gift in ${gift.label}`
              }
            >
              <Pixels art="box" className="fb-care-art" />
            </button>
            <button
              type="button"
              onClick={() => setWardrobeOpen(true)}
              title="Change its outfit"
              aria-label="Open the wardrobe"
            >
              <Pixels art="spark" className="fb-care-art" />
            </button>
          </div>
        </div>
      </div>
      {wardrobeOpen ? (
        <WardrobeDialog
          agentId={agent.name}
          agentName={agent.displayName}
          status={agent.status}
          dood={dood}
          onDood={setDood}
          onClose={() => setWardrobeOpen(false)}
        />
      ) : null}
      {giftOpen ? (
        <GiftDialog
          agentId={agent.name}
          color={avatarLook(null, agent.name).color}
          owned={dood.owned}
          onGrant={(item, wear) => setDood((value) => grantGift(value, item, wear))}
          onClose={() => setGiftOpen(false)}
        />
      ) : null}
    </div>
  );
}

function TicketRow({
  ticket,
  selected,
  attention,
  onSelect,
}: {
  ticket: TicketSummary;
  selected: boolean;
  attention: string | null;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`fb-ticket-row${attention === null ? "" : " fb-ticket-row--attention"}`}
      data-selected={selected ? "true" : "false"}
      data-stage={ticket.stage}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      aria-label={`${ticket.linearId}, ${ticket.title}${attention === null ? "" : `, ${attention} needs an answer`}`}
    >
      <span className="fb-ticket-row-top">
        <span className="fb-ticket-id">{ticket.linearId}</span>
        <span className="fb-ticket-row-flags">
          {attention === null ? null : (
            <span className="fb-attention-pill">Needs answer</span>
          )}
          <StageTag stage={ticket.stage} />
        </span>
      </span>
      <span className="fb-ticket-title">{ticket.title}</span>
    </button>
  );
}

/** A tool result that is JSON is easier to scan as a tree than as one long line. */
function parseJsonText(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function JsonValueView({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null) return <span className="fb-json-null">null</span>;
  if (typeof value === "string") {
    return <span className="fb-json-string">"{value}"</span>;
  }
  if (typeof value === "number") {
    return <span className="fb-json-number">{String(value)}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="fb-json-boolean">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="fb-json-muted">[]</span>;
    return (
      <span className="fb-json-tree">
        <span className="fb-json-muted">[</span>
        {value.map((entry, index) => (
          <span className="fb-json-row" key={index} style={{ paddingLeft: 12 + depth * 10 }}>
            <span className="fb-json-index">{index}</span>
            <JsonValueView value={entry} depth={depth + 1} />
          </span>
        ))}
        <span className="fb-json-muted">]</span>
      </span>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="fb-json-muted">{"{}"}</span>;
    return (
      <span className="fb-json-tree">
        <span className="fb-json-muted">{"{"}</span>
        {entries.map(([key, entry]) => (
          <span className="fb-json-row" key={key} style={{ paddingLeft: 12 + depth * 10 }}>
            <span className="fb-json-key">{key}</span>
            <span className="fb-json-muted">:</span>
            <JsonValueView value={entry} depth={depth + 1} />
          </span>
        ))}
        <span className="fb-json-muted">{"}"}</span>
      </span>
    );
  }
  return <span className="fb-json-muted">{String(value)}</span>;
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <div className="fb-json" role="region" aria-label="JSON result">
      <JsonValueView value={value} />
    </div>
  );
}

function transcriptRole(kind: string): "user" | "assistant" | "tool" {
  const normalized = kind.toLowerCase();
  if (/user|human|person/.test(normalized)) return "user";
  if (/assistant|model|agent|bot/.test(normalized)) return "assistant";
  return "tool";
}

type TranscriptEntry = Transcript["entries"][number];
type TranscriptTurn = {
  role: "user" | "assistant";
  entries: TranscriptEntry[];
  tools: TranscriptEntry[];
};

/** One assistant answer and every tool result that followed it is one turn. */
function groupTranscript(entries: readonly TranscriptEntry[]): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  for (const entry of entries) {
    const role = transcriptRole(entry.kind);
    if (role === "assistant" || role === "user") {
      turns.push({ role, entries: [entry], tools: [] });
      continue;
    }
    const last = turns.at(-1);
    if (last !== undefined && last.role === "assistant") last.tools.push(entry);
    else turns.push({ role: "assistant", entries: [], tools: [entry] });
  }
  return turns;
}

function TranscriptEntryContent({ entry }: { entry: TranscriptEntry }) {
  const parsed = parseJsonText(entry.text);
  return parsed === null ? (
    <Markdown content={entry.text} className="fb-entry-text" />
  ) : (
    <JsonBlock value={parsed} />
  );
}

function TranscriptView({
  transcript,
  defaultCollapsed = false,
}: {
  transcript: Transcript;
  defaultCollapsed?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const tools = readLiveTools(transcript.live);
  const active = activeLiveTool(tools);
  const generating = isGenerating(transcript.live);
  const turns = groupTranscript(transcript.entries);
  const visibleTurns = expanded ? turns : turns.slice(-1);
  const visibleTools = expanded ? tools : active === null ? [] : [active];

  useEffect(() => {
    setExpanded(false);
    setCollapsed(defaultCollapsed);
  }, [defaultCollapsed, transcript.linearId]);

  return (
    <section className="fb-transcript" aria-label="Conversation">
      <div className="fb-section-head">
        <h3>Conversation</h3>
        <div className="fb-transcript-actions">
          {active !== null ? (
            <span className="fb-live-pill">
              <span className="fb-live-dot" aria-hidden="true" />
              Live tool
            </span>
          ) : generating ? (
            <span className="fb-live-pill fb-live-pill--quiet">Generating</span>
          ) : null}
          <button
            type="button"
            className="fb-line-button fb-line-button--small"
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed
              ? turns.length === 0
                ? "Show conversation"
                : `Show conversation (${turns.length})`
              : "Hide conversation"}
          </button>
          {!collapsed && turns.length > 1 ? (
            <button
              type="button"
              className="fb-line-button fb-line-button--small"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded
                ? "Show latest turn"
                : `Show all ${turns.length} turns`}
            </button>
          ) : null}
        </div>
      </div>

      {collapsed ? null : (
        <>
      {visibleTools.length > 0 ? (
        <div className="fb-live-tools">
          {visibleTools.map((tool) => (
            <div
              key={`${tool.callId}-${tool.nested ? "nested" : "tool"}`}
              className={`fb-tool${tool === active ? " is-active" : ""}`}
              data-status={tool.status}
              aria-current={tool === active ? "true" : undefined}
            >
              <div className="fb-tool-head">
                <span className="fb-tool-state" aria-hidden="true" />
                <span className="fb-tool-name">
                  {tool.nested ? "↳ " : ""}
                  {tool.name}
                </span>
                <span className="fb-tool-status">{tool.status}</span>
              </div>
              {tool.output !== null ? (
                <pre className="fb-tool-output">{tool.output}</pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {turns.length === 0 ? (
        <p className="fb-muted">No conversation entries yet.</p>
      ) : (
        <ol className="fb-entries">
          {visibleTurns.map((turn, index) => (
            <li
              key={`${index}-${turn.role}-${turn.entries[0]?.kind ?? "tool"}`}
              className={`fb-turn fb-turn--${turn.role}`}
            >
              {turn.entries.map((entry, entryIndex) => (
                <article
                  key={`${entryIndex}-${entry.kind}`}
                  className="fb-entry"
                  data-role={turn.role}
                >
                  <span className="fb-entry-kind">
                    {turn.role === "user" ? "You" : "Assistant"}
                  </span>
                  <TranscriptEntryContent entry={entry} />
                </article>
              ))}
              {turn.tools.length === 0 ? null : (
                <details className="fb-turn-tools">
                  <summary>
                    {turn.tools.length} tool{" "}
                    {turn.tools.length === 1 ? "result" : "results"}
                  </summary>
                  {turn.tools.map((entry, toolIndex) => (
                    <div
                      key={`${toolIndex}-${entry.kind}`}
                      className="fb-turn-tool"
                    >
                      <span className="fb-entry-kind">Tool result</span>
                      <TranscriptEntryContent entry={entry} />
                    </div>
                  ))}
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
        </>
      )}
    </section>
  );
}

function TicketOwner({ agent }: { agent: AgentCard }) {
  const orb = useRef<DoodOrbHandle>(null);
  const [dood, setDood] = useState(() => loadAgentDood(agent.name));
  const [giftOpen, setGiftOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [treatOver, setTreatOver] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const gift = boxCountdown(dood, now);
  const feed = (): void => {
    orb.current?.feed();
    setDood((value) => ({ ...value, fed: value.fed + 1 }));
  };

  useEffect(() => {
    saveAgentDood(agent.name, dood);
  }, [agent.name, dood]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fb-ticket-owner" aria-label={`Owned by ${agent.displayName}`}>
      <div
        className={`fb-avatar-wrap fb-ticket-owner-dood${
          treatOver ? " is-treat-target" : ""
        }`}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("text/factory-treat")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setTreatOver(true);
          }
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setTreatOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setTreatOver(false);
          if (event.dataTransfer.getData("text/factory-treat") !== "") feed();
        }}
      >
        <DoodOrb
          ref={orb}
          agentId={agent.name}
          status={agent.status}
          size={92}
          outfit={dood.outfit}
        />
        <StatusDot status={agent.status} />
      </div>
      <span className="fb-ticket-owner-name">{agent.displayName}</span>
      <div className="fb-ticket-owner-actions">
        <button
          type="button"
          draggable
          onClick={feed}
          onDragStart={(event) => {
            event.dataTransfer.setData("text/factory-treat", "cookie");
            event.dataTransfer.effectAllowed = "copy";
          }}
          onDragEnd={() => setTreatOver(false)}
          title="Feed a cookie"
          aria-label="Feed a cookie"
        >
          <Pixels art="cookie" className="fb-ticket-care-art" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (!gift.ready) return;
            if (dood.boxes === 0 && gift.due !== dood) setDood(gift.due);
            setGiftOpen(true);
          }}
          disabled={!gift.ready}
          title={gift.ready ? "Open the gift" : `Next gift in ${gift.label}`}
          aria-label={gift.ready ? "Open the gift" : `Next gift in ${gift.label}`}
        >
          <Pixels art="box" className="fb-ticket-care-art" />
        </button>
        <button
          type="button"
          onClick={() => setWardrobeOpen(true)}
          title="Open the wardrobe"
          aria-label="Open the wardrobe"
        >
          <Pixels art="spark" className="fb-ticket-care-art" />
        </button>
      </div>
      {giftOpen ? (
        <GiftDialog
          agentId={agent.name}
          color={avatarLook(null, agent.name).color}
          owned={dood.owned}
          onGrant={(item, wear) => setDood((value) => grantGift(value, item, wear))}
          onClose={() => setGiftOpen(false)}
        />
      ) : null}
      {wardrobeOpen ? (
        <WardrobeDialog
          agentId={agent.name}
          agentName={agent.displayName}
          status={agent.status}
          dood={dood}
          onDood={setDood}
          onClose={() => setWardrobeOpen(false)}
        />
      ) : null}
    </div>
  );
}

function TicketComments({
  comments,
}: {
  comments: TicketDetail["comments"];
}) {
  if (comments.length === 0) {
    return <p className="fb-muted">No Linear comments yet.</p>;
  }
  return (
    <ol className="fb-comment-list">
      {comments.map((comment, index) => (
        <li key={`${comment.createdAt}:${index}`} className="fb-comment">
          <div className="fb-comment-head">
            <strong>{comment.author}</strong>
            <time dateTime={comment.createdAt}>
              {new Date(comment.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
          <Markdown content={comment.body} className="fb-comment-body" />
        </li>
      ))}
    </ol>
  );
}

function TicketDetailView({
  ticket,
  agent,
  transcript,
  transcriptError,
  onBack,
  onSteer,
}: {
  ticket: TicketDetail;
  agent: AgentCard;
  transcript: Transcript | null;
  transcriptError: string | null;
  onBack: () => void;
  onSteer: (ticket: TicketDetail, message: string) => Promise<ChatResult>;
}) {
  const [steerText, setSteerText] = useState("");
  const [steering, setSteering] = useState(false);
  const [steerError, setSteerError] = useState<string | null>(null);
  const [steerNotice, setSteerNotice] = useState<string | null>(null);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"description" | "comments">(
    "description",
  );
  const isBlocked = agent.status === "blocked";
  const hasDescription =
    ticket.description !== undefined &&
    ticket.description !== null &&
    ticket.description.trim() !== "";

  const blocker = agent.statusReason ?? ticket.stopReason;
  const worktreeConflict =
    blocker === null
      ? null
      : blocker.match(
          /checkout selected ([^,\s]+), but ticket (SDD-\d+) owns ([^.\s]+)\. A person must choose which ticket owns this worktree\./iu,
        );
  const suggestions =
    !isBlocked || blocker === null
      ? []
      : /whether to start or attach/i.test(blocker)
        ? ["Start the work", "Attach to the existing feature"]
        : worktreeConflict !== null
          ? [
              `Keep ${worktreeConflict[2]} as the worktree owner.`,
              "Use the selected checkout for this worktree.",
            ]
          : [];

  useEffect(() => {
    setSteerText("");
    setSteerError(null);
    setSteerNotice(null);
    setDescriptionOpen(false);
    setDetailTab("description");
  }, [ticket.linearId]);

  const sendAnswer = async (message: string): Promise<void> => {
    if (message.trim() === "" || steering) return;
    setSteering(true);
    setSteerError(null);
    setSteerNotice(null);
    try {
      const result = await onSteer(ticket, message);
      if (result.ok) {
        setSteerText("");
        setSteerNotice(`Sent to ${agent.displayName} through the Orchestrator.`);
      } else {
        setSteerError(result.message);
      }
    } catch (cause) {
      setSteerError(errorText(cause));
    } finally {
      setSteering(false);
    }
  };

  const steer = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void sendAnswer(steerText);
  };

  return (
    <article className="fb-ticket" data-stage={ticket.stage}>
      <div className="fb-ticket-back">
        <button type="button" className="fb-back" onClick={onBack}>
          ← Tickets
        </button>
      </div>
      <header className="fb-ticket-head">
        <TicketOwner agent={agent} />
        <div className="fb-ticket-head-main">
          <div className="fb-ticket-head-top">
            <span className="fb-ticket-id">{ticket.linearId}</span>
            <StageTag stage={ticket.stage} />
          </div>
          <h2>{ticket.title}</h2>
          <div className="fb-ticket-meta-line">
            <span>{ticket.attempts} attempts</span>
            {ticket.worktree === null ? null : <span>Worktree ready</span>}
          </div>
        </div>
      </header>

      <section
        className={`fb-answer${isBlocked ? " is-blocked" : ""}`}
        aria-labelledby="ticket-answer-title"
      >
        <span className="fb-answer-kicker">
          {isBlocked ? "Needs your answer" : "Ticket reply"}
        </span>
        <h3 id="ticket-answer-title">
          {isBlocked
            ? `${agent.displayName} needs your answer`
            : `Reply to ${agent.displayName}`}
        </h3>
        {isBlocked ? (
          <div className="fb-answer-brief">
            <span>Factory blocker</span>
            {worktreeConflict === null ? (
              <p>{blocker ?? "This ticket is blocked on a person."}</p>
            ) : (
              <div className="fb-answer-conflict">
                <strong>Which ticket owns this worktree?</strong>
                <dl>
                  <div>
                    <dt>Checkout selected</dt>
                    <dd><code>{worktreeConflict[1]}</code></dd>
                  </div>
                  <div>
                    <dt>{worktreeConflict[2]} owns</dt>
                    <dd><code>{worktreeConflict[3]}</code></dd>
                  </div>
                </dl>
              </div>
            )}
            {suggestions.length === 0 ? null : (
              <div className="fb-answer-suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="fb-answer-suggestion"
                    onClick={() => setSteerText(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="fb-answer-reason">
            Send a message through the Orchestrator. This ticket stays the same.
          </p>
        )}
        <form className="fb-answer-form" onSubmit={steer}>
          <textarea
            id="ticket-answer"
            value={steerText}
            onChange={(event) => {
              setSteerText(event.target.value);
              setSteerError(null);
              setSteerNotice(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={3_000}
            placeholder={`Type your answer to ${agent.displayName}…`}
            disabled={steering}
            aria-label={`Answer ${agent.displayName}`}
          />
          <button
            type="submit"
            className="fb-line-button fb-line-button--accent"
            disabled={steering || steerText.trim() === ""}
          >
            {steering
              ? "Sending…"
              : isBlocked
                ? "Send answer"
                : "Send reply"}
          </button>
        </form>
        {steerError === null ? null : (
          <p className="fb-answer-feedback fb-answer-feedback--error" role="alert">
            {steerError}
          </p>
        )}
        {steerNotice === null ? null : (
          <p className="fb-answer-feedback" role="status">
            {steerNotice}
          </p>
        )}
        <p className="fb-answer-note">
          Goes through the Orchestrator. It won’t create a new ticket.
        </p>
      </section>

      <div className="fb-ticket-body">
        {hasDescription ? (
          <section
            className={`fb-ticket-description${descriptionOpen ? " is-open" : ""}`}
          >
            <button
              type="button"
              className="fb-ticket-description-toggle"
              aria-expanded={descriptionOpen}
              onClick={() => setDescriptionOpen((open) => !open)}
            >
              <span>Linear issue</span>
              <span>{descriptionOpen ? "Hide" : "Read"}</span>
            </button>
            {descriptionOpen ? (
              <>
                <div
                  className="fb-ticket-detail-tabs"
                  role="tablist"
                  aria-label="Linear issue"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailTab === "description"}
                    onClick={() => setDetailTab("description")}
                  >
                    Description
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailTab === "comments"}
                    onClick={() => setDetailTab("comments")}
                  >
                    Comments {ticket.comments.length}
                  </button>
                  {ticket.url === null ? null : (
                    <a
                      className="fb-ticket-open-link"
                      href={ticket.url}
                      target="_blank"
                      rel="noreferrer"
                      title="Open this issue in Linear to edit it or add a comment"
                    >
                      Open in Linear ↗
                    </a>
                  )}
                </div>
                <div className="fb-ticket-description-body">
                  {detailTab === "description" ? (
                    <Markdown content={ticket.description ?? ""} />
                  ) : (
                    <TicketComments comments={ticket.comments} />
                  )}
                </div>
                {detailTab === "comments" ? (
                  <p className="fb-comment-note">
                    Latest comments from Linear. Open the issue in Linear to
                    reply.
                  </p>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}

        <div className="fb-ticket-thread">
          {transcriptError !== null ? (
            <p className="fb-inline-error">
              Conversation unavailable: {transcriptError}
            </p>
          ) : transcript === null ? (
            <section className="fb-transcript">
              <div className="fb-section-head">
                <h3>Conversation</h3>
              </div>
              <p className="fb-muted">
                No conversation has been read for this ticket yet.
              </p>
            </section>
          ) : (
            <TranscriptView transcript={transcript} defaultCollapsed />
          )}
        </div>
      </div>
    </article>
  );
}

function TicketPane({
  selectedId,
  agentName,
  agent,
  ticket,
  onBack,
  onSteer,
}: {
  selectedId: string | null;
  agentName: string;
  agent: AgentCard;
  ticket: Polled<TicketResult>;
  onBack: () => void;
  onSteer: (ticket: TicketDetail, message: string) => Promise<ChatResult>;
}) {
  if (selectedId === null) {
    return (
      <div className="fb-placeholder">
        <p>Pick a ticket to see its fields and live transcript.</p>
      </div>
    );
  }
  const back = (
    <button type="button" className="fb-back fb-back--pane" onClick={onBack}>
      ← Tickets
    </button>
  );

  if (ticket.error !== null) {
    return (
      <div>
        {back}
        <RpcError message={ticket.error} />
      </div>
    );
  }
  if (ticket.data === null) {
    return (
      <div>
        {back}
        <p className="fb-placeholder fb-placeholder--pane">Reading ticket…</p>
      </div>
    );
  }
  if (!ticket.data.ok) {
    return (
      <div>
        {back}
        <FailureView failure={ticket.data} compact />
      </div>
    );
  }
  if (ticket.data.ticket.linearId !== selectedId) {
    return (
      <div>
        {back}
        <p className="fb-placeholder fb-placeholder--pane">Reading ticket…</p>
      </div>
    );
  }
  if (ticket.data.ticket.bot !== agentName) {
    return (
      <div>
        {back}
        <div className="fb-wrong-holder">
          <h2>{ticket.data.ticket.bot} holds this ticket</h2>
          <p className="fb-muted">
            {agentName} does not own {selectedId}. Open the{" "}
            {ticket.data.ticket.bot} agent to view it.
          </p>
        </div>
      </div>
    );
  }
  return (
    <TicketDetailView
      ticket={ticket.data.ticket}
      agent={agent}
      transcript={ticket.data.transcript}
      transcriptError={ticket.data.transcriptError}
      onBack={onBack}
      onSteer={onSteer}
    />
  );
}

function AgentView({
  board,
  agentName,
  selectedId,
  ticket,
  onBack,
  onSelectTicket,
  onBackToTickets,
  onSteer,
}: {
  board: Polled<BoardResult>;
  agentName: string;
  selectedId: string | null;
  ticket: Polled<TicketResult>;
  onBack: () => void;
  onSelectTicket: (linearId: string) => void;
  onBackToTickets: () => void;
  onSteer: (ticket: TicketDetail, message: string) => Promise<ChatResult>;
}) {
  if (board.error !== null) {
    return (
      <div className="fb-agent-view">
        <button type="button" className="fb-back" onClick={onBack}>
          ← All agents
        </button>
        <RpcError message={board.error} />
      </div>
    );
  }
  if (board.data === null) {
    return (
      <div className="fb-agent-view">
        <button type="button" className="fb-back" onClick={onBack}>
          ← All agents
        </button>
        <p className="fb-placeholder">Reading the factory…</p>
      </div>
    );
  }
  if (!board.data.ok) {
    return (
      <div className="fb-agent-view">
        <button type="button" className="fb-back" onClick={onBack}>
          ← All agents
        </button>
        <FailureView failure={board.data} />
      </div>
    );
  }

  const agent = board.data.agents.find((candidate) => candidate.name === agentName);
  if (agent === undefined) {
    return (
      <div className="fb-not-found">
        <h2>{agentName} is not in this factory</h2>
        <p className="fb-muted">
          The factory status did not return that agent, so this board will not
          invent it.
        </p>
        <button type="button" className="fb-back" onClick={onBack}>
          ← All agents
        </button>
      </div>
    );
  }

  const tickets = board.data.tickets.filter((entry) => entry.bot === agent.name);
  const attentionByTicket = attentionTicketMap(board.data.agents, board.data.tickets);

  return (
    <div
      className="fb-agent-view"
      data-selected={selectedId === null ? "false" : "true"}
    >
      {selectedId === null ? (
        <>
          <AgentHeader key={agent.name} agent={agent} onBack={onBack} />
          <aside className="fb-ticket-list fb-ticket-list--full" aria-label={`${agent.displayName} tickets`}>
            <div className="fb-section-head">
              <h3>Tickets</h3>
              <span className="fb-count-pill">{tickets.length}</span>
            </div>
            {tickets.length === 0 ? (
              <p className="fb-muted">
                No tickets held. This agent is idle until the factory routes one
                to it.
              </p>
            ) : (
              <div className="fb-ticket-rows">
                {tickets.map((entry) => (
                  <TicketRow
                    key={entry.linearId}
                    ticket={entry}
                    selected={false}
                    attention={attentionByTicket.get(entry.linearId) ?? null}
                    onSelect={() => onSelectTicket(entry.linearId)}
                  />
                ))}
              </div>
            )}
          </aside>
        </>
      ) : (
        <div className="fb-ticket-pane fb-ticket-pane--full">
          <TicketPane
            selectedId={selectedId}
            agentName={agent.name}
            agent={agent}
            ticket={ticket}
            onBack={onBackToTickets}
            onSteer={onSteer}
          />
        </div>
      )}
    </div>
  );
}

type ChatEntry = ReturnType<typeof loadChatEntries>[number];

function ChatView({
  rpc,
  factoryId,
  active,
  orchestrator,
  onOpenTicket,
  showComposer = true,
  onHide,
}: {
  rpc: RpcClient;
  factoryId: string;
  active: boolean;
  orchestrator: AgentCard | undefined;
  onOpenTicket: (linearId: string) => void;
  showComposer?: boolean;
  onHide?: () => void;
}) {
  const [entries, setEntries] = useState<ChatEntry[]>(() => loadChatEntries(factoryId));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [picked, setPicked] = useState<ExperimentalProviderModelPickerValue>({
    providerId: "",
    model: "",
    reasoningLevel: "medium",
  });
  const [usePickedModel, setUsePickedModel] = useState(false);
  const [chatDood, setChatDood] = useState(() => loadAgentDood("orchestrator"));
  const [externalPending, setExternalPending] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [treatOver, setTreatOver] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const chatOrb = useRef<DoodOrbHandle>(null);
  const chatStatus = orchestrator?.status ?? "idle";
  const chatGift = boxCountdown(chatDood, now);
  const chatBusy = sending || externalPending;
  const nextId = useRef((loadChatEntries(factoryId).at(-1)?.id ?? 0) + 1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const filed = [...new Set(entries.flatMap((entry) => entry.created))];

  useEffect(() => {
    saveChatEntries(factoryId, entries);
  }, [factoryId, entries]);

  useEffect(() => {
    saveAgentDood("orchestrator", chatDood);
  }, [chatDood]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onPending = (event: Event) => {
      setExternalPending((event as CustomEvent<boolean>).detail === true);
    };
    window.addEventListener(CHAT_PENDING, onPending);
    return () => window.removeEventListener(CHAT_PENDING, onPending);
  }, []);

  useEffect(() => {
    const reload = () => {
      const next = loadChatEntries(factoryId);
      nextId.current = Math.max(
        nextId.current,
        (next.at(-1)?.id ?? 0) + 1,
      );
      setEntries(next);
    };
    window.addEventListener(CHAT_CHANGED, reload);
    return () => window.removeEventListener(CHAT_CHANGED, reload);
  }, [factoryId]);

  useEffect(() => {
    if (!active) return;
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [active, entries, chatBusy]);

  const push = (
    role: ChatEntry["role"],
    text: string,
    created: string[] = [],
  ): void => {
    setEntries((current) => [
      ...current,
      { id: nextId.current++, role, text, created },
    ]);
  };

  const send = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const text = input.trim();
    if (text === "" || chatBusy) return;
    setInput("");
    push("user", text);
    setSending(true);
    const reasoningLevel: "none" | "low" | "medium" | "high" | "max" | "xhigh" =
      picked.reasoningLevel === "ultra" || picked.reasoningLevel === "ultracode"
        ? "max"
        : picked.reasoningLevel === "xhigh"
          ? "xhigh"
          : picked.reasoningLevel === "none"
            ? "none"
            : picked.reasoningLevel === "low"
              ? "low"
              : picked.reasoningLevel === "high"
                ? "high"
                : picked.reasoningLevel === "max"
                  ? "max"
                  : "medium";
    const selection =
      usePickedModel && picked.providerId !== "" && picked.model !== ""
        ? {
            provider: picked.providerId,
            model: picked.model,
            reasoningLevel,
          }
        : {};
    try {
      const result = (await rpc.call("sendMessage", {
        factoryId,
        message: text,
        ...selection,
      })) as ChatResult;
      if (result.ok) push("orchestrator", result.answer, result.created);
      else push("error", chatFailureText(result));
    } catch (cause) {
      push("error", errorText(cause));
    } finally {
      setSending(false);
    }
  };

  const feedChatDood = (): void => {
    chatOrb.current?.feed();
    setChatDood((value) => ({ ...value, fed: value.fed + 1 }));
  };

  return (
    <div className="fb-chat-layout fb-chat-layout--dock">
      <section className="fb-chat-thread">
        <div className="fb-chat-thread-head fb-chat-thread-head--dock">
          <div>
            <h3>Dispatch</h3>
          </div>
          <div className="fb-chat-head-actions">
            <button
              type="button"
              className="fb-chat-hide"
              onClick={() => setClearOpen(true)}
              disabled={chatBusy || entries.length === 0}
              aria-label="Clear Orchestrator chat"
              title="Clear local chat history"
            >
              Clear
            </button>
            {onHide === undefined ? null : (
              <button
                type="button"
                className="fb-chat-hide"
                onClick={onHide}
                aria-label="Hide Orchestrator"
                title="Hide Orchestrator"
              >
                Hide
              </button>
            )}
          </div>
        </div>

        {clearOpen ? (
          <div className="fb-chat-clear" role="alertdialog" aria-label="Clear Orchestrator chat">
            <p>
              Clear this browser’s Orchestrator history? The factory’s memory
              and filed tickets stay unchanged.
            </p>
            <div className="fb-chat-clear-actions">
              <button
                type="button"
                className="fb-chat-clear-confirm"
                onClick={() => {
                  clearChatEntries(factoryId);
                  setEntries([]);
                  nextId.current = 1;
                  setClearOpen(false);
                }}
              >
                Clear chat
              </button>
              <button type="button" onClick={() => setClearOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <div className="fb-chat-care">
          <div
            className={`fb-avatar-wrap fb-avatar-wrap--chat-care${
              treatOver ? " is-treat-target" : ""
            }`}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("text/factory-treat")) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setTreatOver(true);
              }
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setTreatOver(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setTreatOver(false);
              if (event.dataTransfer.getData("text/factory-treat") !== "") feedChatDood();
            }}
          >
            <DoodOrb
              ref={chatOrb}
              agentId="orchestrator"
              status={chatStatus}
              size={92}
              outfit={chatDood.outfit}
            />
            <StatusDot status={chatStatus} />
          </div>
          <div className="fb-chat-care-copy">
            <strong className="fb-chat-care-name">Orchestrator</strong>
            <div className="fb-chat-care-actions">
              <button
                type="button"
                draggable
                onClick={feedChatDood}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/factory-treat", "cookie");
                  event.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={() => setTreatOver(false)}
                title="Feed a cookie"
                aria-label="Feed a cookie"
              >
                <Pixels art="cookie" className="fb-treat-art" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!chatGift.ready) return;
                  if (chatDood.boxes === 0 && chatGift.due !== chatDood) setChatDood(chatGift.due);
                  setGiftOpen(true);
                }}
                disabled={!chatGift.ready}
                title={chatGift.ready ? "Open the gift" : `Next gift in ${chatGift.label}`}
                aria-label={chatGift.ready ? "Open the gift" : `Next gift in ${chatGift.label}`}
              >
                <Pixels art="box" className="fb-care-art" />
              </button>
              <button type="button" onClick={() => setWardrobeOpen(true)} title="Open the wardrobe" aria-label="Open the wardrobe">
                <Pixels art="spark" className="fb-care-art" />
              </button>
            </div>
          </div>
        </div>
        {filed.length === 0 ? null : (
          <div className="fb-chat-filed fb-chat-filed--dock">
            <span>Filed tickets</span>
            {filed.map((linearId) => (
              <button
                key={linearId}
                type="button"
                onClick={() => onOpenTicket(linearId)}
              >
                {linearId}
              </button>
            ))}
          </div>
        )}

        <div className="fb-chat-log" aria-live="polite">
        {entries.length === 0 && !chatBusy ? (
          <p className="fb-chat-empty">
            Tell the Orchestrator what to build, fix, or investigate. It files
            the ticket and hands it to the stage that owns it.
          </p>
        ) : null}
        {entries.map((entry) => (
          <div key={entry.id} className={`fb-msg fb-msg--${entry.role}`}>
            <div className="fb-msg-head">
              {entry.role === "orchestrator" ? (
                <span className="fb-msg-dood" aria-hidden="true">
                  <DoodAvatar agentId="orchestrator" />
                </span>
              ) : null}
              <span className="fb-msg-role">
                {entry.role === "user"
                  ? "You"
                  : entry.role === "orchestrator"
                    ? "Orchestrator"
                    : "Error"}
              </span>
            </div>
            <Markdown content={entry.text} className="fb-msg-body" />
            {entry.created.length > 0 ? (
              <div className="fb-msg-tickets">
                {entry.created.map((linearId) => (
                  <button
                    key={linearId}
                    type="button"
                    onClick={() => onOpenTicket(linearId)}
                  >
                    Open {linearId}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {chatBusy ? (
          <div className="fb-msg fb-msg--orchestrator fb-msg--pending">
            <div className="fb-msg-head">
              <span className="fb-msg-dood" aria-hidden="true">
                <DoodAvatar agentId="orchestrator" />
              </span>
              <span className="fb-msg-role">Orchestrator</span>
            </div>
            <p>Working through the factory…</p>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {showComposer ? (
        <form className="fb-chat-form" onSubmit={(event) => void send(event)}>
          <div className="fb-chat-controls">
            <ProviderModelPicker
              value={picked}
              onChange={setPicked}
              align="start"
              className="fb-chat-model"
              disabled={chatBusy}
            />
            <label className="fb-chat-use-model">
              <input
                type="checkbox"
                checked={usePickedModel}
                onChange={(event) => setUsePickedModel(event.target.checked)}
                disabled={chatBusy}
              />
              Use this model
            </label>
            <span className="fb-chat-model-hint">
              {usePickedModel && picked.providerId !== "" && picked.model !== ""
                ? "The Orchestrator will use this model if the factory has it"
                : "Factory default model unless enabled"}
            </span>
          </div>
          <div className="fb-chat-row">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              maxLength={4_000}
              rows={2}
              placeholder="Ask the Orchestrator for work…"
              aria-label="Message the Orchestrator"
              disabled={chatBusy}
            />
            <button type="submit" disabled={chatBusy || input.trim() === ""}>
              {chatBusy ? "Working…" : "Send"}
            </button>
          </div>
        </form>
      ) : (
        <div className="fb-chat-ticket-note">
          <strong>Answering this ticket?</strong>
          <p>
            Use the reply box on the ticket. The Orchestrator’s response still
            appears here, and the conversation stays in sync.
          </p>
        </div>
      )}
      {giftOpen ? (
        <GiftDialog
          agentId="orchestrator"
          color={avatarLook(null, "orchestrator").color}
          owned={chatDood.owned}
          onGrant={(item, wear) =>
            setChatDood((value) => grantGift(value, item, wear))
          }
          onClose={() => setGiftOpen(false)}
        />
      ) : null}
      {wardrobeOpen ? (
        <WardrobeDialog
          agentId="orchestrator"
          agentName="Orchestrator"
          status={chatStatus}
          dood={chatDood}
          onDood={setChatDood}
          onClose={() => setWardrobeOpen(false)}
        />
      ) : null}
      </section>
    </div>
  );
}

function FactoryBotsPanel({ subPath }: PluginNavPanelProps) {
  const route = parsePanelRoute(subPath);
  const navigate = useBbNavigate();
  const { factories, error } = useFactories();
  const open = (id: string) => navigate.toPluginPanel(PANEL_PATH, { subPath: boardRoute(id) });
  if (factories === null) {
    return (
      <div className="fb-root">
        {error === null ? (
          <p className="fb-placeholder">Reading factories…</p>
        ) : (
          <RpcError message={error} />
        )}
      </div>
    );
  }
  const current = route.view === "factories"
    ? undefined
    : factories.find((factory) => factory.id === route.factoryId);
  if (route.view === "factories" || current === undefined) {
    return (
      <FactoriesView
        factories={factories}
        missing={route.view === "factories" ? null : route.factoryId}
        onOpen={open}
      />
    );
  }
  // Keyed so polling, chat, and pane state never carry over between factories.
  return (
    <FactoryPanel
      key={current.id}
      subPath={subPath}
      factory={current}
      factories={factories}
      route={route}
    />
  );
}

function FactoryPanel({
  subPath,
  factory,
  factories,
  route,
}: {
  subPath: string;
  factory: Factory;
  factories: readonly Factory[];
  route: FactoryView;
}) {
  const factoryId = factory.id;
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [boardTab, setBoardTab] = useState<BoardTab>("threads");
  const [chatWidth, setChatWidth] = useState(readChatWidth);
  const [chatOpen, setChatOpen] = useState(readChatOpen);
  const [resizingChat, setResizingChat] = useState(false);
  const ticketId = route.view === "ticket" ? route.linearId : null;
  const { board, ticket } = useFactoryPoll(rpc, factoryId, ticketId);
  const rootRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const previousPath = useRef(subPath);

  useEffect(() => {
    if (previousPath.current === subPath) return;
    previousPath.current = subPath;
    rootRef.current?.focus({ preventScroll: true });
  }, [subPath]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_WIDTH_KEY, String(chatWidth));
    } catch {
      // The panel still works when storage is unavailable.
    }
  }, [chatWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_OPEN_KEY, String(chatOpen));
    } catch {
      // The panel still works when storage is unavailable.
    }
  }, [chatOpen]);

  const go = (next: string): void => {
    navigate.toPluginPanel(PANEL_PATH, { subPath: next });
  };

  const beginChatResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (window.matchMedia("(max-width: 1150px)").matches) return;
    event.preventDefault();
    const right =
      shellRef.current?.getBoundingClientRect().right ?? window.innerWidth;
    setResizingChat(true);
    const move = (moveEvent: PointerEvent) => {
      setChatWidth(clampChatWidth(right - moveEvent.clientX));
    };
    const stop = () => {
      setResizingChat(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const resizeChatWithKeyboard = (
    event: KeyboardEvent<HTMLDivElement>,
  ): void => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setChatWidth((value) => clampChatWidth(value + 20));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setChatWidth((value) => clampChatWidth(value - 20));
    } else if (event.key === "Home") {
      event.preventDefault();
      setChatWidth(DEFAULT_CHAT_WIDTH);
    }
  };

  const orchestrator = board.data?.ok === true
    ? board.data.agents.find((agent) => agent.name === "orchestrator")
    : undefined;
  const openChatTicket = (linearId: string): void => {
    const created = board.data?.ok === true
      ? board.data.tickets.find((entry) => entry.linearId === linearId)
      : undefined;
    if (created === undefined) go(boardRoute(factoryId));
    else go(ticketRoute(factoryId, created.bot, linearId));
  };

  const attentionByTicket = board.data?.ok === true
    ? attentionTicketMap(board.data.agents, board.data.tickets)
    : new Map<string, string>();
  const tab: ShellTab =
    route.view === "board" ? boardTab
    : route.view === "agent" ? "bots"
    : route.view === "ticket" ? "threads"
    : route.view;
  const openTab = (next: ShellTab): void => {
    if (next === "souls") go(soulsRoute(factoryId));
    else if (next === "capabilities") go(capabilitiesRoute(factoryId));
    else {
      setBoardTab(next);
      go(boardRoute(factoryId));
    }
  };
  // New work always lands on the board's composer, the one place work starts.
  const startNewWork = (): void => {
    setChatOpen(true);
    if (route.view === "ticket") go(boardRoute(factoryId));
    window.setTimeout(() => {
      rootRef.current?.querySelector<HTMLTextAreaElement>(".fb-chat-dock textarea")?.focus();
    }, 60);
  };

  return (
    <div className="fb-root" ref={rootRef} tabIndex={-1}>
      <ForemanBar
        factories={factories}
        current={factory}
        health={boardHealth(board.data, board.error !== null)}
        onOpenFactory={(id) => navigate.toPluginPanel(PANEL_PATH, { subPath: boardRoute(id) })}
        onOverview={() => navigate.toPluginPanel(PANEL_PATH, { subPath: "" })}
      >
        <FactoryTabs
          tab={tab}
          attention={attentionByTicket.size}
          onTab={openTab}
          onNewWork={startNewWork}
        />
      </ForemanBar>
      <div
        ref={shellRef}
        className={`fb-shell${resizingChat ? " is-resizing" : ""}${
          chatOpen ? "" : " is-chat-closed"
        }`}
        style={{ "--fb-chat-width": `${chatWidth}px` } as CSSProperties}
      >
        <main className="fb-main">
      {route.view === "souls" ? (
        <div className="fb-souls-embed">
          <SoulsView factoryId={factoryId} />
        </div>
      ) : route.view === "capabilities" ? (
        <CapabilitiesView factoryId={factoryId} />
      ) : route.view === "board" ? (
        <BoardView
          board={board}
          tab={boardTab}
          attentionByTicket={attentionByTicket}
          onOpenAgent={(name) => go(agentRoute(factoryId, name))}
          onOpenTicket={(ticket) => go(ticketRoute(factoryId, ticket.bot, ticket.linearId))}
        />
      ) : route.view === "agent" || route.view === "ticket" ? (
        <AgentView
          board={board}
          agentName={route.agent}
          selectedId={ticketId}
          ticket={ticket}
          onBack={() => go(boardRoute(factoryId))}
          onSelectTicket={(linearId) => go(ticketRoute(factoryId, route.agent, linearId))}
          onBackToTickets={() => go(agentRoute(factoryId, route.agent))}
          onSteer={async (selected, message) => {
            const prompt = [
              `Steer ticket ${selected.linearId} ("${selected.title}") while it works.`,
              "The person says:",
              message,
              "Use the existing ticket; do not create a duplicate.",
            ].join("\n");
            appendChatEntry(factoryId, {
              role: "user",
              text: `Steering ${selected.linearId}: ${message}`,
              created: [],
            });
            setChatPending(true);
            try {
              const result = (await rpc.call("sendMessage", {
                factoryId,
                message: prompt,
              })) as ChatResult;
              appendChatEntry(
                factoryId,
                result.ok
                  ? {
                      role: "orchestrator",
                      text: result.answer,
                      created: result.created,
                    }
                  : { role: "error", text: result.message, created: [] },
              );
              return result;
            } catch (cause) {
              appendChatEntry(factoryId, {
                role: "error",
                text: errorText(cause),
                created: [],
              });
              throw cause;
            } finally {
              setChatPending(false);
            }
          }}
        />
      ) : null}
        </main>
        {chatOpen ? (
        <aside className="fb-chat-dock" aria-label="Orchestrator chat">
          <div
            className="fb-chat-resize"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize Orchestrator chat"
            aria-valuemin={MIN_CHAT_WIDTH}
            aria-valuemax={MAX_CHAT_WIDTH}
            aria-valuenow={chatWidth}
            tabIndex={0}
            title="Drag to resize the chat"
            onPointerDown={beginChatResize}
            onKeyDown={resizeChatWithKeyboard}
          />
          <ChatView
            rpc={rpc}
            factoryId={factoryId}
            active
            orchestrator={orchestrator}
            onOpenTicket={openChatTicket}
            showComposer={route.view !== "ticket"}
            onHide={() => setChatOpen(false)}
          />
        </aside>
        ) : null}
      </div>
      {chatOpen ? null : (
        <button
          type="button"
          className="fb-chat-reveal"
          onClick={() => setChatOpen(true)}
          aria-expanded={false}
          title="Show Orchestrator"
          aria-label="Show Orchestrator"
        >
          Orchestrator
        </button>
      )}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "factory-bots",
    title: "Foreman",
    icon: "Factory",
    path: PANEL_PATH,
    component: FactoryBotsPanel,
  });
});
