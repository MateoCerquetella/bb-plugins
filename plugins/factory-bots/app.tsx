import "./app.css";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
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
  BoardSnapshot,
  ChatResult,
  TicketDetail,
  TicketResult,
  TicketSummary,
  Transcript,
  rpcContract,
} from "./contract";
import { DoodOrb, type DoodOrbHandle } from "./lib/dood-orb";
import { GiftDialog } from "./lib/gift-dialog";
import { WardrobeDialog } from "./lib/wardrobe-dialog";
import { Pixels } from "./lib/pixels";
import { avatarLook } from "./lib/dood";
import {
  boxCountdown,
  grantGift,
  loadAgentDood,
  saveAgentDood,
  type AgentDood,
} from "./lib/dood-state";
import { WEAR_ITEMS } from "./lib/wear-items";
import { activeLiveTool, isGenerating, readLiveTools } from "./lib/live";
import { stageLabel } from "./lib/derive";
import { agentRoute, parsePanelRoute, ticketRoute } from "./lib/route";

const PANEL_PATH = "factory-bots";
const REFRESH_MS = 5_000;

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

function statusLabel(status: AgentStatus): string {
  return status === "idle" ? "Idle" : status === "working" ? "Working" : "Blocked";
}

function formatTime(epoch: number): string {
  return new Date(epoch).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * One chained poll for the board and the selected ticket, so the two reads
 * never overlap and the next 5s tick starts only after both settle.
 */
function useFactoryPoll(
  rpc: RpcClient,
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
        const data = await rpcRef.current.call("getBoard", null);
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
  }, []);

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
  return <span className="fb-stage">{stage}</span>;
}

function HealthPill({
  tone,
  label,
}: {
  tone: "live" | "offline" | "unavailable" | "loading";
  label: string;
}) {
  return (
    <span className="fb-health" data-tone={tone}>
      <span className="fb-health-dot" aria-hidden="true" />
      {label}
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

function BoardHeader({
  snapshot,
  fetchedAt,
  failure,
  transportError,
  onChat,
}: {
  snapshot: BoardSnapshot | null;
  fetchedAt: number | null;
  failure: { reason: "not-running" | "unavailable" } | null;
  transportError: boolean;
  onChat: () => void;
}) {
  const health =
    failure?.reason === "not-running"
      ? { tone: "offline" as const, label: "Not running" }
      : failure !== null || transportError
        ? { tone: "unavailable" as const, label: "Unavailable" }
        : snapshot === null
          ? { tone: "loading" as const, label: "Reading" }
          : { tone: "live" as const, label: "Live" };

  const stageNote =
    snapshot !== null
      ? "No tickets in any stage"
      : failure?.reason === "not-running"
        ? "Factory is not running"
        : "No health reading yet";

  return (
    <header className="fb-header">
      <div className="fb-title">
        <span className="fb-eyebrow">Empirical Factory</span>
        <div className="fb-title-row">
          <h1>Factory Bots</h1>
          <HealthPill tone={health.tone} label={health.label} />
          <button type="button" className="fb-chat-link" onClick={onChat}>
            Orchestrator chat
          </button>
        </div>
        <p className="fb-subtitle">
          Read-only view through the Factory MCP
          {fetchedAt === null ? "" : ` · updated ${formatTime(fetchedAt)}`}
        </p>
      </div>

      <div className="fb-metrics">
        <div className="fb-metric">
          <span className="fb-metric-value">{snapshot?.bots ?? "—"}</span>
          <span className="fb-metric-label">agents</span>
        </div>
        <div className="fb-metric">
          <span className="fb-metric-value">{snapshot?.tickets ?? "—"}</span>
          <span className="fb-metric-label">tickets</span>
        </div>
        <div className="fb-stages">
          {snapshot === null || snapshot.byStage.length === 0 ? (
            <span className="fb-muted">{stageNote}</span>
          ) : (
            snapshot.byStage.map((stage) => (
              <span key={stage.stage} className="fb-stage-count">
                {stage.label}
                <b>{stage.count}</b>
              </span>
            ))
          )}
        </div>
      </div>
    </header>
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
        <span className="fb-list-chevron" aria-hidden="true">
          ›
        </span>
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
  onOpen,
}: {
  ticket: TicketSummary;
  agent: AgentCard | undefined;
  onOpen: (ticket: TicketSummary) => void;
}) {
  const botName = agent?.displayName ?? ticket.bot;

  return (
    <button
      type="button"
      className="fb-list-row"
      onClick={() => onOpen(ticket)}
      aria-label={`${ticket.title}, ${ticket.linearId}, ${stageLabel(
        ticket.stage,
      )}, ${botName}`}
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
          {ticket.linearId}
          <span className="fb-sep">·</span>
          {botName}
        </span>
        <span className="fb-list-meta">
          <span className="fb-model-pill">{botName}</span>
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
        <span className="fb-list-chevron" aria-hidden="true">
          ›
        </span>
      </span>
    </button>
  );
}

function ThreadList({
  tickets,
  agents,
  onOpen,
}: {
  tickets: readonly TicketSummary[];
  agents: readonly AgentCard[];
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
  onTab,
  onOpenAgent,
  onOpenTicket,
  onChat,
}: {
  board: Polled<BoardResult>;
  tab: BoardTab;
  onTab: (tab: BoardTab) => void;
  onOpenAgent: (name: string) => void;
  onOpenTicket: (ticket: TicketSummary) => void;
  onChat: () => void;
}) {
  const data = board.data;
  const snapshot = data?.ok === true ? data.snapshot : null;
  const fetchedAt = data?.fetchedAt ?? null;

  return (
    <>
      <BoardHeader
        snapshot={snapshot}
        fetchedAt={fetchedAt}
        failure={data?.ok === false ? data : null}
        transportError={board.error !== null}
        onChat={onChat}
      />
      {board.error !== null ? (
        <RpcError message={board.error} />
      ) : data === null ? (
        <p className="fb-placeholder">Reading the factory…</p>
      ) : !data.ok ? (
        <FailureView failure={data} />
      ) : (
        <>
          <div className="fb-viewbar">
            <div className="fb-tabs" role="tablist" aria-label="Bots and threads">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "threads"}
                onClick={() => onTab("threads")}
              >
                Threads
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "bots"}
                onClick={() => onTab("bots")}
              >
                Bots
              </button>
            </div>
            <span className="fb-view-note">
              {tab === "threads"
                ? "Every ticket is a thread; open one to see its live work."
                : "The agents that carry the threads."}
            </span>
          </div>
          {tab === "threads" ? (
            <ThreadList
              tickets={data.tickets}
              agents={data.agents}
              onOpen={onOpenTicket}
            />
          ) : (
            <BotList agents={data.agents} onOpen={onOpenAgent} />
          )}
        </>
      )}
    </>
  );
}

