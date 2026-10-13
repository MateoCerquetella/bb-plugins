import {
  definePluginApp, useComposer, useBbNavigate,
  experimental_useSidebarThreads,
} from "@get-bb/plugin-sdk/app";
import { useEffect, useRef, useState } from "react";
import { navigationThreads, neighbor, projectBadge, titleFor, statusFor, statusIconFor, updateGesture, swipeDirection, type Gesture } from "./lib/navigation";
import { Icon } from "./components/icon";
import "./app.css";

function Navigator({ threadId }: { threadId: string }) {
  const state = experimental_useSidebarThreads();
  const navigate = useBbNavigate();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const cancelSecondary = (event: PointerEvent) => {
      if (!event.isPrimary) gesture.current = null;
    };
    document.addEventListener("pointerdown", cancelSecondary, true);
    return () => document.removeEventListener("pointerdown", cancelSecondary, true);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const threads = state.status === "ready" ? navigationThreads(state.threads, threadId) : [];
  const index = threads.findIndex(thread => thread.id === threadId);
  const previous = neighbor(threads, threadId, -1);
  const next = neighbor(threads, threadId, 1);
  const status = statusFor(threads[index]);
  const statusIcon = statusIconFor(threads[index]?.indicator);
  const project = state.status === "ready"
    ? state.projects.find(item => item.id === threads[index]?.projectId)
    : undefined;
  const badge = projectBadge(threads[index]?.projectId ?? "", project?.name);
  const label = state.status === "loading" ? "Loading threads"
    : state.status === "error" ? "Threads unavailable"
    : index < 0 ? "Thread unavailable" : titleFor(threads[index]);
  const move = (direction: -1 | 1) => {
    const target = neighbor(threads, threadId, direction);
    if (!target || pendingRef.current || state.status !== "ready") return;
    pendingRef.current = true;
    setPending(true);
    gesture.current = null;
    // A rejected host navigation must not leave the mounted strip locked.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { pendingRef.current = false; setPending(false); }, 1200);
    try { navigate.toThread(target); }
    catch { pendingRef.current = false; setPending(false); }
  };
  return <nav className="tg-nav" aria-label="Thread navigation" aria-busy={state.status === "loading" || pending}>
    <button className="tg-arrow" type="button" title="Previous thread" aria-label="Previous thread"
      disabled={!previous || pending} onClick={() => move(-1)}><Icon name="previous" className="tg-arrow-icon" /></button>
    <div className="tg-swipe" role="group" tabIndex={0} aria-label="Thread position; left and right arrows change thread"
      onKeyDown={event => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0 || pendingRef.current) { gesture.current = null; return; }
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, cancelled: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (gesture.current?.id === event.pointerId) gesture.current = updateGesture(gesture.current, event.clientX, event.clientY);
      }}
      onPointerUp={event => {
        const start = gesture.current; gesture.current = null;
        if (!start) return;
        const direction = swipeDirection(start, event.pointerId, event.clientX, event.clientY);
        if (direction !== null) move(direction);
      }}
      onPointerCancel={() => { gesture.current = null; }}
      onLostPointerCapture={() => { gesture.current = null; }}>
      <span className="tg-heading">
        {index >= 0 && <span className="tg-project" style={{ backgroundColor: badge.color, color: badge.foreground }}
          title={badge.name} aria-label={`Project: ${badge.name}`}>{badge.letter}</span>}
        <strong className="tg-title" title={label}>{label}</strong>
      </span>
      {state.status === "error"
        ? <button className="tg-retry" type="button" title="Reload BB to retry loading threads"
            onPointerDown={event => event.stopPropagation()}
            onKeyDown={event => event.stopPropagation()}
            onClick={() => window.location.reload()}>Reload</button>
        : <span className="tg-meta" aria-live="polite" aria-atomic="true">
            {index >= 0 ? <>
              <span className={`tg-status tg-status-${statusIcon}`} title={status}>
                <Icon name={statusIcon} className="tg-status-icon" />
                <span className="tg-status-text">{status}</span>
              </span>
              <span aria-hidden="true">{"\u00b7"}</span>
              <span className="tg-position">{`${index + 1} / ${threads.length}`}</span>
            </> : "\u00a0"}
          </span>}
    </div>
    <button className="tg-arrow" type="button" title="Next thread" aria-label="Next thread"
      disabled={!next || pending} onClick={() => move(1)}><Icon name="next" className="tg-arrow-icon" /></button>
  </nav>;
}

function ThreadGlide() {
  const { scope } = useComposer();
  return scope.kind === "thread" ? <Navigator key={scope.threadId} threadId={scope.threadId} /> : null;
}

export default definePluginApp(app => {
  app.composer.customize({
    id: "thread-mobile", scopes: ["thread"],
    banners: [{ id: "navigation", chrome: "bare", component: ThreadGlide }],
  });
});
