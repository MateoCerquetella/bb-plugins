import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  PanelsTopLeft,
  Plus,
  RefreshCw,
  Square,
  Play,
  Monitor,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  definePluginApp,
  useRpc,
  useSettings,
  useBbContext,
  experimental_useSidebarThreads,
  type PluginRpcClient,
  type PluginMessageDirectiveProps,
  type PluginThreadPanelProps,
} from "@get-bb/plugin-sdk/app";
import type { BrowserSession, Dashboard, Scope, ProjectState, EnginePolicy, rpcContract } from "./contract.ts";
import { callSteelRpc } from "./rpc-timeout.ts";
import { useFollowViewer } from "./use-follow-viewer.ts";
import { LiveViewer, useDocumentVisible } from "./live-viewer.tsx";
import { liveViewerUrl } from "./viewer-protocol.ts";
import { SignInsPanel } from "./sign-ins-panel.tsx";
import "./app.css";

const CREATE_OPTIONS = { blockAds: true, width: 1440, height: 900 } as const;
const THREAD_PANEL_ACTION_ID = "steel-live-browser";
const ALWAYS_POLL = () => true;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function useSteelRpc(): PluginRpcClient<typeof rpcContract> {
  const rpc = useRpc<typeof rpcContract>();
  return useMemo(() => ({
    call: (method, ...args) => callSteelRpc(() => rpc.call(method, ...args), method),
  }) as PluginRpcClient<typeof rpcContract>, [rpc]);
}

function relativeTime(timestamp: string): string {
  const elapsed = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "Just now";
  const minutes = Math.max(1, Math.round(elapsed / 60_000));
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}

function shortId(id: string): string {
  return id.length <= 18 ? id : `${id.slice(0, 8)}...${id.slice(-4)}`;
}

function useScope(threadId?: string): Scope {
  const context = useBbContext();
  const id = threadId ?? context.threadId;
  return useMemo(() => id ? { threadId: id } : context.projectId ? { projectId: context.projectId } : {}, [id, context.projectId]);
}

function useSteelDashboard(scope: Scope, shouldPoll: () => boolean = ALWAYS_POLL) {
  const rpc = useSteelRpc();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const refreshing = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    if (!scope.threadId && !scope.projectId) {
      setDashboard(null);
      setError("No project selected.");
      return;
    }
    setError(null);
    refreshing.current = true;
    try {
      const result = await rpc.call("dashboard", scope);
      if (mounted.current) setDashboard(result);
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally { refreshing.current = false; }
  }, [rpc, scope]);

  const start = useCallback(async () => {
    if (startingRef.current || (!scope.threadId && !scope.projectId)) return;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    try {
      await rpc.call("createSession", { scope, options: CREATE_OPTIONS });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [rpc, scope, refresh]);
  useEffect(() => {
    mounted.current = true;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!document.hidden && shouldPoll()) await refresh();
      if (!stopped) timer = setTimeout(poll, 15000);
    };
    void poll();
    return () => { mounted.current = false; stopped = true; clearTimeout(timer); };
  }, [refresh, shouldPoll]);
  return { dashboard, error, refresh, start, starting };
}

function SteelThreadPanel({ threadId }: PluginThreadPanelProps) {
  return <ScopedSteelThreadPanel key={threadId} threadId={threadId} />;
}

