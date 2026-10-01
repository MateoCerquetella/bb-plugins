import "./app.css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { definePluginApp, ThreadChat, experimental_Icon as Icon, useRpc, useBbNavigate, useRealtime, useRealtimeConnectionState } from "@get-bb/plugin-sdk/app";
import { browserTargetSchema, snapshotSchema, type rpcContract, type Snapshot } from "./contract";
import { readState, writeState, type CanvasState } from "./lib_state";
import { connectedThreads, freeBox, edgePath, browserNodeId, workspaceLayout, type Box } from "./graph";
import { uiMessageSchema } from "./control";
import { useCanvasNavigation } from "./navigation";

type Pane = Snapshot["threads"][number];
const labels = { working: "Working", waiting: "Needs you", failed: "Failed", completed: "Done", idle: "Idle" };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
// Keep scroll-based native chat intact while allowing signed world coordinates.
const ORIGIN = 120000;

export function Canvas() {
  const rpc = useRpc<typeof rpcContract>();
  const connection = useRealtimeConnectionState();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const pending = useRef(false);
  const refreshAgain = useRef(false);
  const refresh = useCallback(async () => {
    if (pending.current) { refreshAgain.current = true; return; }
    pending.current = true;
    try {
      do {
        refreshAgain.current = false;
        setSnapshot(snapshotSchema.parse(await rpc.call("snapshot", null))); setError(false);
      } while (refreshAgain.current);
    }
    catch { setError(true); }
    finally { pending.current = false; }
  }, [rpc]);
  useRealtime("snapshot-changed", () => void refresh());
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(timer);
  }, [refresh, connection]);
  const projects = useMemo(() => Array.from(new Map(
    (snapshot?.threads ?? []).map((pane) => [pane.projectId, pane.project]),
  ), ([id, name]) => ({ id, name })), [snapshot]);
  const active = projects.find((project) => project.id === workspace);
  return <main className="ac-shell">
    <header className="ac-tabs">
      <nav aria-label="Project workspaces">
        <button className={!active ? "ac-active" : ""} aria-current={!active ? "page" : undefined} onClick={() => setWorkspace(null)}>All</button>
        {projects.map((project) => <button key={project.id} className={active?.id === project.id ? "ac-active" : ""}
          aria-current={active?.id === project.id ? "page" : undefined} onClick={() => setWorkspace(project.id)}>
          {project.name}
        </button>)}
      </nav>
      {snapshot?.browsersPartial && <span className="ac-coverage" role="status" title="Browser-tab coverage is partial. Some hosts or tabs are unavailable.">Partial browser coverage</span>}
      <button className="ac-icon" title="Refresh workspaces" aria-label="Refresh workspaces" onClick={() => void refresh()}><Icon name="RotateCcw" /></button>
    </header>
    {(error || connection !== "connected" || snapshot?.truncated) && <div className="ac-notice" role="status">
      {error ? "Refresh failed. Showing the last available snapshot." : connection !== "connected" ? "Reconnecting. Status may be delayed." : "Showing the latest 80 threads."}
    </div>}
    {snapshot ? <Workspace projectId={active?.id} setProjectId={setWorkspace}
      panes={snapshot.threads} browsers={snapshot.browsers} controlThreadId={snapshot.controlThreadId} />
      : <div className="ac-empty"><Icon name="Workflow" /><h2>{snapshot ? "No active workspaces" : error ? "Workspaces unavailable" : "Loading workspaces..."}</h2></div>}
  </main>;
}

