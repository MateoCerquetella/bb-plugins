import "./app.css";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  definePluginApp,
  useBbNavigate,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { PluginNavPanelProps } from "@get-bb/plugin-sdk/app";

import type {
  AgentCard,
  AgentStatus,
  BoardResult,
  BoardSnapshot,
  TicketDetail,
  TicketResult,
  TicketSummary,
  Transcript,
  rpcContract,
} from "./contract";
import { activeLiveTool, isGenerating, readLiveTools } from "./lib/live";
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
}: {
  snapshot: BoardSnapshot | null;
  fetchedAt: number | null;
  failure: { reason: "not-running" | "unavailable" } | null;
  transportError: boolean;
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

function AgentCardView({
  agent,
  onOpen,
}: {
  agent: AgentCard;
  onOpen: (name: string) => void;
}) {
  const work =
    agent.status === "blocked"
      ? agent.statusReason
      : agent.currentWork;
  const full =
    agent.statusReason !== null
      ? agent.statusReason
      : (agent.currentWork ?? "No active task");

  return (
    <button
      type="button"
      className="fb-card"
      data-status={agent.status}
      onClick={() => onOpen(agent.name)}
      aria-label={`${agent.displayName}, ${agent.column}, conversation ${
        agent.conversationId
      }, ${agent.ticketCount} ${
        agent.ticketCount === 1 ? "ticket" : "tickets"
      }, ${agent.status}${agent.statusReason === null ? "" : `: ${agent.statusReason}`}`}
    >
      <span className="fb-card-top">
        <StatusDot status={agent.status} />
        <span className="fb-card-name">{agent.displayName}</span>
        <span className="fb-card-conv">#{agent.conversationId}</span>
      </span>
      <span className="fb-card-role">{agent.column}</span>
      <span className="fb-card-meta">
        <span className="fb-card-count">{agent.ticketCount}</span>
        <span className="fb-card-count-label">
          {agent.ticketCount === 1 ? "ticket" : "tickets"}
        </span>
        <StatusTag status={agent.status} />
      </span>
      <span
        className={`fb-card-work${agent.status === "blocked" ? " fb-card-work--blocked" : ""}`}
        title={full}
      >
        {work === null || work === "" ? "No active task" : work}
        {agent.status === "blocked" && agent.statusReasonCount > 1 ? (
          <span className="fb-more"> +{agent.statusReasonCount - 1} more</span>
        ) : null}
      </span>
    </button>
  );
}

function BoardView({
  board,
  onOpenAgent,
}: {
  board: Polled<BoardResult>;
  onOpenAgent: (name: string) => void;
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
      />
      {board.error !== null ? (
        <RpcError message={board.error} />
      ) : data === null ? (
        <p className="fb-placeholder">Reading the factory…</p>
      ) : !data.ok ? (
        <FailureView failure={data} />
      ) : (
        <>
          {data.snapshot.tickets === 0 ? (
            <p className="fb-empty-note">
              No tickets yet. The factory will list one here when a request
              arrives.
            </p>
          ) : null}
          <section className="fb-grid" aria-label="Factory agents">
            {data.agents.map((agent) => (
              <AgentCardView key={agent.name} agent={agent} onOpen={onOpenAgent} />
            ))}
          </section>
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
  return (
    <div className="fb-agent-head">
      <button type="button" className="fb-back" onClick={onBack}>
        ← All agents
      </button>
      <div className="fb-agent-title">
        <StatusDot status={agent.status} />
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
            <li key={`${index}-${entry.kind}`} className="fb-entry">
              <span className="fb-entry-kind">{entry.kind}</span>
              <span className="fb-entry-text">{entry.text}</span>
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
}: {
  ticket: TicketDetail;
  transcript: Transcript | null;
  transcriptError: string | null;
  onBack: () => void;
}) {
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
    </article>
  );
}

function TicketPane({
  selectedId,
  agentName,
  ticket,
  onBack,
}: {
  selectedId: string | null;
  agentName: string;
  ticket: Polled<TicketResult>;
  onBack: () => void;
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
}: {
  board: Polled<BoardResult>;
  agentName: string;
  selectedId: string | null;
  ticket: Polled<TicketResult>;
  onBack: () => void;
  onSelectTicket: (linearId: string) => void;
  onBackToTickets: () => void;
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
    <div className="fb-agent-view">
      <AgentHeader agent={agent} onBack={onBack} />
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
          />
        </div>
      </div>
    </div>
  );
}

function FactoryBotsPanel({ subPath }: PluginNavPanelProps) {
  const route = parsePanelRoute(subPath);
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
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
        <BoardView board={board} onOpenAgent={(name) => go(agentRoute(name))} />
      ) : (
        <AgentView
          board={board}
          agentName={route.agent}
          selectedId={ticketId}
          ticket={ticket}
          onBack={() => go("")}
          onSelectTicket={(linearId) => go(ticketRoute(route.agent, linearId))}
          onBackToTickets={() => go(agentRoute(route.agent))}
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
