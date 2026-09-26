import { definePluginApp, useSettings, useRpc } from "@get-bb/plugin-sdk/app";
import { useEffect, useState } from "react";
import type { rpcContract } from "./server";
import type { Route } from "./server";
import "./app.css";

const HIDDEN_REASONING_ATTRIBUTE = "data-jev-reasoning-hidden";
const HIDDEN_STATIC_EFFORT_ATTRIBUTE = "data-jev-static-effort-hidden";
const ROUTE_BADGE_ATTRIBUTE = "data-jev-route-badge";
const HISTORY_PAGE_SIZE = 8;
let activeRoute: Route | null = null;
let previousModel: string | null = null;
let activeExecution: {
  providerId: string;
  model: string;
  reasoningLevel: string;
  at: number;
} | null = null;
let previousExecutionModel: string | null = null;
let executionSwitches: Array<{
  from: string;
  to: string;
  provider: string;
  reasoningLevel: string;
  at: number;
}> = [];
let showThreadRoute = true;
let showSwitchHistory = true;
let modelColors: Record<string, string> = { luna: "Sky", sol: "Amber", astra: "Violet" };
let loadedThreadId: string | null = null;
let historyPage = 0;

function shortModel(model: string): string {
  if (model.includes("astra")) return "Astra";
  if (model.includes("luna")) return "Luna";
  if (model.includes("sol")) return "Sol";
  return model.split("/").at(-1) ?? model;
}

const COLOR_VALUES: Record<string, string> = {
  Red: "#ef4444",
  Orange: "#f97316",
  Yellow: "#eab308",
  Green: "#22c55e",
  Blue: "#3b82f6",
  Violet: "#a855f7",
  Pink: "#ec4899",
  Coral: "#fb7185", Amber: "#f59e0b", Lime: "#84cc16",
  Emerald: "#10b981", Teal: "#14b8a6", Cyan: "#06b6d4",
  Sky: "#0ea5e9", Indigo: "#6366f1", Lavender: "#c084fc",
  Fuchsia: "#d946ef", Rose: "#f43f5e", Silver: "#94a3b8",
};