function Workspace({ projectId, setProjectId, panes, browsers, controlThreadId }: {
  projectId?: string; setProjectId: (id: string | null) => void; panes: Pane[];
  browsers: Snapshot["browsers"]; controlThreadId: string | null;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [layout, setLayout] = useState<CanvasState>(() => readState("global"));
  const [environment, setEnvironment] = useState("");
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "resize"; sx: number; sy: number; x: number; y: number; w: number; h: number } | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomTo = useCanvasNavigation(canvasRef, zoom, setZoom);
  const clientId = useRef(`canvas-${crypto.randomUUID()}`);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const spaceHeld = useRef(false);
  const currentZoom = useRef(zoom);
  currentZoom.current = zoom;
  useLayoutEffect(() => {
    const narrow = window.matchMedia("(max-width: 900px)");
    const position = () => canvasRef.current?.scrollTo(narrow.matches ? 0 : ORIGIN * currentZoom.current, narrow.matches ? 0 : ORIGIN * currentZoom.current);
    position();
    narrow.addEventListener("change", position);
    return () => narrow.removeEventListener("change", position);
  }, []);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || (event.target as HTMLElement)?.closest("input,textarea,select,button,[contenteditable=true]")) return;
      if (!canvasRef.current?.contains(event.target as Node)) return;
      event.preventDefault(); spaceHeld.current = true;
    };
    const up = () => { spaceHeld.current = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", up);
    };
  }, []);
  const projectPanes = panes.filter((pane) => !projectId || pane.projectId === projectId);
  const environments = Array.from(new Map(projectPanes.map((pane) => [pane.environmentId ?? "", pane.environment])));
  const visible = useMemo(() => connectedThreads(panes.filter((pane) =>
    (!projectId || pane.projectId === projectId) && (!environment || pane.environmentId === environment)), panes), [panes, projectId, environment]);
  const visibleIds = new Set(visible.map((pane) => pane.id));
  const visibleBrowsers = browsers.filter((browser) => visibleIds.has(browser.threadId));
  const spatial = useMemo(() => workspaceLayout(panes, browsers), [panes, browsers]);
  const groups = spatial.groups.filter((group) => group.threadIds.some((id) => visibleIds.has(id)));
  const saveBox = useCallback((id: string, box: Box) => {
    const group = spatial.groups.find((item) => item.nodeIds.includes(id));
    if (!group) return;
    const bounded = freeBox({ ...box, x: box.x - group.x, y: box.y - group.y });
    setLayout((current) => ({ ...current, panes: { ...current.panes, [id]: bounded } }));
  }, [spatial]);
  useEffect(() => {
    const timer = setTimeout(() => writeState("global", layout), 250);
    return () => clearTimeout(timer);
  }, [layout]);
  const previousProject = useRef(projectId);
  useEffect(() => {
    if (previousProject.current !== projectId) {
      // Cross-project UI commands explicitly switch to All before selecting a worktree.
      if (projectId) setEnvironment("");
      previousProject.current = projectId;
    }
  }, [projectId]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!drag) {
        if (pan.current && canvasRef.current) {
          canvasRef.current.scrollLeft = pan.current.left - (event.clientX - pan.current.x);
          canvasRef.current.scrollTop = pan.current.top - (event.clientY - pan.current.y);
        }
        return;
      }
      const dx = (event.clientX - drag.sx) / zoom, dy = (event.clientY - drag.sy) / zoom;
      saveBox(drag.id, {
        x: drag.mode === "move" ? drag.x + dx : drag.x,
        y: drag.mode === "move" ? drag.y + dy : drag.y,
        w: clamp(drag.mode === "resize" ? drag.w + dx : drag.w, 320, 900),
        h: clamp(drag.mode === "resize" ? drag.h + dy : drag.h, 260, 900),
      });
    };
    const up = () => { setDrag(null); pan.current = null; setPanning(false); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, [drag, zoom, saveBox]);
  useEffect(() => {
    const publish = () => void rpc.call("presence", {
      clientId: clientId.current, workspaceId: projectId ?? null, zoom,
      focusedThreadId: selected, visible: document.visibilityState === "visible" && document.hasFocus(),
    }).catch(() => {});
    const initial = setTimeout(publish, 150);
    const timer = setInterval(publish, 10_000);
    document.addEventListener("visibilitychange", publish);
    window.addEventListener("focus", publish);
    window.addEventListener("blur", publish);
    return () => {
      clearTimeout(initial); clearInterval(timer); document.removeEventListener("visibilitychange", publish);
      window.removeEventListener("focus", publish); window.removeEventListener("blur", publish);
    };
  }, [projectId, rpc, selected, zoom]);
  useEffect(() => () => {
    void rpc.call("presence", { clientId: clientId.current, workspaceId: null, zoom: 1, focusedThreadId: null, visible: false }).catch(() => {});
  }, [rpc]);
  function geometry(pane: Pick<Pane, "id">, _index = 0): Box {
    const stored = layout.panes[pane.id];
    const group = spatial.groups.find((item) => item.nodeIds.includes(pane.id));
    if (stored && group) return { ...stored, x: stored.x + group.x, y: stored.y + group.y };
    return spatial.nodes.get(pane.id) ?? { x: 32, y: 32, w: 536, h: 420 };
  }
  function browserGeometry(browser: Snapshot["browsers"][number]): Box {
    return geometry({ id: browserNodeId(browser) });
  }
  function begin(event: ReactPointerEvent, pane: Pick<Pane, "id">, mode: "move" | "resize", box = geometry(pane)) {
    if (event.button !== 0 || window.matchMedia("(max-width: 900px)").matches) return;
    event.preventDefault(); event.stopPropagation();
    setSelected(pane.id); setDrag({ id: pane.id, mode, sx: event.clientX, sy: event.clientY, ...box });
  }
  function beginPan(event: ReactPointerEvent) {
    if (![0, 1].includes(event.button) || window.matchMedia("(max-width: 900px)").matches) return;
    const anywhere = event.button === 1 || spaceHeld.current || panMode;
    if (!anywhere && (event.target as HTMLElement).closest(".ac-pane,button,select,a")) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault(); event.stopPropagation();
    canvas.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    pan.current = { x: event.clientX, y: event.clientY, left: canvas.scrollLeft, top: canvas.scrollTop };
    setPanning(true);
  }
  const boxes = [...visible.map((pane) => geometry(pane)), ...visibleBrowsers.map(browserGeometry)];
  const width = Math.max(1200, ...boxes.map((box) => box.x + box.w + 160), ...spatial.groups.map((group) => group.x + group.w + 48));
  const height = Math.max(900, ...boxes.map((box) => box.y + box.h + 160), ...spatial.groups.map((group) => group.y + group.h + 48));
  const content = [...groups, ...boxes];
  const left = Math.min(0, ...content.map((box) => box.x - 24));
  const top = Math.min(0, ...content.map((box) => box.y - 24));
  function fit() {
    const viewport = canvasRef.current;
    if (viewport) {
      const right = Math.max(1200, ...content.map((box) => box.x + box.w + 24));
      const bottom = Math.max(900, ...content.map((box) => box.y + box.h + 24));
      const next = clamp(Math.min(viewport.clientWidth / (right - left), viewport.clientHeight / (bottom - top)), .1, 1);
      zoomTo(next, false);
      requestAnimationFrame(() => viewport.scrollTo((ORIGIN + left) * next, (ORIGIN + top) * next));
    }
  }
  function focusThread(id: string) {
    const pane = visible.find((item) => item.id === id);
    if (!pane || !canvasRef.current) return false;
    const box = geometry(pane);
    setSelected(id);
    canvasRef.current.scrollTo({
      left: (ORIGIN + box.x) * zoom - canvasRef.current.clientWidth / 2 + box.w * zoom / 2,
      top: (ORIGIN + box.y) * zoom - canvasRef.current.clientHeight / 2 + box.h * zoom / 2,
      behavior: "smooth",
    });
    return true;
  }
  useEffect(() => {
    if (pendingFocus && focusThread(pendingFocus)) setPendingFocus(null);
  });
  useRealtime("ui-command", (raw) => {
    const parsed = uiMessageSchema.safeParse(raw);
    if (!parsed.success || parsed.data.clientId !== clientId.current || parsed.data.controlThreadId !== controlThreadId) return;
    const { requestId, command } = parsed.data;
    let applied = true, detail = "Canvas updated.";
    if (command.action === "fit") fit();
    else if (command.action === "reorganize") { setLayout((current) => ({ ...current, panes: {} })); setZoom(1); }
    else if (command.action === "zoom") zoomTo(command.value);
    else if (command.action === "focus") {
      applied = panes.some((pane) => pane.id === command.threadId);
      if (applied) { setProjectId(null); setEnvironment(""); zoomTo(1, false); setPendingFocus(command.threadId); }
      detail = applied ? "Navigating to the requested thread." : "The requested thread is outside the current bounded snapshot.";
    } else if (command.action === "workspace") {
      const group = spatial.groups.find((item) => item.id === command.workspaceId);
      const exists = command.workspaceId === null || Boolean(group);
      applied = exists;
      if (exists) {
        setProjectId(group?.id ?? null);
        setEnvironment("");
        if (group) setPendingFocus(group.threadIds[0]);
      }
      detail = exists ? "Selected the requested workspace." : "The requested workspace is unavailable.";
    }
    void rpc.call("acknowledge", { clientId: clientId.current, requestId, applied, detail }).catch(() => {});
  });
  return <>
    <div className="ac-toolbar">
      <label>Worktree<select aria-label="Worktree" value={environment} onChange={(event) => { setEnvironment(event.target.value); setSelected(null); }}>
        <option value="">All worktrees</option>
        {environments.filter(([id]) => id).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      <span className="ac-count">{visible.length} agents · {visibleBrowsers.length} browser tabs</span>
      <div className="ac-spacer" />
    </div>
    <div className="ac-layout ac-dock-closed">
      <section className="ac-canvas-wrap" aria-label="Worktree threads">
        <div className={`ac-canvas ${panning ? "ac-panning" : ""} ${panMode ? "ac-pan-mode" : ""}`} ref={canvasRef} onPointerDownCapture={beginPan} tabIndex={0} aria-label="Scrollable agent canvas"
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomTo(zoom + .1); }
            if (event.key === "-") { event.preventDefault(); zoomTo(zoom - .1); }
            if (event.key === "0") { event.preventDefault(); fit(); }
            const moves: Record<string, [number, number]> = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80] };
            const delta = moves[event.key];
            if (delta) { event.preventDefault(); event.currentTarget.scrollBy(...delta); }
          }}>
          <div style={{ width: (ORIGIN * 2 + width) * zoom, height: (ORIGIN * 2 + height) * zoom }} className="ac-scroll-area">
            <div className="ac-world" style={{ width, height, left: ORIGIN * zoom, top: ORIGIN * zoom, transform: `scale(${zoom})` }}>
              {groups.map((group) => <section className="ac-workspace-group" key={group.id}
                style={{ left: group.x, top: group.y, width: group.w, height: group.h, "--workspace-color": group.color } as CSSProperties}>
                <header><span className="ac-workspace-swatch" /> <strong>{group.title}</strong><span>{group.project} · {group.threadIds.length} {group.threadIds.length === 1 ? "agent" : "agents"}</span>
                  <button className="ac-icon" title={`Focus ${group.title}`} aria-label={`Focus workspace ${group.title}`}
                    onClick={() => { zoomTo(1, false); setPendingFocus(group.threadIds[0]); }}><Icon name="Maximize2" /></button>
                </header>
              </section>)}
              <svg className="ac-links" width={width} height={height} aria-hidden="true">
                {visible.map((pane) => {
                  const parent = visible.find((candidate) => candidate.id === pane.parentThreadId);
                  return parent ? <path key={pane.id} d={edgePath(geometry(parent), geometry(pane))} /> : null;
                })}
                {visibleBrowsers.map((browser) => <path className="ac-browser-link" key={browserNodeId(browser)}
                  d={edgePath(geometry({ id: browser.threadId }), browserGeometry(browser))} />)}
              </svg>
              {visible.map((pane, index) => {
                const box = geometry(pane, index);
                return <article key={pane.id} className={`ac-pane ${selected === pane.id ? "ac-selected" : ""}`}
                  style={{ left: box.x, top: box.y, width: box.w, height: box.h }} onFocus={() => setSelected(pane.id)} onClick={() => setSelected(pane.id)}>
                  <header className="ac-pane-head" onDoubleClick={() => { zoomTo(1, false); setPendingFocus(pane.id); }} onPointerDown={(event) => {
                    if (!(event.target as HTMLElement).closest("button")) begin(event, pane, "move");
                  }}>
                    <button className="ac-icon ac-grip" title="Move pane" aria-label={`Move ${pane.title}`}
                      onPointerDown={(event) => begin(event, pane, "move")} onKeyDown={(event) => {
                        const shifts: Record<string, [number, number]> = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] };
                        const shift = shifts[event.key]; if (!shift) return;
                        event.preventDefault();
                        saveBox(pane.id, { ...box, x: box.x + shift[0], y: box.y + shift[1] });
                      }}><Icon name="DragDropVertical" /></button>
                    <strong title={pane.title}>{pane.title}</strong>
                    <span className={`ac-status ac-${pane.state}`}>{labels[pane.state]}</span>
                  </header>
                  <div className="ac-context"><span title={pane.environment}>{pane.environment}</span><span title={pane.branch}>{pane.branch}</span><span>{pane.parentThreadId ? "Child agent" : pane.provider}</span></div>
                  <LiveTimeline threadId={pane.id} />
                  <button className="ac-resize" title="Resize pane" aria-label={`Resize ${pane.title}`}
                    onPointerDown={(event) => begin(event, pane, "resize")} onKeyDown={(event) => {
                      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                      event.preventDefault();
                      saveBox(pane.id, { ...box,
                        w: clamp(box.w + (event.key === "ArrowRight" ? 24 : event.key === "ArrowLeft" ? -24 : 0), 320, 900),
                        h: clamp(box.h + (event.key === "ArrowDown" ? 24 : event.key === "ArrowUp" ? -24 : 0), 260, 900),
                      });
                    }}><Icon name="Resize" /></button>
                </article>;
              })}
              {visibleBrowsers.map((browser) => {
                const id = browserNodeId(browser), box = browserGeometry(browser);
                return <article className={`ac-pane ac-browser ${selected === id ? "ac-selected" : ""}`} key={id}
                  style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
                  <header className="ac-pane-head" onPointerDown={(event) => { if (!(event.target as HTMLElement).closest("button")) begin(event, { id }, "move", box); }}>
                    <button className="ac-icon ac-grip" title="Move browser" aria-label={`Move browser ${browser.title}`} onPointerDown={(event) => begin(event, { id }, "move", box)}
                      onKeyDown={(event) => {
                        const shifts: Record<string, [number, number]> = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] };
                        const shift = shifts[event.key]; if (!shift) return; event.preventDefault();
                        saveBox(id, { ...box, x: box.x + shift[0], y: box.y + shift[1] });
                      }}><Icon name="DragDropVertical" /></button>
                    <strong>{browser.title}</strong><span className="ac-status">Browser tab</span>
                  </header>
                  <div className="ac-browser-body"><BrowserPreview browser={browser} /><strong>{browser.location}</strong>
                    <span>{panes.find((pane) => pane.id === browser.threadId)?.title}</span>
                    <button className="ac-command" onClick={() => navigate.toThread(browser.threadId)}>Open owning thread</button>
                  </div>
                  <button className="ac-resize" title="Resize browser" aria-label={`Resize browser ${browser.title}`} onPointerDown={(event) => begin(event, { id }, "resize", box)}
                    onKeyDown={(event) => {
                      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault();
                      saveBox(id, { ...box,
                        w: clamp(box.w + (event.key === "ArrowRight" ? 24 : event.key === "ArrowLeft" ? -24 : 0), 320, 900),
                        h: clamp(box.h + (event.key === "ArrowDown" ? 24 : event.key === "ArrowUp" ? -24 : 0), 260, 900),
                      });
                    }}><Icon name="Resize" /></button>
                </article>;
              })}
              {!visible.length && <div className="ac-empty"><h2>No threads in this worktree</h2></div>}
            </div>
          </div>
        </div>
        <div className="ac-minimap" aria-label="Workspace overview">
          <svg viewBox={`${left} ${top} ${width - left} ${height - top}`} role="img" aria-label="Workspace map">
            {groups.map((group) => <rect key={group.id} x={group.x} y={group.y} width={group.w} height={group.h}
              fill={group.color} fillOpacity=".25" stroke={group.color} strokeWidth="8">
              <title>{group.title}</title>
            </rect>)}
            {boxes.map((box, index) => <rect key={index} x={box.x} y={box.y} width={box.w} height={box.h}
              fill="currentColor" fillOpacity=".35" />)}
          </svg>
          <button className="ac-icon" title="Fit all visible workspaces" aria-label="Fit workspace overview" onClick={fit}><Icon name="Maximize2" /></button>
        </div>
        <div className="ac-tools">
          <button className="ac-icon" title="Pan canvas (Space-drag or middle-drag)" aria-label="Pan canvas" aria-pressed={panMode}
            onClick={() => setPanMode((value) => !value)}><Icon name="DragDropVertical" /></button>
          <button className="ac-icon" title="Zoom out (Ctrl + wheel or pinch)" aria-label="Zoom out" onClick={() => zoomTo(zoom - .1)}><Icon name="Minus" /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="ac-icon" title="Zoom in (Ctrl + wheel or pinch)" aria-label="Zoom in" onClick={() => zoomTo(zoom + .1)}><Icon name="Plus" /></button>
          <button className="ac-icon" title="Fit canvas" aria-label="Fit canvas" onClick={fit}><Icon name="Maximize2" /></button>
          <button className="ac-icon" title="Reset zoom to 100%" aria-label="Reset zoom" onClick={() => zoomTo(1)}><Icon name="RotateCcw" /></button>
          <button className="ac-icon" title="Reorganize panes" aria-label="Reorganize panes" onClick={() => { setLayout((current) => ({ ...current, panes: {} })); setZoom(1); }}><Icon name="GridView" /></button>
        </div>
      </section>
    </div>
  </>;
}

