import "./app.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { definePluginApp, ThreadChat, experimental_Icon as Icon, useRpc, useSdk, useRealtimeConnectionState, experimental_NewThreadComposer as NewThreadComposer } from "@get-bb/plugin-sdk/app";
import type { NewThreadRequest } from "@get-bb/plugin-sdk";
import type { Snapshot } from "./contract";
import { defaults, readState, writeState, type CanvasState } from "./lib_state";

type Pane = Snapshot["threads"][number];
const labels = { working: "working", waiting: "needs you", failed: "failed", completed: "done", idle: "idle" };
export function Canvas() {
  const rpc = useRpc<any>(); const sdk = useSdk(); const connection = useRealtimeConnectionState();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [layout, setLayout] = useState<CanvasState>(() => readState());
  const [coordinator, setCoordinator] = useState<string | null>(() => readState().coordinator);
  const [showComposer, setShowComposer] = useState(false); const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null); const [drag, setDrag] = useState<{ id: string; mode: "move" | "resize"; sx: number; sy: number; x: number; y: number; w: number; h: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => { try { setSnapshot(await rpc.call("snapshot")); } catch { /* stale snapshot remains visible */ } }, [rpc]);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 10_000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { writeState({ ...layout, coordinator }); }, [layout, coordinator]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!drag) return;
      const dx = (event.clientX - drag.sx) / zoom, dy = (event.clientY - drag.sy) / zoom;
      setLayout((current) => ({ ...current, panes: { ...current.panes, [drag.id]: {
        x: Math.max(0, drag.mode === "move" ? drag.x + dx : drag.x), y: Math.max(0, drag.mode === "move" ? drag.y + dy : drag.y),
        w: Math.max(320, Math.min(900, drag.mode === "resize" ? drag.w + dx : drag.w)),
        h: Math.max(260, Math.min(900, drag.mode === "resize" ? drag.h + dy : drag.h)),
      } } }));
    };
    const up = () => setDrag(null); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag, zoom]);
  const panes = useMemo(() => snapshot?.threads || [], [snapshot]);
  const coordinatorPane = panes.find((pane) => pane.id === coordinator);
  function geometry(pane: Pane, index: number) { return layout.panes[pane.id] || { x: 80 + (index % 2) * 530, y: 80 + Math.floor(index / 2) * 470, w: 500, h: 410 }; }
  function begin(event: React.PointerEvent, pane: Pane, mode: "move" | "resize") {
    const box = geometry(pane, panes.indexOf(pane)); setSelected(pane.id); setDrag({ id: pane.id, mode, sx: event.clientX, sy: event.clientY, ...box });
  }
  async function createCoordinator(request: NewThreadRequest) { const thread = await sdk.threads.spawn(request); setCoordinator(thread.id); setShowComposer(false); void refresh(); }
  return <main className="ac-shell">
    <header className="ac-tabs"><div className="ac-tab ac-active"><span className="ac-dot" />agent-canvas</div><button className="ac-add" aria-label="Add workspace" title="Add workspace"><Icon name="Plus" /></button><div className="ac-spacer" /><button className="ac-top-icon" aria-label="Toggle Coordinator" onClick={() => setShowComposer(false)}><Icon name="PanelRight" /></button></header>
    <div className="ac-layout">
      <section className="ac-canvas-wrap">
        <div className="ac-canvas" ref={canvasRef} style={{ "--zoom": zoom } as unknown as Record<string, string | number>}>
          <div className="ac-grid" />
          <div className="ac-canvas-label"><span>{snapshot ? `${panes.length} panes` : "Loading panes"}</span><span className={connection === "connected" ? "ac-live" : "ac-warn"}>{connection === "connected" ? "live" : "reconnecting"}</span></div>
          {!panes.length && <div className="ac-empty"><Icon name="Workflow" /><h2>No live panes yet</h2><p>Threads you can access will appear here.</p></div>}
          {panes.map((pane, index) => { const box = geometry(pane, index); return <article key={pane.id} className={`ac-pane ${selected === pane.id ? "ac-selected" : ""}`} style={{ left: box.x, top: box.y, width: box.w, height: box.h }} onClick={() => setSelected(pane.id)}>
            <header className="ac-pane-head" onPointerDown={(event) => begin(event, pane, "move")}><div className="ac-pane-title"><span className="ac-sun">✳</span><strong title={pane.title}>{pane.title}</strong><span className="ac-role">agent</span><span className={`ac-status ac-${pane.state}`}>{labels[pane.state]}</span></div><div className="ac-pane-actions"><span>{pane.provider}</span><button className="ac-mini" aria-label={`Focus ${pane.title}`}><Icon name="Target" /></button></div></header>
            <div className="ac-context"><span>{pane.project} · {pane.environment}</span><span>{pane.branch}</span></div><ThreadChat threadId={pane.id} variant="full" layout="contained" permissionPolicy="inherit" className="ac-chat" />
            <button className="ac-resize" aria-label={`Resize ${pane.title}`} onPointerDown={(event) => { event.stopPropagation(); begin(event, pane, "resize"); }}><Icon name="Resize" /></button>
          </article>; })}
          <div className="ac-minimap" aria-label="Canvas minimap"><div className="ac-mini-map" />{panes.slice(0, 8).map((pane, i) => <span key={pane.id} style={{ left: `${12 + (i % 4) * 22}%`, top: `${18 + Math.floor(i / 4) * 28}%` }} />)}</div>
          <div className="ac-tools"><button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(.65, value - .1))}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.25, value + .1))}>+</button><button aria-label="Fit canvas" onClick={() => setZoom(1)}><Icon name="FitToScreen" /></button><button aria-label="Reorganize panes" onClick={() => setLayout((current) => ({ ...current, panes: {} }))}><Icon name="GridView" /></button></div>
        </div>
      </section>
      <aside className="ac-coordinator"><header className="ac-coord-head"><h1>Coordinator</h1><button aria-label="Choose Coordinator" title="Choose Coordinator" onClick={() => setShowComposer(true)}><Icon name="Plus" /></button><button aria-label="Coordinator history"><Icon name="History" /></button><button aria-label="Close Coordinator"><Icon name="X" /></button></header>
        {coordinatorPane ? <><div className="ac-coord-identity"><span className="ac-sun">✳</span><div><strong>{coordinatorPane.title}</strong><span>{coordinatorPane.provider} · {labels[coordinatorPane.state]}</span></div></div><ThreadChat threadId={coordinatorPane.id} variant="full" layout="contained" permissionPolicy="inherit" className="ac-coord-chat" /></> : showComposer ? <div className="ac-coord-compose"><p>Choose a thread to coordinate, or create one explicitly.</p><select aria-label="Existing coordinator" defaultValue="" onChange={(event) => { setCoordinator(event.target.value || null); setShowComposer(false); }}><option value="">Choose existing thread</option>{panes.map((pane) => <option key={pane.id} value={pane.id}>{pane.title}</option>)}</select><NewThreadComposer layout="document" draftKey="agent-canvas:coordinator" placeholder="Create a Coordinator thread..." onSubmit={createCoordinator} /></div> : <div className="ac-coord-empty"><Icon name="MessageSquare" /><h2>No Coordinator selected</h2><p>Select an existing thread or create one to keep coordination visible here.</p><button className="ac-primary" onClick={() => setShowComposer(true)}><Icon name="Plus" />Choose Coordinator</button></div>}
      </aside>
    </div>
  </main>;
}
export default definePluginApp((app) => { app.slots.navPanel({ id: "canvas", title: "Agent Canvas", icon: "Workflow", path: "canvas", component: Canvas }); });
