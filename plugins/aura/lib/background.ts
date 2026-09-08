import { imageUrl, snapshotSchema, type Snapshot } from "./model.ts";
import { CAPY_CSS, mountCapyEffect, type CapyEffect } from "./capy-effect.ts";

export const LOCAL_CHANGE = "bb:aura:changed";
export const TARGETS = ':is([id="thread-detail-timeline-panel"], [id="root-compose-main-panel"])';
export const NEW_THREAD_TARGET = '[id="root-compose-main-panel"]';
export function targetsFor(snapshot: Snapshot): string { return snapshot.settings.newThreadOnly ? NEW_THREAD_TARGET : TARGETS; }
export function backgroundRules(selector: string): string { return `${selector}{position:relative;isolation:isolate;}`; }

// Center only the full New thread compose layout. Auto margins collapse when
// the draft grows taller than the viewport, keeping it reachable by scrolling.
export const COMPOSE_LAYOUT = `
${NEW_THREAD_TARGET} [class~="@container/page"]:has(> .mx-auto) {
  display:flex; flex-direction:column;
}
${NEW_THREAD_TARGET} [class~="@container/page"] > .mx-auto {
  margin-block:auto; padding-block:28px;
}
`;
export const READING_SURFACE = `
[id="thread-detail-timeline-panel"] .thread-scrollbar:has(> div > .mx-auto) {
  background-color:transparent;
}
[id="thread-detail-timeline-panel"] .thread-scrollbar > div > .mx-auto {
  background-color:var(--background); box-shadow:0 0 0 1px var(--border);
}
/* BB intentionally lets wide Markdown tables extend beyond the text column.
   Paint the whole scrollable table surface, including its overflow area. */
[id="thread-detail-timeline-panel"] [data-markdown-preview] table,
[id="thread-detail-timeline-panel"] [data-markdown-preview] div:has(> table) {
  background-color:var(--background);
}
`;

export function notifyChange(snapshot: Snapshot): void {
  window.dispatchEvent(new CustomEvent(LOCAL_CHANGE, { detail: snapshot }));
}

export function mountBackground(signal: AbortSignal): () => void {
  const style = document.createElement("style");
  style.dataset.aura = "";
  document.head.append(style);
  let disposed = false;
  let requestId = 0;
  let lastCss = "";
  let current: Snapshot | null = null;
  const effects = new Map<HTMLElement, CapyEffect>();
  let pending = false;
  function reconcile(): void {
    pending = false;
    if (disposed) return;
    for (const [element, effect] of effects) {
      if (!element.isConnected || !current?.settings.enabled || !element.matches(targetsFor(current))) { effect.dispose(); effects.delete(element); }
    }
    if (!current?.settings.enabled) return;
    for (const element of document.querySelectorAll<HTMLElement>(targetsFor(current))) {
      const existing = effects.get(element);
      // BB can reuse the same panel element when navigating between a
      // conversation and New thread. Reapply its surface-specific dimming.
      if (existing) existing.update(current.settings, imageUrl(current.image));
      else effects.set(element, mountCapyEffect(element, current.settings, imageUrl(current.image)));
    }
  }
  const observer = new MutationObserver(records => {
    const relevant = records.some(record => record.type === "attributes"
      ? record.target instanceof HTMLElement && (effects.has(record.target) || record.target.matches(TARGETS))
      : [...record.addedNodes, ...record.removedNodes].some(node =>
      node instanceof Element && (node.matches(TARGETS) || node.querySelector(TARGETS) !== null)));
    if (relevant && !pending) { pending = true; queueMicrotask(reconcile); }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["id"] });
  const controller = new AbortController();
  function apply(snapshot: Snapshot): void {
    current = snapshot;
    const target = targetsFor(snapshot);
    const css = snapshot.settings.enabled ? `${backgroundRules(target)}\n${CAPY_CSS}\n${COMPOSE_LAYOUT}\n${snapshot.settings.newThreadOnly ? "" : READING_SURFACE}` : "";
    if (css !== lastCss) { style.textContent = css; lastCss = css; }
    reconcile();
  }

  async function refresh(): Promise<void> {
    if (disposed || document.visibilityState === "hidden") return;
    const id = ++requestId;
    try {
      const response = await fetch("/api/v1/plugins/aura/rpc/get", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: "null", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) return;
      const body = await response.json();
      const parsed = snapshotSchema.safeParse(body.result);
      if (!disposed && id === requestId && body.ok && parsed.success) apply(parsed.data);
    } catch { /* Keep the last valid background through a transient disconnect. */ }
  }
  function onChange(event: Event): void {
    const parsed = snapshotSchema.safeParse((event as CustomEvent).detail);
    if (parsed.success && !disposed) { requestId++; apply(parsed.data); }
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    controller.abort();
    observer.disconnect();
    for (const effect of effects.values()) effect.dispose();
    effects.clear();
    clearInterval(timer);
    window.removeEventListener(LOCAL_CHANGE, onChange);
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", refresh);
    signal.removeEventListener("abort", dispose);
    style.remove();
  }
  // Refresh small metadata only, never image bytes, for changes from other clients.
  const timer = setInterval(() => { void refresh(); }, 15000);
  window.addEventListener(LOCAL_CHANGE, onChange);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  signal.addEventListener("abort", dispose, { once: true });
  if (signal.aborted) dispose(); else void refresh();
  return dispose;
}