function modelColor(model: string): string | null {
  const normalized = model.toLowerCase();
  const colorName = modelColors[normalized] ?? (normalized.includes("astra")
    ? modelColors.astra
    : normalized.includes("sol")
      ? modelColors.sol
      : normalized.includes("luna")
        ? modelColors.luna
        : null);
  if (colorName) return COLOR_VALUES[colorName] ?? colorName;
  let hash = 0;
  for (const char of normalized) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 68% 62%)`;
}

function applyModelColor(chip: HTMLElement, model: string): void {
  const color = modelColor(model);
  chip.classList.toggle("jev-model-chip--custom", color !== null);
  if (color === null) chip.style.removeProperty("--jev-model-color");
  else chip.style.setProperty("--jev-model-color", color);
}

function createModelChip(model: string): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.className = "jev-model-chip";
  applyModelColor(chip, model);
  chip.textContent = shortModel(model);
  return chip;
}

function providerLabel(providerId: string): string {
  const labels: Record<string, string> = {
    "acp-cursor": "Cursor",
    "claude-code": "Claude",
    codex: "Codex",
    jev: "JEV",
    opencode: "opencode",
    pi: "Pi",
  };
  return labels[providerId] ?? providerId;
}

function isSelectedModelOption(option: Element): boolean {
  if (option.getAttribute("aria-selected") === "true") return true;
  return (
    option.querySelector('[data-icon="Check"]')?.classList.contains("opacity-100") ??
    false
  );
}

function syncJevComposer(): void {
  document.querySelector(`[data-jev-latest-switch]`)?.remove();
  for (const button of Array.from(
    document.querySelectorAll(
      'button[aria-label^="Provider, model and reasoning"]',
    ),
  )) {
    const isJev = /Jev (Codex Router|Routing)/i.test(button.textContent ?? "");
    const staticEffort = button.querySelector(
      "[data-promptbox-hide-compact]",
    );
    if (staticEffort instanceof HTMLElement) {
      staticEffort.hidden = isJev;
      if (isJev) {
        staticEffort.setAttribute(HIDDEN_STATIC_EFFORT_ATTRIBUTE, "");
      } else {
        staticEffort.removeAttribute(HIDDEN_STATIC_EFFORT_ATTRIBUTE);
      }
    }
    const existingBadge = button.parentElement?.querySelector(
      `[${ROUTE_BADGE_ATTRIBUTE}]`,
    );

    const jevExecution = activeExecution?.model === "jev/auto";
    const tracked =
      jevExecution && activeRoute !== null
        ? {
            at: activeRoute.at,
            effort: activeRoute.effort,
            fallback: activeRoute.fallback,
            model: activeRoute.model,
            previous: previousModel,
            provider: "Jev",
          }
        : activeExecution === null
          ? null
          : {
              at: activeExecution.at,
              effort: activeExecution.reasoningLevel,
              fallback: null,
              model: activeExecution.model,
              previous: previousExecutionModel,
              provider: providerLabel(activeExecution.providerId),
            };

    if (!isJev || !jevExecution || !showThreadRoute || tracked === null) {
      existingBadge?.remove();
      document.querySelector("[data-jev-switch-history]")?.remove();
      continue;
    }

    const badge =
      existingBadge instanceof HTMLSpanElement
        ? existingBadge
        : document.createElement("span");
    const modelLabel = shortModel(tracked.model);
    const effortLabel = tracked.effort;
    const switchLabel =
      showSwitchHistory &&
      tracked.previous !== null &&
      tracked.previous !== tracked.model
        ? `Switched from ${shortModel(tracked.previous)}`
        : null;
    const routeKey = [
      tracked.at,
      tracked.provider,
      tracked.model,
      tracked.effort,
      switchLabel,
      JSON.stringify(modelColors),
      isJev ? "live" : "history",
    ].join(":");
    const title = [
      `${tracked.provider} used ${tracked.model}`,
      `Reasoning: ${tracked.effort}`,
      `At: ${new Date(tracked.at).toLocaleTimeString()}`,
      switchLabel,
      tracked.fallback ? `Fallback: ${tracked.fallback}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    if (!badge.hasAttribute(ROUTE_BADGE_ATTRIBUTE)) {
      badge.setAttribute(ROUTE_BADGE_ATTRIBUTE, "");
    }
    const badgeClass = isJev
      ? "jev-composer-route"
      : "jev-composer-route jev-composer-route--history";
    if (badge.className !== badgeClass) {
      badge.className = badgeClass;
    }
    badge.style.pointerEvents = "auto";
    badge.style.cursor = "pointer";
    badge.title = `${title}\nClick to view model history`;
    if (badge.getAttribute("data-jev-history-trigger") !== "true") {
      badge.setAttribute("data-jev-history-trigger", "true");
      badge.setAttribute("role", "button");
      badge.tabIndex = 0;
      badge.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        openSwitchHistoryDialog(badge);
      });
      badge.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openSwitchHistoryDialog(badge);
      });
    }
    if (badge.getAttribute("data-jev-route-key") !== routeKey) {
      badge.replaceChildren();
      if (!isJev || tracked.provider !== "Jev") {
        const source = document.createElement("span");
        source.className = "jev-route-source";
        source.textContent = tracked.provider;
        badge.append(source);
      }
      const model = document.createElement("span");
      model.className = "jev-route-model jev-model-chip";
      applyModelColor(model, tracked.model);
      model.textContent = modelLabel;
      const effort = document.createElement("span");
      effort.className = "jev-route-effort";
      effort.textContent = effortLabel;
      badge.append(model, effort);
      if (switchLabel !== null) {
        const transition = document.createElement("span");
        transition.className = "jev-route-switch";
        transition.textContent = switchLabel;
        badge.append(transition);
      }
      badge.setAttribute("data-jev-route-key", routeKey);
    }
    if (badge.title !== title) badge.title = title;
    if (badge.getAttribute("aria-label") !== title) {
      badge.setAttribute("aria-label", title);
    }
    if (existingBadge === null) button.after(badge);
  }

  for (const dialog of Array.from(
    document.querySelectorAll('[role="dialog"]'),
  )) {
    const jevOption = Array.from(
      dialog.querySelectorAll('[role="option"]'),
    ).find(
      (option) =>
        /Jev (Codex Router|Routing)/i.test(option.textContent ?? ""),
    );
    const reasoningGroup = dialog.querySelector(
      '[role="radiogroup"][aria-label="Reasoning"]',
    );
    const reasoningSection = reasoningGroup?.parentElement;
    if (!(reasoningSection instanceof HTMLElement)) continue;

    const shouldHide = jevOption !== undefined && isSelectedModelOption(jevOption);
    if (reasoningSection.hidden === shouldHide) continue;
    reasoningSection.hidden = shouldHide;
    if (shouldHide) {
      reasoningSection.setAttribute(HIDDEN_REASONING_ATTRIBUTE, "");
    } else {
      reasoningSection.removeAttribute(HIDDEN_REASONING_ATTRIBUTE);
    }
  }
}

