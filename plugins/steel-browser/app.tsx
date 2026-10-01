import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ExternalLink,
  PanelsTopLeft,
  Plus,
  RefreshCw,
  Square,
  Play,
  Monitor,
  LayoutGrid,
  List,
  LogIn,
  Maximize2,
  Minimize2,
  Check,
  X,
} from "lucide-react";
import {
  definePluginApp,
  useRpc,
  useSettings,
  useBbContext,
  type PluginMessageDirectiveProps,
  type PluginThreadPanelProps,
} from "@get-bb/plugin-sdk/app";
import type { BrowserSession, Dashboard, Scope, ProjectState, EnginePolicy, rpcContract } from "./contract.ts";
import "./app.css";

const CREATE_OPTIONS = { blockAds: true, width: 1440, height: 900 } as const;
const THREAD_PANEL_ACTION_ID = "steel-live-browser";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function useSteelDashboard(scope: Scope) {
  const rpc = useRpc<typeof rpcContract>();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!scope.threadId && !scope.projectId) {
      setDashboard(null);
      setError("No project selected.");
      return;
    }
    setError(null);
    try {
      setDashboard(await rpc.call("dashboard", scope));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [rpc, scope]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { dashboard, error, refresh };
}

function SteelThreadPanel({ threadId }: PluginThreadPanelProps) {
  return <ScopedSteelThreadPanel key={threadId} threadId={threadId} />;
}

function ScopedSteelThreadPanel({ threadId }: { threadId: string }) {
  const scope = useScope(threadId);
  const { dashboard, error, refresh } = useSteelDashboard(scope);
  const [playerKey, setPlayerKey] = useState(0);
  const playerUrl = dashboard
    ? new URL("v1/sessions/debug", dashboard.uiUrl.replace(/ui\/?$/, "")).toString()
    : null;
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
      {error || dashboard?.error ? (
        <div className="steel-panel-state" role="alert">{error ?? dashboard?.error}</div>
      ) : playerUrl && active ? (
        <iframe key={playerKey} src={playerUrl} title={`Steel browser for ${threadId}`}
          allow="clipboard-read; clipboard-write" />
      ) : (
        <div className="steel-panel-state">
          <Monitor aria-hidden="true" />
          <strong>{dashboard ? "Start a browser session" : "Loading browser..."}</strong>
        </div>
      )}
    </section>
  );
}

export function SteelBrowserDirective(props: PluginMessageDirectiveProps) {
  return <ScopedSteelBrowser key={props.message.threadId} {...props} />;
}

function ScopedSteelBrowser({ message }: PluginMessageDirectiveProps) {
  const scope = useScope(message.threadId);
  const { dashboard, error, refresh } = useSteelDashboard(scope);
  const [playerKey, setPlayerKey] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const playerUrl = dashboard
    ? new URL("v1/sessions/debug", dashboard.uiUrl.replace(/ui\/?$/, "")).toString()
    : null;
  const active = dashboard?.sessions.some(session => ["idle", "live"].includes(session.status));

  return (
    <section
      className={`steel-inline-browser${minimized ? " steel-inline-browser--minimized" : ""}`}
      aria-label="Steel browser in this thread"
    >
      <header>
        <div>
          <Monitor aria-hidden="true" />
          <span>
            <strong>Steel Browser</strong>
            <small>{error ? "Unavailable" : signingIn ? "Sign-in opened in a new tab" : active ? "Session available" : dashboard?.connected ? "No active session" : "Connecting"}</small>
          </span>
        </div>
        <div className="steel-inline-browser__actions">
          {playerUrl && (
            <a href={playerUrl} target="_blank" rel="noopener noreferrer"
              aria-label="Sign in to BB Connect in a new tab"
              title="Sign in to BB Connect in a new tab"
              onClick={() => setSigningIn(true)}>
              <LogIn aria-hidden="true" />
            </a>
          )}
          {signingIn && (
            <button type="button" aria-label="Done signing in" title="Done signing in"
              onClick={() => {
                setSigningIn(false);
                void refresh();
                setPlayerKey(key => key + 1);
              }}>
              <Check aria-hidden="true" />
            </button>
          )}
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
        {error || dashboard?.error ? (
          <div className="steel-panel-state" role="alert">{error ?? dashboard?.error}</div>
        ) : playerUrl && active ? (
          <iframe key={playerKey} src={playerUrl}
            title={`Steel browser for ${message.threadId}`}
            allow="clipboard-read; clipboard-write" />
        ) : (
          <div className="steel-panel-state">
            <Monitor aria-hidden="true" />
            <strong>{dashboard ? "Start a browser session" : "Loading browser..."}</strong>
          </div>
        )}
      </div>
    </section>
  );
}

function ProjectControls({ scope }: { scope: Scope }) {
  if (!scope.threadId && !scope.projectId) {
    return <p role="status">No project selected. Project engine settings are available from a project context.</p>;
  }
  return <ScopedProjectControls key={JSON.stringify(scope)} scope={scope} />;
}

function ScopedProjectControls({ scope }: { scope: Scope }) {
  const rpc = useRpc<typeof rpcContract>();
  const { values } = useSettings();
  const [project, setProject] = useState<ProjectState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    setProject(null);
    void rpc.call("project", scope).then(value => { if (current) setProject(value); })
      .catch(cause => { if (current) setError(errorMessage(cause)); });
    return () => { current = false; };
  }, [rpc, scope]);
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
        <dt>Checkout</dt><dd>{isLoading ? "Loading..." : String(values?.jevCheckout || "Not configured")}</dd>
        <dt>Credentials file</dt><dd>{isLoading ? "Loading..." : String(values?.jevEnvFile || "Not configured")}</dd>
        <dt>Text model</dt><dd>{isLoading ? "Loading..." : String(values?.jevTextModel || "Not configured")}</dd>
      </dl>
      <p>Configuration: BB Tools / Steel Browser. Credentials stay on the host.
        Live Jev runs use potentially billable TypeSafe and text-model APIs.</p>
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

