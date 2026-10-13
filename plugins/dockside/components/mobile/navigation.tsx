import {
  useComposer, useBbNavigate, useSettings,
  experimental_useSidebarThreads,
} from "@get-bb/plugin-sdk/app";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { navigationThreads, neighbor, titleFor, statusFor, updateGesture, swipeDirection, type Gesture } from "../../lib/mobile-navigation";
import { Icon } from "../ui/icon";
import { StatusGlyph } from "../inbox/status-glyph";
import { useProjectColors } from "../../hooks/use-project-colors";
import { projectBadgeLetter, projectBadgePresentation } from "../../lib/project-colors";
import { docksidePreferenceStyle, resolveDocksidePreferences } from "../../lib/preferences";
import "./navigation.css";

function Navigator({ threadId }: { threadId: string }) {
  const state = experimental_useSidebarThreads();
  const colors = useProjectColors();
  const settings = useSettings();
  const preferences = resolveDocksidePreferences(settings.values);
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
  const project = state.status === "ready"
    ? state.projects.find(item => item.id === threads[index]?.projectId)
    : undefined;
  const projectId = threads[index]?.projectId ?? "";
  const badge = projectBadgePresentation(projectId, colors.overrides.get(projectId));
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
  return <nav className="tg-nav" style={docksidePreferenceStyle(preferences) as CSSProperties}
    aria-label="Thread navigation" aria-busy={state.status === "loading" || pending}>
    <button className="tg-arrow" type="button" title="Previous thread" aria-label="Previous thread"
      disabled={!previous || pending} onClick={() => move(-1)}><Icon name="ChevronLeft" aria-hidden className="tg-arrow-icon" /></button>
    <div className="tg-swipe" role="group" tabIndex={0} aria-label="Thread position; left and right arrows change thread"
      onKeyDown={event => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
      onPointerDown={event => {
        event.stopPropagation();
        if (!event.isPrimary || event.button !== 0 || pendingRef.current) { gesture.current = null; return; }
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, cancelled: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        event.stopPropagation();
        if (gesture.current?.id === event.pointerId) gesture.current = updateGesture(gesture.current, event.clientX, event.clientY);
      }}
      onPointerUp={event => {
        event.stopPropagation();
        const start = gesture.current; gesture.current = null;
        if (!start) return;
        const direction = swipeDirection(start, event.pointerId, event.clientX, event.clientY);
        if (direction !== null) move(direction);
      }}
      onPointerCancel={event => { event.stopPropagation(); gesture.current = null; }}
      onTouchStart={event => event.stopPropagation()}
      onTouchMove={event => event.stopPropagation()}
      onTouchEnd={event => event.stopPropagation()}
      onTouchCancel={event => event.stopPropagation()}
      onLostPointerCapture={() => { gesture.current = null; }}>
      <span className="tg-heading">
        {index >= 0 && <span className="tg-project" style={{ backgroundColor: badge.backgroundColor, color: badge.foregroundColor }}
          title={project?.name ?? "Unknown project"} aria-label={`Project: ${project?.name ?? "Unknown project"}`}>{projectBadgeLetter(project?.name ?? "")}</span>}
        <strong className="tg-title" title={label}>{label}</strong>
      </span>
      {state.status === "error"
        ? <button className="tg-retry" type="button" title="Reload BB to retry loading threads"
            onPointerDown={event => event.stopPropagation()}
            onKeyDown={event => event.stopPropagation()}
            onClick={() => window.location.reload()}>Reload</button>
        : <span className="tg-meta" aria-live="polite" aria-atomic="true">
            {index >= 0 ? <>
              <span className="tg-status" title={status}>
                <StatusGlyph indicator={threads[index].indicator} label={null} className="tg-status-icon" />
                <span className="tg-status-text">{status}</span>
              </span>
              <span aria-hidden="true">{"\u00b7"}</span>
              <span className="tg-position">{`${index + 1} / ${threads.length}`}</span>
            </> : "\u00a0"}
          </span>}
    </div>
    <button className="tg-arrow" type="button" title="Next thread" aria-label="Next thread"
      disabled={!next || pending} onClick={() => move(1)}><Icon name="ChevronRight" aria-hidden className="tg-arrow-icon" /></button>
  </nav>;
}

export function MobileNavigation() {
  const { scope } = useComposer();
  return scope.kind === "thread" ? <Navigator key={scope.threadId} threadId={scope.threadId} /> : null;
}