function renderSwitchHistory(): void {
  const existing = document.querySelector(`[data-jev-switch-history]`);
  if (!showSwitchHistory || activeExecution?.model !== "jev/auto") {
    existing?.remove();
    return;
  }
  const panel =
    existing instanceof HTMLDialogElement ? existing : document.createElement("dialog");
  const pageCount = Math.max(
    1,
    Math.ceil(executionSwitches.length / HISTORY_PAGE_SIZE),
  );
  historyPage = Math.min(historyPage, pageCount - 1);
  const historyKey = executionSwitches
    .map((change) =>
      [change.at, change.provider, change.from, change.to, change.reasoningLevel].join(
        ":",
      ),
    )
    .join("|") + `:page:${historyPage}:${JSON.stringify(modelColors)}`;
  if (panel.getAttribute("data-jev-switch-key") === historyKey) return;
  panel.setAttribute("data-jev-switch-history", "");
  panel.setAttribute("data-jev-switch-key", historyKey);
  panel.className = "jev-switch-history";
  panel.replaceChildren();
  const heading = document.createElement("div");
  heading.className = "jev-switch-heading";
  heading.textContent = "Model history";
  panel.append(heading);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "jev-switch-close";
  close.textContent = "Close";
  const closeDialog = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    panel.close();
    panel.remove();
  };
  close.addEventListener("click", closeDialog);
  panel.append(close);
  if (executionSwitches.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No model changes yet";
    panel.append(empty);
  }
  const newestFirst = [...executionSwitches].reverse();
  const pageStart = historyPage * HISTORY_PAGE_SIZE;
  for (const change of newestFirst.slice(
    pageStart,
    pageStart + HISTORY_PAGE_SIZE,
  )) {
    const row = document.createElement("div");
    row.className = "jev-switch-row";
    const dot = document.createElement("span");
    dot.className = "jev-switch-dot";
    const text = document.createElement("span");
    text.className = "jev-switch-models";
    text.append(
      document.createTextNode("Model changed from "),
      createModelChip(change.from),
      document.createTextNode(" to "),
      createModelChip(change.to),
    );
    const meta = document.createElement("span");
    meta.className = "jev-switch-meta";
    meta.textContent = `${providerLabel(change.provider)} · ${change.reasoningLevel} · ${new Date(change.at).toLocaleTimeString()}`;
    row.append(dot, text, meta);
    panel.append(row);
  }
  const pagination = document.createElement("div");
  pagination.className = "jev-switch-pagination";
  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "Previous";
  previous.disabled = historyPage === 0;
  previous.addEventListener("click", () => {
    historyPage -= 1;
    panel.removeAttribute("data-jev-switch-key");
    renderSwitchHistory();
  });
  const count = document.createElement("span");
  count.textContent = `${historyPage + 1} / ${pageCount}`;
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Next";
  next.disabled = historyPage >= pageCount - 1;
  next.addEventListener("click", () => {
    historyPage += 1;
    panel.removeAttribute("data-jev-switch-key");
    renderSwitchHistory();
  });
  pagination.append(previous, count, next);
  panel.append(pagination);
  panel.addEventListener("click", (event) => {
    if (event.target === panel) panel.close();
  });
  if (existing === null) {
    document.body.append(panel);
  }
}