function ScopedSteelThreadPanel({ threadId }: { threadId: string }) {
  const scope = useScope(threadId);
  const { dashboard, error, refresh, start, starting } = useSteelDashboard(scope);
  const [playerKey, setPlayerKey] = useState(0);
  const playerUrl = liveViewerUrl(dashboard);
  const visible = useDocumentVisible();
  const active = dashboard?.sessions.some(session => ["idle", "live"].includes(session.status));

  return (
    <section className="steel-thread-panel" aria-label="Steel live browser">
      <header className="steel-thread-panel__bar">
        <div>
          <strong>Steel Browser</strong>
          <span>{error ? "Unavailable" : active ? "Live in this thread" : dashboard?.connected ? "No active session" : "Connecting..."}</span>
        </div>
        <button aria-label="Reload Steel browser panel" className="steel-icon-button"
          onClick={() => { void refresh(); setPlayerKey(key => key + 1); }}
          title="Reload viewer" type="button">
          <RefreshCw aria-hidden="true" />
        </button>
      </header>
      {playerUrl && active && visible ? (
        <LiveViewer key={playerKey} url={playerUrl} title={`Steel browser for ${threadId}`} />
      ) : error || dashboard?.error ? (
        <div className="steel-panel-state" role="alert">{error ?? dashboard?.error}</div>
      ) : (
        <div className="steel-panel-state">
          <Monitor aria-hidden="true" />
          <strong>{dashboard ? "Start a browser session" : "Loading browser..."}</strong>
          {dashboard?.connected && <button type="button" className="steel-primary"
            disabled={starting} onClick={() => void start()}>
            <Play aria-hidden="true" />{starting ? "Starting..." : "Start browser"}
          </button>}
        </div>
      )}
    </section>
  );
}

export function SteelBrowserDirective(props: PluginMessageDirectiveProps) {
  return <ScopedSteelBrowser key={props.message.threadId} {...props} />;
}

function ScopedSteelBrowser({ message }: PluginMessageDirectiveProps) {
  const { anchor, style, anchorStyle, latest } = useFollowViewer(message.threadId);
  const scope = useScope(message.threadId);
  const [minimized, setMinimized] = useState(false);
  const shouldPoll = useCallback(() => {
    const viewers = document.querySelectorAll(`[data-steel-thread="${CSS.escape(message.threadId)}"]`);
    return !minimized && viewers.item(viewers.length - 1) === anchor.current;
  }, [anchor, message.threadId, minimized]);
  const { dashboard, error, refresh, start, starting } = useSteelDashboard(scope, shouldPoll);
  const [playerKey, setPlayerKey] = useState(0);
  const playerUrl = liveViewerUrl(dashboard);
  const visible = useDocumentVisible();
  const active = dashboard?.sessions.some(session => ["idle", "live"].includes(session.status));

  return (
    <div ref={anchor} style={anchorStyle} className="steel-inline-anchor" data-steel-thread={message.threadId}>
    <section style={style}
      className={`steel-inline-browser${minimized ? " steel-inline-browser--minimized" : ""}${style ? " steel-inline-browser--following" : ""}`}
      aria-label="Steel browser in this thread"
    >
      <header>
        <div>
          <Monitor aria-hidden="true" />
          <span>
            <strong>Steel Browser</strong>
            <small>{error ? "Unavailable" : active ? "Session available" : dashboard?.connected ? "No active session" : "Connecting"}</small>
          </span>
        </div>
        <div className="steel-inline-browser__actions">
          <button
            aria-expanded={!minimized}
            aria-label={minimized ? "Restore inline browser" : "Minimize inline browser"}
            onClick={() => setMinimized(value => !value)}
            title={minimized ? "Restore browser" : "Minimize browser"}
            type="button"
          >
            {minimized ? <Maximize2 aria-hidden="true" /> : <Minimize2 aria-hidden="true" />}
          </button>
          <button aria-label="Reload inline browser" onClick={() => {
            void refresh();
            setPlayerKey(key => key + 1);
          }} title="Reload browser" type="button">
            <RefreshCw aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="steel-inline-browser__viewport" hidden={minimized}>
        {playerUrl && active && latest && visible && !minimized ? (
          <LiveViewer key={playerKey} url={playerUrl} title={`Steel browser for ${message.threadId}`} />
        ) : !latest ? (
          <div className="steel-panel-state">Viewer active in the latest browser message</div>
        ) : error || dashboard?.error ? (
          <div className="steel-panel-state" role="alert">{error ?? dashboard?.error}</div>
        ) : (
          <div className="steel-panel-state">
            <Monitor aria-hidden="true" />
            <strong>{dashboard ? "Start a browser session" : "Loading browser..."}</strong>
            {dashboard?.connected && <button type="button" className="steel-primary"
              disabled={starting} onClick={() => void start()}>
              <Play aria-hidden="true" />{starting ? "Starting..." : "Start browser"}
            </button>}
          </div>
        )}
      </div>
    </section>
    </div>
  );
}