function LiveTimeline({ threadId }: { threadId: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "160px" });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  return <div className="ac-chat ac-live-timeline" ref={root}>
    {visible && <ThreadChat threadId={threadId} variant="timeline" layout="contained" permissionPolicy="inherit" className="ac-chat" />}
  </div>;
}

function BrowserPreview({ browser }: { browser: Snapshot["browsers"][number] }) {
  const rpc = useRpc<typeof rpcContract>();
  const [image, setImage] = useState<{ src: string; key: string; at: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [live, setLive] = useState(true);
  const pending = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const targetKey = JSON.stringify(browser.target);
  const target = useMemo(() => targetKey === "null" ? null : browserTargetSchema.parse(JSON.parse(targetKey)), [targetKey]);
  const capture = useCallback(async () => {
    if (!target || pending.current) return;
    pending.current = true; setBusy(true); setFailed(false);
    try {
      const result = await rpc.call("captureBrowser", target);
      setImage({ src: `data:${result.mimeType};base64,${result.base64}`, key: targetKey, at: Date.now() });
    } catch { setFailed(true); }
    finally { pending.current = false; setBusy(false); }
  }, [rpc, target, targetKey]);
  useEffect(() => { setImage(null); setFailed(false); }, [targetKey]);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "120px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!target || !visible || !live) return;
    if (document.visibilityState === "visible") void capture();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void capture(); }, 3_000);
    return () => clearInterval(timer);
  }, [capture, target, visible, live]);
  const currentImage = image?.key === targetKey ? image : null;
  return <div className="ac-browser-preview" ref={root}>
    {currentImage ? <img className="ac-browser-image" src={currentImage.src} alt={`Captured browser tab: ${browser.title}`} /> : <div className="ac-browser-placeholder"><Icon name="Globe" /></div>}
    {target ? <div className="ac-preview-controls">
      <label title="Refresh visible captures every three seconds"><input type="checkbox" checked={live} onChange={(event) => setLive(event.target.checked)} />Live capture</label>
      <span>{failed ? "Unavailable" : currentImage ? new Date(currentImage.at).toLocaleTimeString() : "Connecting"}</span>
      <button className="ac-icon" title="Refresh capture" aria-label="Refresh browser capture" disabled={busy} onClick={() => void capture()}><Icon name="RotateCcw" /></button>
    </div> : <span>Saved tab · live capture unavailable</span>}
    {failed && <span role="alert">Capture unavailable. Last image may be stale.</span>}
  </div>;
}

export default definePluginApp((app) => {
  app.slots.navPanel({ id: "canvas", title: "Agent Canvas", icon: "Workflow", path: "canvas", component: Canvas });
});