function positionSwitchHistoryDialog(
  dialog: HTMLDialogElement,
  anchor: HTMLElement,
): void {
  const anchorRect = anchor.getBoundingClientRect();
  const dialogRect = dialog.getBoundingClientRect();
  const gutter = 12;
  const left = Math.min(
    window.innerWidth - dialogRect.width - gutter,
    Math.max(gutter, anchorRect.right - dialogRect.width),
  );
  const top = Math.max(
    gutter,
    anchorRect.top - dialogRect.height - 8,
  );
  dialog.style.left = `${left}px`;
  dialog.style.top = `${top}px`;
}

function openSwitchHistoryDialog(anchor: HTMLElement): void {
  historyPage = 0;
  renderSwitchHistory();
  const dialog = document.querySelector(`[data-jev-switch-history]`);
  if (!(dialog instanceof HTMLDialogElement)) return;
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => positionSwitchHistoryDialog(dialog, anchor));
}

function currentThreadId(): string | null {
  return location.pathname.match(/\/threads\/(thr_[^/?#]+)/)?.[1] ?? null;
}

async function refreshActiveRoute(signal: AbortSignal): Promise<void> {
  const threadId = currentThreadId();
  if (threadId !== loadedThreadId) {
    loadedThreadId = threadId;
    activeRoute = null;
    previousModel = null;
    activeExecution = null;
    previousExecutionModel = null;
    executionSwitches = [];
    historyPage = 0;
    document.querySelector(`[data-jev-switch-history]`)?.remove();
    document.querySelector(`[data-jev-latest-switch]`)?.remove();
  }
  if (threadId === null) {
    activeRoute = null;
    previousModel = null;
    activeExecution = null;
    previousExecutionModel = null;
    syncJevComposer();
    return;
  }

  try {
    const response = await fetch("/api/v1/plugins/jev-route/rpc/latest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId }),
      signal,
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      result?: {
        route?: Route | null;
        previousModel?: string | null;
        execution?: {
          providerId: string;
          model: string;
          reasoningLevel: string;
          at: number;
        } | null;
        previousExecutionModel?: string | null;
        switches?: Array<{
          from: string;
          to: string;
          provider: string;
          reasoningLevel: string;
          at: number;
        }>;
        display?: {
          showThreadRoute?: boolean;
          showSwitchHistory?: boolean;
          modelColors?: Record<string, string>;
        };
      };
    };
    if (currentThreadId() !== threadId) return;
    activeRoute =
      response.ok && payload.ok === true ? (payload.result?.route ?? null) : null;
    previousModel =
      response.ok && payload.ok === true
        ? (payload.result?.previousModel ?? null)
        : null;
    activeExecution =
      response.ok && payload.ok === true
        ? (payload.result?.execution ?? null)
        : null;
    previousExecutionModel =
      response.ok && payload.ok === true
        ? (payload.result?.previousExecutionModel ?? null)
        : null;
    executionSwitches =
      response.ok && payload.ok === true ? (payload.result?.switches ?? []) : [];
    showThreadRoute =
      payload.result?.display?.showThreadRoute ?? true;
    showSwitchHistory =
      payload.result?.display?.showSwitchHistory ?? true;
    modelColors = payload.result?.display?.modelColors ?? modelColors;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") return;
    activeRoute = null;
    previousModel = null;
    activeExecution = null;
    previousExecutionModel = null;
    executionSwitches = [];
    loadedThreadId = null;
  }
  syncJevComposer();
  if (document.querySelector("[data-jev-switch-history][open]")) renderSwitchHistory();
}

function mountJevReasoningVisibility(signal: AbortSignal): () => void {
  const observer = new MutationObserver(syncJevComposer);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["aria-selected", "class"],
    childList: true,
    subtree: true,
  });
  syncJevComposer();
  void refreshActiveRoute(signal);
  const timer = window.setInterval(() => {
    void refreshActiveRoute(signal);
  }, 3000);

  const cleanup = () => {
    window.clearInterval(timer);
    observer.disconnect();
    activeRoute = null;
    previousModel = null;
    activeExecution = null;
    previousExecutionModel = null;
    executionSwitches = [];
    loadedThreadId = null;
    for (const badge of Array.from(
      document.querySelectorAll(`[${ROUTE_BADGE_ATTRIBUTE}]`),
    )) {
      badge.remove();
    }
    document.querySelector(`[data-jev-switch-history]`)?.remove();
    document.querySelector(`[data-jev-latest-switch]`)?.remove();
    for (const effort of Array.from(
      document.querySelectorAll(`[${HIDDEN_STATIC_EFFORT_ATTRIBUTE}]`),
    )) {
      if (!(effort instanceof HTMLElement)) continue;
      effort.hidden = false;
      effort.removeAttribute(HIDDEN_STATIC_EFFORT_ATTRIBUTE);
    }
    for (const section of Array.from(
      document.querySelectorAll(`[${HIDDEN_REASONING_ATTRIBUTE}]`),
    )) {
      if (!(section instanceof HTMLElement)) continue;
      section.hidden = false;
      section.removeAttribute(HIDDEN_REASONING_ATTRIBUTE);
    }
  };
  signal.addEventListener("abort", cleanup, { once: true });
  return cleanup;
}

function JevSettingsSummary() {
  const settings = useSettings();
  const rpc = useRpc<typeof rpcContract>();
  const [colors, setColors] = useState<Record<string, string>>({});
  const [model, setModel] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [status, setStatus] = useState("");
  useEffect(() => {
    void rpc.call("colors", {}).then(result => {
      setColors(result);
    }).catch(() => setStatus("Could not load colors"));
  }, [rpc]);
  async function saveColor() {
    setStatus("Saving...");
    try {
      const result = await rpc.call("colors", { model: model.trim(), color });
      setColors(result);
      modelColors = { ...modelColors, ...result };
      syncJevComposer();
      setStatus("Saved");
    } catch { setStatus("Could not save color. Try again."); }
  }
  const routeVisible = settings.values?.showThreadRoute !== false;
  const switchesVisible = settings.values?.showSwitchHistory !== false;

  return (
    <div>
    <div className="jev-settings-summary">
      <div className="jev-settings-status">
        <span className="jev-settings-status-dot" aria-hidden="true" />
        <div>
          <strong>Thread model tracking</strong>
          <span>
            {routeVisible ? "Visible in thread composers" : "Hidden in threads"}
          </span>
        </div>
      </div>
      <span className="jev-settings-history">
        Switch history {switchesVisible ? "on" : "off"}
      </span>
    </div>
    <div className="jev-color-editor">
      <label>Model ID<input value={model} onChange={event => setModel(event.target.value)} placeholder="e.g. claude-opus-4-6" list="jev-colored-models" /></label>
      <datalist id="jev-colored-models">{[...new Set(["luna", "sol", "astra", ...Object.keys(colors)])].map(id => <option key={id} value={id} />)}</datalist>
      <div className="jev-color-swatches">{Object.entries(COLOR_VALUES).map(([name, value]) => <button key={name} type="button" aria-label={name} title={name} aria-pressed={color === value} style={{ backgroundColor: value }} onClick={() => setColor(value)} />)}</div>
      <div className="jev-color-actions"><input type="color" aria-label="Custom model color" value={color} onChange={event => setColor(event.target.value)} /><button type="button" disabled={!model.trim() || status === "Saving..."} onClick={() => void saveColor()}>Save color</button><span role="status">{status}</span></div>
      {Object.entries(colors).map(([id, value]) => <button className="jev-saved-color" key={id} type="button" onClick={() => { setModel(id); setColor(value); }}><span style={{ backgroundColor: value }} />{id}</button>)}
    </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "jev-reasoning-visibility",
    mount: ({ signal }) => mountJevReasoningVisibility(signal),
  });
  app.slots.settingsSection({
    id: "thread-routing",
    title: "Thread routing",
    description: "The actual model and reasoning level used by Jev-routed threads.",
    component: JevSettingsSummary,
  });
});