function AgentHeader({
  agent,
  onBack,
}: {
  agent: AgentCard;
  onBack: () => void;
}) {
  const orb = useRef<DoodOrbHandle>(null);
  const [dood, setDood] = useState<AgentDood>(() => loadAgentDood(agent.name));
  const [giftOpen, setGiftOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const gift = boxCountdown(dood, now);

  useEffect(() => {
    saveAgentDood(agent.name, dood);
  }, [agent.name, dood]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fb-agent-head">
      <button type="button" className="fb-back" onClick={onBack}>
        ← All agents
      </button>
      <div className="fb-agent-hero">
        <div className="fb-avatar-wrap fb-avatar-wrap--hero">
          <DoodOrb
            ref={orb}
            agentId={agent.name}
            status={agent.status}
            size={128}
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
            Conversation <span className="fb-mono">#{agent.conversationId}</span>
            <span className="fb-sep">·</span>
            {agent.column}
            <span className="fb-sep">·</span>
            {agent.ticketCount} {agent.ticketCount === 1 ? "ticket" : "tickets"}
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
              onClick={() => {
                orb.current?.feed();
                setDood((value) => ({ ...value, fed: value.fed + 1 }));
              }}
              title="Give it a treat"
            >
              <Pixels art="cookie" className="fb-care-art" />
              <span>Treat{dood.fed > 0 ? ` · ${dood.fed}` : ""}</span>
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
            >
              <Pixels art="box" className="fb-care-art" />
              <span>Gift{gift.ready ? "" : ` · ${gift.label}`}</span>
            </button>
            <button
              type="button"
              onClick={() => setWardrobeOpen(true)}
              title="Change its outfit"
            >
              <Pixels art="spark" className="fb-care-art" />
              <span>Wardrobe</span>
            </button>
            <span className="fb-care-note">
              {dood.owned.length === 0
                ? "It has not found anything yet."
                : `${dood.owned.length} of ${WEAR_ITEMS.length} found.`}
            </span>
          </div>
        </div>
      </div>
      {wardrobeOpen ? (
        <WardrobeDialog
          agentName={agent.displayName}
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
  onSelect,
}: {
  ticket: TicketSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="fb-ticket-row"
      data-selected={selected ? "true" : "false"}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
    >
      <span className="fb-ticket-row-top">
        <span className="fb-ticket-id">{ticket.linearId}</span>
        <StageTag stage={ticket.stage} />
      </span>
      <span className="fb-ticket-title">{ticket.title}</span>
    </button>
  );
}

function Field({
  label,
  children,
  tone,
}: {
  label: string;
  children: ReactNode;
  tone?: "danger" | "muted" | "mono";
}) {
  return (
    <div className="fb-field">
      <dt>{label}</dt>
      <dd className={tone === undefined ? undefined : `fb-${tone}`}>{children}</dd>
    </div>
  );
}

function transcriptRole(kind: string): "user" | "assistant" | "tool" {
  const normalized = kind.toLowerCase();
  if (/user|human|person/.test(normalized)) return "user";
  if (/assistant|model|agent|bot/.test(normalized)) return "assistant";
  return "tool";
}

function TranscriptView({ transcript }: { transcript: Transcript }) {
  const tools = readLiveTools(transcript.live);
  const active = activeLiveTool(tools);
  const generating = isGenerating(transcript.live);

  return (
    <section className="fb-transcript" aria-label="Transcript">
      <div className="fb-section-head">
        <h3>Transcript</h3>
        {active !== null ? (
          <span className="fb-live-pill">
            <span className="fb-live-dot" aria-hidden="true" />
            Live tool
          </span>
        ) : generating ? (
          <span className="fb-live-pill fb-live-pill--quiet">Generating</span>
        ) : null}
      </div>

      {tools.length > 0 ? (
        <div className="fb-live-tools">
          {tools.map((tool) => (
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

      {transcript.entries.length === 0 ? (
        <p className="fb-muted">No transcript entries yet.</p>
      ) : (
        <ol className="fb-entries">
          {transcript.entries.map((entry, index) => (
            <li
              key={`${index}-${entry.kind}`}
              className="fb-entry"
              data-role={transcriptRole(entry.kind)}
            >
              <span className="fb-entry-kind">{entry.kind}</span>
              <Markdown content={entry.text} className="fb-entry-text" />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TicketDetailView({
  ticket,
  transcript,
  transcriptError,
  onBack,
  onSteer,
}: {
  ticket: TicketDetail;
  transcript: Transcript | null;
  transcriptError: string | null;
  onBack: () => void;
  onSteer: (ticket: TicketDetail, message: string) => Promise<ChatResult>;
}) {
  const [steerText, setSteerText] = useState("");
  const [steering, setSteering] = useState(false);
  const [steerNote, setSteerNote] = useState<string | null>(null);
  const [steerError, setSteerError] = useState<string | null>(null);

  const steer = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const message = steerText.trim();
    if (message === "" || steering) return;
    setSteering(true);
    setSteerNote(null);
    setSteerError(null);
    try {
      const result = await onSteer(ticket, message);
      if (result.ok) {
        setSteerText("");
        setSteerNote(
          result.answer.trim() === ""
            ? "Sent to the Orchestrator. The transcript refreshes as it works."
            : result.answer,
        );
      } else {
        setSteerError(result.message);
      }
    } catch (cause) {
      setSteerError(errorText(cause));
    } finally {
      setSteering(false);
    }
  };

  return (
    <article className="fb-ticket">
      <div className="fb-ticket-back">
        <button type="button" className="fb-back" onClick={onBack}>
          ← Tickets
        </button>
      </div>
      <header className="fb-ticket-head">
        <div className="fb-ticket-head-top">
          <span className="fb-ticket-id">{ticket.linearId}</span>
          <StageTag stage={ticket.stage} />
        </div>
        <h2>{ticket.title}</h2>
        <p className="fb-muted">
          Held by <span className="fb-strong">{ticket.bot}</span> · conversation{" "}
          <span className="fb-mono">#{ticket.conversationId}</span>
        </p>
      </header>

      <details className="fb-ticket-details">
        <summary>
          <span>Ticket details</span>
          <StageTag stage={ticket.stage} />
        </summary>
        <dl className="fb-fields">
          <Field label="Stage">{ticket.stage}</Field>
          <Field label="Attempts">
            {ticket.attempts} total · {ticket.stageAttempts} this stage
          </Field>
          <Field
            label="Stop reason"
            tone={ticket.stopReason === null ? "muted" : "danger"}
          >
            {ticket.stopReason ?? "None"}
          </Field>
          <Field label="Worktree" tone="mono">
            {ticket.worktree ?? "Not created"}
          </Field>
          <Field label="Feature" tone={ticket.feature === null ? "muted" : undefined}>
            {ticket.feature ?? "None"}
          </Field>
          <Field label="Labels" tone={ticket.labels.length === 0 ? "muted" : undefined}>
            {ticket.labels.length === 0 ? "None" : ticket.labels.join(", ")}
          </Field>
        </dl>

        <section className="fb-decisions" aria-label="Decisions">
          <h3>Decisions</h3>
          {ticket.decisions.length === 0 ? (
            <p className="fb-muted">No decisions recorded.</p>
          ) : (
            <ul>
              {ticket.decisions.map((decision, index) => (
                <li key={`${index}-${decision}`}>{decision}</li>
              ))}
            </ul>
          )}
        </section>
      </details>

      {transcriptError !== null ? (
        <p className="fb-inline-error">Transcript unavailable: {transcriptError}</p>
      ) : transcript === null ? (
        <section className="fb-transcript">
          <div className="fb-section-head">
            <h3>Transcript</h3>
          </div>
          <p className="fb-muted">No transcript has been read for this ticket yet.</p>
        </section>
      ) : (
        <TranscriptView transcript={transcript} />
      )}

      <form className="fb-steer" onSubmit={(event) => void steer(event)}>
        <div className="fb-steer-head">
          <h3>Steer this thread</h3>
          <span>via Orchestrator</span>
        </div>
        <textarea
          value={steerText}
          onChange={(event) => setSteerText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={2}
          maxLength={3_000}
          placeholder="Tell the agent what to change or check…"
          disabled={steering}
          aria-label="Steer this ticket"
        />
        <div className="fb-steer-foot">
          <span className="fb-muted">
            The Orchestrator is the only write path. The board stays read-only.
          </span>
          <button type="submit" disabled={steering || steerText.trim() === ""}>
            {steering ? "Steering…" : "Send steer"}
          </button>
        </div>
        {steerNote === null ? null : (
          <p className="fb-steer-note" role="status">{steerNote}</p>
        )}
        {steerError === null ? null : (
          <p className="fb-steer-error" role="alert">{steerError}</p>
        )}
      </form>
    </article>
  );
}

function TicketPane({
  selectedId,
  agentName,
  ticket,
  onBack,
  onSteer,
}: {
  selectedId: string | null;
  agentName: string;
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

  return (
    <div
      className="fb-agent-view"
      data-selected={selectedId === null ? "false" : "true"}
    >
      <AgentHeader key={agent.name} agent={agent} onBack={onBack} />
      <div className="fb-split">
        <aside className="fb-ticket-list" aria-label={`${agent.displayName} tickets`}>
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
                  selected={entry.linearId === selectedId}
                  onSelect={() => onSelectTicket(entry.linearId)}
                />
              ))}
            </div>
          )}
        </aside>
        <div className="fb-ticket-pane">
          <TicketPane
            selectedId={selectedId}
            agentName={agent.name}
            ticket={ticket}
            onBack={onBackToTickets}
            onSteer={onSteer}
          />
        </div>
      </div>
    </div>
  );
}

interface ChatEntry {
  id: number;
  role: "user" | "orchestrator" | "error";
  text: string;
  created: string[];
}

function ChatView({
  rpc,
  onBack,
  onOpenTicket,
}: {
  rpc: RpcClient;
  onBack: () => void;
  onOpenTicket: (linearId: string) => void;
}) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [picked, setPicked] = useState<ExperimentalProviderModelPickerValue>({
    providerId: "",
    model: "",
    reasoningLevel: "medium",
  });
  const [usePickedModel, setUsePickedModel] = useState(false);
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [entries, sending]);

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
    if (text === "" || sending) return;
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
        message: text,
        ...selection,
      })) as ChatResult;
      if (result.ok) push("orchestrator", result.answer, result.created);
      else push("error", result.message);
    } catch (cause) {
      push("error", errorText(cause));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fb-chat-layout">
      <aside className="fb-chat-rail">
        <button type="button" className="fb-back" onClick={onBack}>
          ← Board
        </button>
        <div className="fb-chat-title">
          <h2>Orchestrator</h2>
          <span className="fb-chat-tag">Single chat</span>
        </div>
        <p className="fb-chat-sub">
          Ask for work. The Orchestrator files a ticket and drives it through
          Sieve → Helm → Lens → Warden. This is the only write path; the board
          stays read-only.
        </p>
        <p className="fb-chat-rail-note">
          The thread on the right is the one conversation that can change the
          factory. The board beside it stays read-only.
        </p>
      </aside>

      <section className="fb-chat-thread">
        <div className="fb-chat-thread-head">
          <div>
            <span className="fb-chat-thread-kicker">Orchestrator</span>
            <h3>Thread</h3>
          </div>
          <span className="fb-chat-tag">Single chat</span>
        </div>

        <div className="fb-chat-log" aria-live="polite">
        {entries.length === 0 && !sending ? (
          <div className="fb-chat-empty">
            <p>Tell the Orchestrator what to build, fix, or investigate.</p>
            <p className="fb-muted">
              It decides whether the ticket is agent-implementable, files it,
              and hands it to the stage that owns it.
            </p>
          </div>
        ) : null}
        {entries.map((entry) => (
          <div key={entry.id} className={`fb-msg fb-msg--${entry.role}`}>
            <span className="fb-msg-role">
              {entry.role === "user"
                ? "You"
                : entry.role === "orchestrator"
                  ? "Orchestrator"
                  : "Error"}
            </span>
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
        {sending ? (
          <div className="fb-msg fb-msg--orchestrator fb-msg--pending">
            <span className="fb-msg-role">Orchestrator</span>
            <p>Working through the factory…</p>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form className="fb-chat-form" onSubmit={(event) => void send(event)}>
        <div className="fb-chat-controls">
          <ProviderModelPicker
            value={picked}
            onChange={setPicked}
            align="start"
            className="fb-chat-model"
            disabled={sending}
          />
          <label className="fb-chat-use-model">
            <input
              type="checkbox"
              checked={usePickedModel}
              onChange={(event) => setUsePickedModel(event.target.checked)}
              disabled={sending}
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
            disabled={sending}
          />
          <button type="submit" disabled={sending || input.trim() === ""}>
            {sending ? "Working…" : "Send"}
          </button>
        </div>
      </form>
      </section>
    </div>
  );
}

function FactoryBotsPanel({ subPath }: PluginNavPanelProps) {
  const route = parsePanelRoute(subPath);
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [boardTab, setBoardTab] = useState<BoardTab>("threads");
  const ticketId = route.view === "ticket" ? route.linearId : null;
  const { board, ticket } = useFactoryPoll(rpc, ticketId);
  const rootRef = useRef<HTMLDivElement>(null);
  const previousPath = useRef(subPath);

  useEffect(() => {
    if (previousPath.current === subPath) return;
    previousPath.current = subPath;
    rootRef.current?.focus({ preventScroll: true });
  }, [subPath]);

  const go = (next: string): void => {
    navigate.toPluginPanel(PANEL_PATH, { subPath: next });
  };

  return (
    <div className="fb-root" ref={rootRef} tabIndex={-1}>
      {route.view === "board" ? (
        <BoardView
          board={board}
          tab={boardTab}
          onTab={setBoardTab}
          onOpenAgent={(name) => go(agentRoute(name))}
          onOpenTicket={(ticket) => go(ticketRoute(ticket.bot, ticket.linearId))}
          onChat={() => go("chat")}
        />
      ) : route.view === "chat" ? (
        <ChatView
          rpc={rpc}
          onBack={() => go("")}
          onOpenTicket={(linearId) => go(ticketRoute("sieve", linearId))}
        />
      ) : (
        <AgentView
          board={board}
          agentName={route.agent}
          selectedId={ticketId}
          ticket={ticket}
          onBack={() => go("")}
          onSelectTicket={(linearId) => go(ticketRoute(route.agent, linearId))}
          onBackToTickets={() => go(agentRoute(route.agent))}
          onSteer={async (selected, message) => {
            const prompt = [
              `Steer ticket ${selected.linearId} ("${selected.title}") while it works.`,
              "The person says:",
              message,
              "Use the existing ticket; do not create a duplicate.",
            ].join("\n");
            return (await rpc.call("sendMessage", { message: prompt })) as ChatResult;
          }}
        />
      )}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "factory-bots",
    title: "Factory Bots",
    icon: "Bot",
    path: PANEL_PATH,
    component: FactoryBotsPanel,
  });
});