function ProjectControls({ scope }: { scope: Scope }) {
  if (!scope.threadId && !scope.projectId) {
    return <p role="status">No project selected. Project engine settings are available from a project context.</p>;
  }
  return <ScopedProjectControls key={JSON.stringify(scope)} scope={scope} />;
}

function ScopedProjectControls({ scope }: { scope: Scope }) {
  const rpc = useSteelRpc();
  const { values } = useSettings();
  const [project, setProject] = useState<ProjectState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setProject(null);
    setError(null);
    void rpc.call("project", scope).then(value => { if (current) setProject(value); })
      .catch(cause => { if (current) setError(errorMessage(cause)); });
    return () => { current = false; };
  }, [rpc, scope, attempt]);
  async function save(policy: EnginePolicy) {
    setBusy(true);
    setError(null);
    try { setProject(await rpc.call("setEngine", { scope, policy })); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className="steel-project-controls">
    <span title={project?.projectId}>{project?.projectName ?? "Project browser"}</span>
    <label>Engine
      <select aria-label="Browser engine" disabled={!project || busy}
        value={project?.policy.engine ?? "playwright"}
        onChange={event => project && void save({ ...project.policy, engine: event.target.value as EnginePolicy["engine"] })}>
        <option value="playwright">Playwright</option>
        <option value="jev">Jev</option>
        <option value="auto">Auto (Jev first)</option>
      </select>
    </label>
    <label><input type="checkbox" disabled={!project || busy}
      checked={project?.policy.fallback ?? false}
      onChange={event => project && void save({ ...project.policy, fallback: event.target.checked })} />Fallback</label>
    {error && <p role="alert">{error}</p>}
    {error && <button type="button" className="steel-icon-button" title="Retry project settings"
      aria-label="Retry project settings" onClick={() => setAttempt(value => value + 1)}>
      <RefreshCw aria-hidden="true" />
    </button>}
    {project?.policy.engine !== "playwright" && project && !values?.jevEnvFile &&
      <p role="status">Jev: credentials not configured</p>}
  </div>;
}

export function SteelAgentSettings() {
  const { values, isLoading } = useSettings();
  const scope = useScope();
  return (
    <section className="steel-agent-settings" aria-label="Browser agent configuration">
      <div className="steel-agent-settings__project">
        <strong>Project browser</strong>
        <ProjectControls scope={scope} />
      </div>
      <strong>jev-ultrafast</strong>
      <p role="status">Jev adapter installed · Live run not verified</p>
      <dl>
        <dt>Container DNS</dt><dd>{isLoading ? "Loading..." : String(values?.dnsServers || "1.1.1.1,8.8.8.8")}</dd>
        <dt>Checkout</dt><dd>{isLoading ? "Loading..." : String(values?.jevCheckout || "Not configured")}</dd>
        <dt>Credentials file</dt><dd>{isLoading ? "Loading..." : String(values?.jevEnvFile || "Not configured")}</dd>
        <dt>Text model</dt><dd>{isLoading ? "Loading..." : String(values?.jevTextModel || "Not configured")}</dd>
      </dl>
      <p>Configuration: BB Tools / Steel Browser. Credentials stay on the host.
        Live Jev runs use potentially billable TypeSafe and text-model APIs. DNS changes apply when a project browser is next provisioned or repaired.</p>
    </section>
  );
}

function SessionRow({
  session,
  busy,
  onRelease,
}: {
  session: BrowserSession;
  busy: boolean;
  onRelease: (session: BrowserSession) => void;
}) {
  return (
    <tr>
      <td>
        <code className="steel-session-id" title={session.id}>{shortId(session.id)}</code>
      </td>
      <td><span className={`steel-badge steel-badge--${session.status}`}>{session.status}</span></td>
      <td className="steel-muted">{relativeTime(session.createdAt)}</td>
      <td>
        <button
          aria-label={`Release session ${session.id}`}
          className="steel-icon-button"
          disabled={busy || !["idle", "live"].includes(session.status)}
          onClick={() => onRelease(session)}
          title="Release session"
          type="button"
        >
          <Square aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

function AllProjectsOverview({ projects, onSelect }: { projects: readonly { id: string; name: string }[]; onSelect: (id: string) => void }) {
  const rpc = useSteelRpc();
  const [rows, setRows] = useState<Record<string, { configured: boolean; connected: boolean; activeSessions: number }>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    void rpc.call("allProjects", {}).then(summaries => {
      if (mounted) setRows(Object.fromEntries(summaries.map(summary => [summary.projectId, summary])));
    }).catch(cause => { if (mounted) setError(errorMessage(cause)); });
    return () => { mounted = false; };
  }, [rpc]);
  return (
    <section className="steel-project-overview" aria-labelledby="steel-project-overview-heading">
      <div className="steel-toolbar"><div><h2 id="steel-project-overview-heading">All projects</h2><span className="steel-updated">{projects.length} projects</span></div></div>
      {error && <p className="steel-error" role="alert">{error}</p>}
      <div className="steel-project-grid">
        {projects.map(project => {
          const summary = rows[project.id];
          return <button className="steel-project-card" key={project.id} onClick={() => onSelect(project.id)} type="button">
            <span className={`steel-dot ${summary?.connected ? "steel-dot--ok" : "steel-dot--down"}`} />
            <span className="steel-project-card__name">{project.name}</span>
            <span className="steel-project-card__meta">{summary?.connected
              ? `${summary.activeSessions} active browser${summary.activeSessions === 1 ? "" : "s"}`
              : summary?.configured ? "Offline" : "Not configured"}</span>
          </button>;
        })}
      </div>
    </section>
  );
}

export function SteelBrowserPage() {
  const contextScope = useScope();
  const { projects, status } = experimental_useSidebarThreads();
  const [selectedProjectId, setSelectedProjectId] = useState(() => {
    try { return sessionStorage.getItem("steel-browser:selected-project") ?? ""; }
    catch { return ""; }
  });
  const projectId = projects.some(project => project.id === selectedProjectId) ? selectedProjectId : "";
  const scope = useMemo<Scope>(() => projectId ? { projectId } : contextScope, [projectId, contextScope]);
  const picker = (
    <label className="steel-project-picker">
      Project
      <select aria-label="Browser project" value={projectId || contextScope.projectId || ""}
        onChange={event => {
          setSelectedProjectId(event.target.value);
          try { sessionStorage.setItem("steel-browser:selected-project", event.target.value); } catch {}
        }}>
        <option value="" disabled>{status === "loading" ? "Loading projects..." : "Select a project"}</option>
        {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
    </label>
  );
  if (!scope.threadId && !scope.projectId) {
    return (
      <main className="steel-page">
        <header className="steel-header">
          <div className="steel-identity">
            <span className="steel-brand" aria-hidden="true"><PanelsTopLeft /></span>
            <h1>Steel Browser</h1>
          </div>
        </header>
        {picker}
        <AllProjectsOverview projects={projects} onSelect={id => setSelectedProjectId(id)} />
      </main>
    );
  }
  return <ScopedSteelBrowserPage key={JSON.stringify(scope)} scope={scope} picker={picker} />;
}

function ScopedSteelBrowserPage({ scope, picker }: { scope: Scope; picker: ReactNode }) {
  const rpc = useSteelRpc();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState<"refresh" | "create" | string | null>("refresh");
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const [watching, setWatching] = useState(true);
  const [playerKey, setPlayerKey] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const visible = useDocumentVisible();
  const pageRef = useRef<HTMLElement>(null);

  const refresh = useCallback(async () => {
    setBusy("refresh");
    setError(null);
    try {
      const next = await rpc.call("dashboard", scope);
      if (mounted.current) setDashboard(next);
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, [rpc, scope]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
  }, [refresh]);

  async function createSession() {
    if (busy !== null) return;
    setBusy("create");
    setError(null);
    try {
      await rpc.call("createSession", { scope, options: CREATE_OPTIONS });
      const next = await rpc.call("dashboard", scope);
      if (mounted.current) setDashboard(next);
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  async function releaseSession(session: BrowserSession) {
    if (busy !== null) return;
    const confirmed = window.confirm(
      `Release session ${shortId(session.id)}? Its open pages and unsaved browser state will close.`,
    );
    if (!confirmed) return;
    setBusy(session.id);
    setError(null);
    try {
      await rpc.call("releaseSession", { scope, sessionId: session.id });
      const next = await rpc.call("dashboard", scope);
      if (mounted.current) setDashboard(next);
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  const connected = dashboard?.connected === true;
  const sessions = dashboard?.sessions ?? [];
  const endpoint = dashboard?.endpoint ?? (error ? "Endpoint unavailable" : "Loading endpoint...");
  const activeSession = sessions.find(session => ["idle", "live"].includes(session.status));
  const playerUrl = liveViewerUrl(dashboard);

  return (
    <main className="steel-page" ref={pageRef}>
      <header className="steel-header">
        <div className="steel-identity">
          <span className="steel-brand" aria-hidden="true"><PanelsTopLeft /></span>
          <div>
            <h1>Steel Browser</h1>
            <p>Persistent project browser</p>
          </div>
        </div>
        <div className="steel-actions">
          <button
            aria-label="Refresh Steel"
            className="steel-icon-button"
            disabled={busy !== null}
            onClick={() => void refresh()}
            title="Refresh"
            type="button"
          >
            <RefreshCw className={busy === "refresh" ? "steel-spin" : undefined} aria-hidden="true" />
          </button>
          <button
            className="steel-primary"
            disabled={busy !== null || sessions.some(session => session.status === "live")}
            onClick={() => void createSession()}
            type="button"
          >
            <Plus aria-hidden="true" />
            {busy === "create" ? "Creating..." : "New session"}
          </button>
        </div>
      </header>

      {picker}
      <ProjectControls scope={scope} />
      <div className="steel-status">
        <span className={`steel-dot ${connected ? "steel-dot--ok" : "steel-dot--down"}`} />
        <span className={connected ? "steel-connected" : "steel-disconnected"}>
          {error ? "Unavailable" : dashboard === null ? "Connecting" : connected ? "Connected" : "Unavailable"}
        </span>
        <span className="steel-divider">/</span>
        <code>{endpoint}</code>
      </div>

      {(error ?? dashboard?.error) ? (
        <p className="steel-error" role="alert">{error ?? dashboard?.error}</p>
      ) : null}

      <section className="steel-browser" aria-label="Browser viewer">
        <div className="steel-viewer-toolbar">
          <h2><Monitor aria-hidden="true" /> Browser</h2>
          <div className="steel-actions">
            <button className="steel-primary" disabled={!connected || !activeSession}
              onClick={() => setWatching(!watching)} type="button">
              {watching ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
              {watching ? "Disconnect viewer" : "Watch browser"}
            </button>
            {watching && <button className="steel-icon-button" title="Reload viewer"
              aria-label="Reload viewer" onClick={() => setPlayerKey(key => key + 1)} type="button">
              <RefreshCw aria-hidden="true" />
            </button>}
          </div>
        </div>
        <div className="steel-viewport">
          {watching && visible && connected && activeSession && playerUrl ? (
            <LiveViewer key={playerKey} url={playerUrl} title="Live Steel browser" />
          ) : (
            <div className="steel-viewer-empty">
              <Monitor aria-hidden="true" />
              <strong>{busy === "refresh" && !dashboard ? "Preparing project browser..." : activeSession ? "Browser ready" : "No active browser"}</strong>
              <button className="steel-primary" disabled={busy !== null}
                onClick={() => activeSession ? setWatching(true) : void createSession().then(() => setWatching(true))}
                type="button">
                <Play aria-hidden="true" />{activeSession ? "Watch browser" : "Start browser"}
              </button>
            </div>
          )}
        </div>
      </section>

      <SignInsPanel scope={scope} rpc={rpc} onOpened={() => {
        setWatching(true);
        void refresh();
        pageRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }} />
      <section aria-labelledby="steel-sessions-heading">
        <div className="steel-toolbar">
          <div>
            <h2 id="steel-sessions-heading">Browsers <span>{sessions.length}</span></h2>
            <span className="steel-updated">{dashboard ? `Updated ${relativeTime(dashboard.checkedAt)}` : "Loading..."}</span>
          </div>
          <div className="steel-view-switch" aria-label="Browser layout">
            <button aria-label="Grid view" aria-pressed={viewMode === "grid"}
              onClick={() => setViewMode("grid")} title="Grid view" type="button">
              <LayoutGrid aria-hidden="true" />
            </button>
            <button aria-label="List view" aria-pressed={viewMode === "list"}
              onClick={() => setViewMode("list")} title="List view" type="button">
              <List aria-hidden="true" />
            </button>
          </div>
        </div>
        {sessions.length === 0 ? (
          <div className="steel-empty">
            <PanelsTopLeft aria-hidden="true" />
            <strong>{busy === "refresh" && !dashboard ? "Preparing project browser..." : connected ? "No active sessions" : "Steel is not connected"}</strong>
            <span>{busy === "refresh" && !dashboard ? "Connecting..." : connected ? "Start a browser when an agent needs one." : "Retry with Start browser or Refresh."}</span>
          </div>
        ) : viewMode === "grid" ? (
          <div className="steel-browser-grid">
            {sessions.map(session => {
              const usable = ["idle", "live"].includes(session.status);
              return (
                <article className={`steel-browser-tile ${usable ? "steel-browser-tile--active" : ""}`} key={session.id}>
                  <div className="steel-tile-preview">
                    <Monitor aria-hidden="true" />
                    <span>{usable ? "Ready to watch" : "Session closed"}</span>
                  </div>
                  <div className="steel-tile-body">
                    <div className="steel-tile-title">
                      <span className="steel-browser-icon" aria-hidden="true"><Monitor /></span>
                      <div>
                        <strong>Browser {shortId(session.id)}</strong>
                        <span>{relativeTime(session.createdAt)}</span>
                      </div>
                    </div>
                    <span className={`steel-badge steel-badge--${session.status}`}>{session.status}</span>
                  </div>
                  <div className="steel-tile-actions">
                    <button disabled={!usable} onClick={() => { setWatching(true); pageRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }}
                      type="button"><Play aria-hidden="true" />Watch</button>
                    <button aria-label={`Release session ${session.id}`} className="steel-icon-button"
                      disabled={busy !== null || !usable} onClick={() => void releaseSession(session)}
                      title="Release session" type="button"><Square aria-hidden="true" /></button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="steel-table-wrap">
            <table>
              <thead><tr><th>Session</th><th>Status</th><th>Started</th><th>Actions</th></tr></thead>
              <tbody>
                {sessions.map((session) => (
                  <SessionRow
                    busy={busy !== null}
                    key={session.id}
                    onRelease={(target) => void releaseSession(target)}
                    session={session}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className="steel-connection">
        <summary>Developer connection</summary>
        <code>{activeSession?.websocketUrl || "No active connection"}</code>
      </details>

    </main>
  );
}

export default definePluginApp((app) => {
  app.slots.settingsSection({
    id: "steel-agent-status",
    title: "Browser agent",
    component: SteelAgentSettings,
  });
  app.slots.threadPanelAction({
    id: THREAD_PANEL_ACTION_ID,
    title: "Steel Browser",
    icon: "Monitor",
    component: SteelThreadPanel,
    layout: "flush",
  });
  app.slots.messageDirective({
    id: "steel-browser",
    component: SteelBrowserDirective,
  });
  app.slots.navPanel({
    id: "steel-browser",
    title: "Steel Browser",
    icon: "Monitor",
    path: "steel-browser",
    component: SteelBrowserPage,
  });
});