export function SteelBrowserPage() {
  const scope = useScope();
  if (!scope.threadId && !scope.projectId) {
    return (
      <main className="steel-page">
        <header className="steel-header">
          <div className="steel-identity">
            <span className="steel-brand" aria-hidden="true"><PanelsTopLeft /></span>
            <h1>Steel Browser</h1>
          </div>
        </header>
        <SteelAgentSettings />
      </main>
    );
  }
  return <ScopedSteelBrowserPage key={JSON.stringify(scope)} scope={scope} />;
}

function ScopedSteelBrowserPage({ scope }: { scope: Scope }) {
  const rpc = useRpc<typeof rpcContract>();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState<"refresh" | "create" | string | null>("refresh");
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const [watching, setWatching] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [loginOpen, setLoginOpen] = useState(false);
  const loginDialog = useRef<HTMLDialogElement>(null);
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (loginOpen) loginDialog.current?.showModal();
    else loginDialog.current?.close();
  }, [loginOpen]);

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
      if (mounted.current) setDashboard(await rpc.call("dashboard", scope));
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
      if (mounted.current) setDashboard(await rpc.call("dashboard", scope));
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
  const playerUrl = dashboard ? new URL("v1/sessions/debug", dashboard.uiUrl.replace(/ui\/?$/, "")).toString() : null;

  return (
    <main className="steel-page" ref={pageRef}>
      <header className="steel-header">
        <div className="steel-identity">
          <span className="steel-brand" aria-hidden="true"><PanelsTopLeft /></span>
          <div>
            <h1>Steel Browser</h1>
            <p>Browser workspace</p>
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
            disabled={!connected || busy !== null || !!activeSession}
            onClick={() => void createSession()}
            type="button"
          >
            <Plus aria-hidden="true" />
            {busy === "create" ? "Creating..." : "New session"}
          </button>
        </div>
      </header>

      <ProjectControls scope={scope} />
      <div className="steel-status">
        <span className={`steel-dot ${connected ? "steel-dot--ok" : "steel-dot--down"}`} />
        <span className={connected ? "steel-connected" : "steel-disconnected"}>
          {error ? "Unavailable" : dashboard === null ? "Connecting" : connected ? "Connected" : "Unavailable"}
        </span>
        <span className="steel-divider">/</span>
        <code>{endpoint}</code>
      </div>

      {(error ?? dashboard?.error) !== null ? (
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
            <button className="steel-secondary" disabled={!playerUrl || !activeSession}
              onClick={() => setLoginOpen(true)} type="button">
              <LogIn aria-hidden="true" /> Sign in / Take control
            </button>
          </div>
        </div>
        <div className="steel-viewport">
          {watching && connected && activeSession && playerUrl ? (
            <iframe key={playerKey} src={playerUrl} title="Live Steel browser" allow="clipboard-write" />
          ) : (
            <div className="steel-viewer-empty">
              <Monitor aria-hidden="true" />
              <strong>{activeSession ? "Browser ready" : "No active browser"}</strong>
              <button className="steel-primary" disabled={!connected || busy !== null}
                onClick={() => activeSession ? setWatching(true) : void createSession().then(() => setWatching(true))}
                type="button">
                <Play aria-hidden="true" />{activeSession ? "Watch browser" : "Start browser"}
              </button>
            </div>
          )}
        </div>
        {watching && <p className="steel-viewer-note">
          Need to authenticate a website? Use <strong>Sign in / Take control</strong>, complete login in the
          browser window, then reload this viewer.
        </p>}
      </section>

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
            <strong>{connected ? "No active sessions" : "Steel is not connected"}</strong>
            <span>{connected ? "Start a browser when an agent needs one." : "Check the service and endpoint setting."}</span>
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
        <div className="steel-links">
          <a href={dashboard?.uiUrl} rel="noreferrer" target="_blank">
            <ExternalLink aria-hidden="true" />Steel UI
          </a>
          <a href={dashboard?.docsUrl} rel="noreferrer" target="_blank">
            <BookOpen aria-hidden="true" />API documentation
          </a>
        </div>
      </details>

      <dialog ref={loginDialog} onClose={() => setLoginOpen(false)}
        aria-labelledby="steel-login-title" className="steel-modal">
            <div className="steel-modal-header">
              <div>
                <h2 id="steel-login-title">Sign in to this browser</h2>
                <p>Complete the website login, then select Done.</p>
              </div>
              <button aria-label="Close sign-in dialog" className="steel-icon-button"
                onClick={() => setLoginOpen(false)} title="Close" type="button">
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="steel-modal-notice">
              <LogIn aria-hidden="true" />
              <span>Enter credentials directly on the website, not in BB chat.</span>
            </div>
            {loginOpen && playerUrl && (
              <iframe className="steel-login-viewer" src={playerUrl}
                title="Sign in to the live Steel browser" allow="clipboard-write" />
            )}
            <div className="steel-modal-actions">
              <button onClick={() => setLoginOpen(false)} type="button">Cancel</button>
              <a className="steel-primary steel-modal-link" href={playerUrl ?? undefined} rel="noreferrer" target="_blank">
                <ExternalLink aria-hidden="true" /> Sign in in a new tab
              </a>
              <button type="button" onClick={() => {
                setWatching(true);
                setPlayerKey(key => key + 1);
                setLoginOpen(false);
              }}>Done</button>
            </div>
      </dialog>
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
