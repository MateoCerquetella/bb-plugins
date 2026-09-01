import {
  ACTION_CATALOG_STORAGE_KEY,
  actionKind,
  applyDiscoveredCatalog,
  catalogFingerprint,
  compactActionLabel,
  initialActionCatalog,
  serializeActionCatalog,
  uniqueActions,
  type ActionDescriptor,
} from "./action-catalog.js";
import {
  boundedTabId,
  boundedTabLabel,
  buildLauncherOptions,
  displayableTabs,
  nativeLabelMatchesTab,
  parseTabsSnapshot,
  type LauncherOption,
  type TabKind,
  type TabSummary,
  type TabsSnapshot,
} from "./tab-model.js";

const HEADER_ACTIONS_SELECTOR = "[data-thread-header-pane-actions]";
const HEADER_ROW_SELECTOR = '[data-testid="app-page-header-content-row"]';
const TOPBAR_ROOT_SELECTOR = "[data-action-topbar-root]";
const NEW_TAB_ACTIONS_SELECTOR = '[data-testid="new-tab-actions"]';
const NATIVE_TAB_STRIP_SELECTOR = '[data-testid="secondary-panel-tab-strip"]';
const NATIVE_TAB_CONTENT_SELECTOR = "[data-secondary-panel-tab-content]";
const PANEL_CHROME_SELECTOR =
  '[data-testid="thread-secondary-panel-top-chrome"]';
const PANE_SELECTOR = "[data-split-pane-id]";
const FOCUSED_PANE_SELECTOR = `${PANE_SELECTOR}[data-focused="true"]`;
const THREAD_ACTION_PANE_SELECTOR =
  "[data-thread-action-pane-action-id][data-thread-action-pane-thread-id]";
const RPC_BASE = "/api/v1/plugins/action-topbar/rpc";
const LAUNCHER_LISTBOX_ID = "action-topbar-options";
const POINTER_DRAG_DISTANCE_PX = 7;
const ELEMENT_WAIT_TIMEOUT_MS = 1_500;
const ELEMENT_WAIT_STEP_MS = 30;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

interface RpcEnvelope<T> {
  ok: boolean;
  result?: T;
  error?: { message?: string };
}

interface NativeTab {
  active: boolean;
  closeButton: HTMLButtonElement | null;
  icon: Element | null;
  label: string;
  pill: HTMLElement;
  selectButton: HTMLButtonElement;
  wrapper: HTMLElement;
}

interface MirroredTab {
  native: NativeTab | null;
  summary: TabSummary;
}

interface LauncherElements {
  input: HTMLInputElement;
  list: HTMLDivElement;
  popover: HTMLDivElement;
  status: HTMLDivElement;
}

interface TopbarElements {
  center: HTMLElement;
  root: HTMLElement;
  tabs: HTMLDivElement;
  titleGroup: HTMLElement | null;
  trigger: HTMLButtonElement;
}

interface CrossPaneDragState {
  engaged: boolean;
  ghost: HTMLDivElement | null;
  overlay: HTMLDivElement | null;
  source: MirroredTab;
  startX: number;
  startY: number;
  targetPane: HTMLElement | null;
}

interface TopbarDragState extends CrossPaneDragState {
  reorderTargetId: string | null;
  sourceButton: HTMLButtonElement;
}

interface ThreadActionSplitDragRequest {
  actionId: string;
  threadId: string;
  source: HTMLElement;
  startX: number;
  startY: number;
}

type BeginThreadActionSplitDrag = (
  request: ThreadActionSplitDragRequest,
) => boolean;

const ICON_PATHS: Readonly<Record<string, readonly string[]>> = {
  browser: [
    "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z",
    "M4.5 12h15",
    "M12 4c2.2 2.2 3.2 4.9 3.2 8S14.2 17.8 12 20c-2.2-2.2-3.2-4.9-3.2-8S9.8 6.2 12 4Z",
  ],
  terminal: ["m5 7 4 4-4 4", "M11.5 16H19"],
  recap: ["M6 6h12", "M6 11h12", "M6 16h8"],
  files: [
    "M3.5 7.5h6l2-2H20a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 .5-1Z",
  ],
  git: [
    "M7 5v10a3 3 0 0 0 3 3h3",
    "M13 6h2a3 3 0 0 1 3 3v1",
    "M7 5a2 2 0 1 0 0 .01M15 6a2 2 0 1 0 0 .01M15 18a2 2 0 1 0 0 .01M18 12a2 2 0 1 0 0 .01",
  ],
  chat: [
    "M5 5.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-8l-4.5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z",
  ],
  task: [
    "M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    "m8 10 2 2 4-4",
  ],
  workflow: [
    "M6 6h5a3 3 0 0 1 3 3v6h4",
    "M6 6a2 2 0 1 0 0 .01M18 15a2 2 0 1 0 0 .01",
  ],
  file: ["M7 3.5h7l4 4V20H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z", "M14 3.5v4h4"],
  plus: ["M12 5v14", "M5 12h14"],
  info: ["M12 10v6", "M12 7h.01", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"],
  diff: ["M8 5v14", "m5-11 3-3 3 3", "M16 8v11"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z", "m16 16 4 4"],
};

function createLineIcon(name: string, className: string): SVGSVGElement | null {
  const paths = ICON_PATHS[name];
  if (paths === undefined) return null;
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add(className);
  for (const data of paths) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", data);
    svg.append(path);
  }
  return svg;
}

function createFallbackGlyph(text: string, className: string): HTMLSpanElement {
  const glyph = document.createElement("span");
  glyph.className = className;
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = text;
  return glyph;
}

function tryCapturePointer(element: HTMLElement, pointerId: number): void {
  if (typeof element.setPointerCapture !== "function") return;
  try {
    element.setPointerCapture(pointerId);
  } catch {
    return;
  }
}

function tryReleasePointer(element: HTMLElement, pointerId: number): void {
  if (
    typeof element.hasPointerCapture !== "function" ||
    typeof element.releasePointerCapture !== "function" ||
    !element.hasPointerCapture(pointerId)
  ) {
    return;
  }
  try {
    element.releasePointerCapture(pointerId);
  } catch {
    return;
  }
}

function actionIconNode(action: ActionDescriptor): Node {
  return (
    createLineIcon(actionKind(action), "action-topbar__line-icon") ??
    createFallbackGlyph(
      compactActionLabel(action.label).slice(0, 1).toUpperCase(),
      "action-topbar__launcher-glyph",
    )
  );
}

function fallbackTabIcon(summary: TabSummary): Node {
  const iconName =
    summary.kind === "workspace-file-preview" ||
    summary.kind === "host-file-preview" ||
    summary.kind === "thread-storage-file-preview"
      ? "file"
      : summary.kind === "new-tab"
        ? "plus"
        : summary.kind === "thread-info"
          ? "info"
          : summary.kind === "git-diff"
            ? "diff"
            : summary.kind === "plugin-panel"
              ? ""
              : summary.kind;
  return (
    createLineIcon(iconName, "action-topbar__line-icon") ??
    createFallbackGlyph(
      summary.label.slice(0, 1).toUpperCase(),
      "action-topbar__launcher-glyph",
    )
  );
}

function isVisible(element: HTMLElement): boolean {
  return (
    !element.hidden &&
    element.getAttribute("aria-hidden") !== "true" &&
    element.closest('[aria-hidden="true"], [inert]') === null &&
    element.getClientRects().length > 0
  );
}

function visibleElement<T extends HTMLElement>(selector: string): T | null {
  return (
    Array.from(document.querySelectorAll<T>(selector)).find(isVisible) ?? null
  );
}

function threadHeaderRowIn(scope: ParentNode): HTMLElement | null {
  return (
    scope
      .querySelector<HTMLElement>(HEADER_ACTIONS_SELECTOR)
      ?.closest<HTMLElement>(HEADER_ROW_SELECTOR) ?? null
  );
}

function activeThreadHeaderRow(): HTMLElement | null {
  const focusedPane = document.querySelector<HTMLElement>(
    FOCUSED_PANE_SELECTOR,
  );
  const focusedRow =
    focusedPane === null ? null : threadHeaderRowIn(focusedPane);
  if (focusedRow !== null) return focusedRow;
  return (
    Array.from(document.querySelectorAll<HTMLElement>(HEADER_ACTIONS_SELECTOR))
      .map((actions) => actions.closest<HTMLElement>(HEADER_ROW_SELECTOR))
      .find((row): row is HTMLElement => row !== null && isVisible(row)) ?? null
  );
}

function currentThreadId(): string | null {
  const match = /\/threads\/([^/?#]+)/.exec(window.location.pathname);
  if (match?.[1] === undefined) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function mainActionPane(mirror: MirroredTab): HTMLElement | null {
  const actionId = mirror.summary.relaunchActionId;
  const threadId = currentThreadId();
  if (actionId === null || threadId === null) return null;
  const marker = Array.from(
    document.querySelectorAll<HTMLElement>(THREAD_ACTION_PANE_SELECTOR),
  ).find(
    (candidate) =>
      candidate.dataset.threadActionPaneActionId === actionId &&
      candidate.dataset.threadActionPaneThreadId === threadId,
  );
  const markedPane = marker?.closest<HTMLElement>(PANE_SELECTOR) ?? null;
  if (markedPane !== null) return markedPane;
  if (mirror.summary.kind !== "terminal") return null;
  return (
    Array.from(
      document.querySelectorAll<HTMLElement>(
        `${PANE_SELECTOR} [data-app-terminal]`,
      ),
    )
      .map((terminal) => terminal.closest<HTMLElement>(PANE_SELECTOR))
      .find((pane): pane is HTMLElement => pane !== null) ?? null
  );
}

function mainWorkspaceMirrors(
  mirrors: readonly MirroredTab[],
  actions: readonly ActionDescriptor[],
): MirroredTab[] {
  const threadId = currentThreadId();
  if (threadId === null) return [];
  const actionIds = new Set<string>();
  const result: MirroredTab[] = [];
  for (const marker of document.querySelectorAll<HTMLElement>(
    THREAD_ACTION_PANE_SELECTOR,
  )) {
    const actionId = marker.dataset.threadActionPaneActionId;
    if (
      marker.dataset.threadActionPaneThreadId !== threadId ||
      actionId === undefined ||
      actionIds.has(actionId)
    ) {
      continue;
    }
    actionIds.add(actionId);
    const existing = mirrors.find(
      (mirror) => mirror.summary.relaunchActionId === actionId,
    );
    if (existing !== undefined) {
      result.push(existing);
      continue;
    }
    const action = actions.find((candidate) => candidate.id === actionId) ?? {
      id: actionId,
      label: marker.dataset.threadActionPaneTitle ?? "Action",
    };
    const kind = actionKind(action);
    result.push({
      native: null,
      summary: {
        id: boundedTabId(`action-pane:${actionId}`, "action-pane"),
        kind:
          kind === "browser"
            ? "browser"
            : kind === "terminal"
              ? "terminal"
              : "plugin-panel",
        label: boundedTabLabel(
          marker.dataset.threadActionPaneTitle ?? action.label,
          "Action",
        ),
        closable: true,
        relaunchActionId: actionId,
      },
    });
  }
  return result;
}

function longestTextNode(element: HTMLElement): string {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let best = "";
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.textContent?.trim().replace(/\s+/g, " ") ?? "";
    if (text.length > best.length) best = text;
  }
  return best;
}

function discoverLauncherActions(): ActionDescriptor[] {
  if (activeThreadHeaderRow() === null) return [];
  const launcher = visibleElement<HTMLElement>(NEW_TAB_ACTIONS_SELECTOR);
  if (launcher === null) return [];
  return uniqueActions(
    Array.from(launcher.querySelectorAll<HTMLButtonElement>("button[id]")).map(
      (button) => ({ id: button.id, label: longestTextNode(button) }),
    ),
  );
}

function choosePanelChrome(): HTMLElement | null {
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>(PANEL_CHROME_SELECTOR),
  );
  return (
    rows.find(
      (row) => row.closest("aside")?.getAttribute("aria-hidden") !== "true",
    ) ??
    rows[0] ??
    null
  );
}

function chooseNativeTabStrip(): HTMLElement | null {
  const chrome = choosePanelChrome();
  return chrome?.querySelector<HTMLElement>(NATIVE_TAB_STRIP_SELECTOR) ?? null;
}

function readNativeTabs(): NativeTab[] {
  const content = chooseNativeTabStrip()?.querySelector<HTMLElement>(
    NATIVE_TAB_CONTENT_SELECTOR,
  );
  if (content === null || content === undefined) return [];
  const tabs: NativeTab[] = [];
  for (const child of Array.from(content.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const selectButton = child.querySelector<HTMLButtonElement>(
      'button[aria-pressed="true"], button[aria-pressed="false"]',
    );
    const pill = selectButton?.parentElement;
    if (selectButton === null || !(pill instanceof HTMLElement)) continue;
    const titledLabel = Array.from(
      selectButton.querySelectorAll<HTMLElement>("span[title]"),
    ).at(-1);
    const label = boundedTabLabel(
      titledLabel?.textContent ?? longestTextNode(selectButton),
      "Tab",
    );
    const firstChild = selectButton.firstElementChild;
    tabs.push({
      active: selectButton.getAttribute("aria-pressed") === "true",
      closeButton: child.querySelector<HTMLButtonElement>(
        "button[data-tab-pill-close]",
      ),
      icon:
        firstChild instanceof Element && firstChild !== titledLabel
          ? firstChild
          : null,
      label,
      pill,
      selectButton,
      wrapper: child,
    });
  }
  return tabs;
}

function nativeTabsFingerprint(tabs: readonly NativeTab[]): string {
  return tabs
    .map(
      (tab) =>
        `${tab.label}\u0000${tab.active}\u0000${tab.closeButton !== null}`,
    )
    .join("\u0001");
}

function pairTabs(
  snapshot: TabsSnapshot | null,
  nativeTabs: readonly NativeTab[],
  actions: readonly ActionDescriptor[],
  previous: readonly MirroredTab[] = [],
): MirroredTab[] {
  if (snapshot === null) return [];
  const summaries = displayableTabs(snapshot.tabs);
  const unusedNative = new Set(nativeTabs.map((_native, index) => index));
  const previousNative = new Map(
    previous.flatMap((mirror) =>
      mirror.native === null
        ? []
        : [[mirror.summary.id, mirror.native] as const],
    ),
  );
  const mirrors = summaries.map((summary): MirroredTab => {
    const remembered = previousNative.get(summary.id);
    if (remembered !== undefined) {
      const rememberedIndex = nativeTabs.findIndex(
        (native) => native.wrapper === remembered.wrapper,
      );
      if (unusedNative.delete(rememberedIndex)) {
        return { summary, native: nativeTabs[rememberedIndex] ?? null };
      }
    }
    const exactIndex = nativeTabs.findIndex(
      (native, index) =>
        unusedNative.has(index) && nativeLabelMatchesTab(summary, native.label),
    );
    if (exactIndex === -1) return { summary, native: null };
    unusedNative.delete(exactIndex);
    return { summary, native: nativeTabs[exactIndex] ?? null };
  });

  // A native Action can replace New Tab before the server snapshot arrives.
  // Keep that just-opened tab visible until the mutation-triggered refresh
  // catches up, without allowing stale native order to overwrite server order.
  for (const nativeIndex of unusedNative) {
    const native = nativeTabs[nativeIndex];
    if (native === undefined) continue;
    const normalizedLabel = compactActionLabel(
      native.label,
    ).toLocaleLowerCase();
    const action = actions.find(
      (candidate) =>
        compactActionLabel(candidate.label).toLocaleLowerCase() ===
        normalizedLabel,
    );
    const lowerLabel = native.label.toLocaleLowerCase();
    const inferredKind: TabKind = lowerLabel.includes("terminal")
      ? "terminal"
      : lowerLabel.includes("browser")
        ? "browser"
        : lowerLabel === "new tab"
          ? "new-tab"
          : "plugin-panel";
    mirrors.push({
      native,
      summary: {
        id: boundedTabId(
          `native:${nativeIndex}:${action?.id ?? native.label}`,
          `native:${nativeIndex}`,
        ),
        kind: inferredKind,
        label: boundedTabLabel(native.label, "Tab"),
        closable: native.closeButton !== null,
        relaunchActionId:
          action?.id ??
          (inferredKind === "terminal"
            ? "file-search-result-start-terminal"
            : inferredKind === "browser"
              ? "file-search-result-open-browser"
              : null),
      },
    });
  }
  return mirrors;
}

function cloneTabIcon(mirror: MirroredTab): Node {
  return (
    mirror.native?.icon?.cloneNode(true) ?? fallbackTabIcon(mirror.summary)
  );
}

function buttonWithAriaPrefix(
  prefix: string,
  preferredScope?: ParentNode,
): HTMLButtonElement | null {
  const matches = (scope: ParentNode): HTMLButtonElement | null =>
    Array.from(
      scope.querySelectorAll<HTMLButtonElement>("button[aria-label]"),
    ).find(
      (button) =>
        button.getAttribute("aria-label")?.startsWith(prefix) === true &&
        isVisible(button),
    ) ?? null;
  return (preferredScope ? matches(preferredScope) : null) ?? matches(document);
}

function actionButton(action: ActionDescriptor): HTMLButtonElement | null {
  const launcher = visibleElement<HTMLElement>(NEW_TAB_ACTIONS_SELECTOR);
  if (launcher === null) return null;
  const buttons = Array.from(
    launcher.querySelectorAll<HTMLButtonElement>("button[id]"),
  );
  const exact = buttons.find(
    (button) => button.id === action.id && isVisible(button),
  );
  if (exact !== undefined) return exact;
  const wanted = compactActionLabel(action.label).toLocaleLowerCase();
  return (
    buttons.find(
      (button) =>
        isVisible(button) &&
        compactActionLabel(longestTextNode(button)).toLocaleLowerCase() ===
          wanted,
    ) ?? null
  );
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      // The timer and abort listener disarm one another before settling.
      // oxlint-disable-next-line promise/no-multiple-resolved
      resolve();
    };
    const timer = window.setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}

async function waitFor<T>(
  read: () => T | null,
  signal: AbortSignal,
): Promise<T | null> {
  const deadline = Date.now() + ELEMENT_WAIT_TIMEOUT_MS;
  while (!signal.aborted && Date.now() < deadline) {
    const value = read();
    if (value !== null) return value;
    await abortableDelay(ELEMENT_WAIT_STEP_MS, signal);
  }
  return null;
}

async function focusPane(
  pane: HTMLElement | null,
  signal: AbortSignal,
): Promise<void> {
  if (pane === null || pane.dataset.focused === "true") return;
  const EventConstructor = window.PointerEvent ?? window.MouseEvent;
  const rect = pane.getBoundingClientRect();
  pane.dispatchEvent(
    new EventConstructor("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: rect.left + 8,
      clientY: rect.top + 8,
    }),
  );
  await waitFor(() => (pane.dataset.focused === "true" ? pane : null), signal);
  await abortableDelay(ELEMENT_WAIT_STEP_MS, signal);
}

async function callRpc<T>(
  method: "closeTab" | "listTabs" | "reorderTabs",
  input: Record<string, string>,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(`${RPC_BASE}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
    signal,
  });
  const envelope = (await response.json()) as RpcEnvelope<T>;
  if (!response.ok || !envelope.ok || envelope.result === undefined) {
    throw new Error(envelope.error?.message ?? `HTTP ${response.status}`);
  }
  return envelope.result;
}

function makeDropOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.className = "action-topbar__drop-overlay";
  const label = document.createElement("span");
  label.className = "action-topbar__drop-label";
  overlay.append(label);
  document.body.append(overlay);
  return overlay;
}

function makeDragGhost(mirror: MirroredTab): HTMLDivElement {
  const ghost = document.createElement("div");
  ghost.className = "action-topbar__drag-ghost";
  ghost.append(
    cloneTabIcon(mirror),
    document.createTextNode(mirror.native?.label ?? mirror.summary.label),
  );
  document.body.append(ghost);
  return ghost;
}

function positionPaneOverlay(
  overlay: HTMLDivElement,
  pane: HTMLElement | null,
  label: string,
): void {
  if (pane === null) {
    overlay.hidden = true;
    return;
  }
  const rect = pane.getBoundingClientRect();
  overlay.hidden = false;
  overlay.style.left = `${rect.left + 6}px`;
  overlay.style.top = `${rect.top + 6}px`;
  overlay.style.width = `${Math.max(0, rect.width - 12)}px`;
  overlay.style.height = `${Math.max(0, rect.height - 12)}px`;
  const text = overlay.firstElementChild;
  if (text instanceof HTMLElement) text.textContent = label;
}

function paneAt(
  clientX: number,
  clientY: number,
  source: MirroredTab,
): HTMLElement | null {
  if (
    source.summary.relaunchActionId === null &&
    source.summary.kind !== "new-tab"
  ) {
    return null;
  }
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    if (!(element instanceof HTMLElement)) continue;
    const pane = element.closest<HTMLElement>(PANE_SELECTOR);
    if (
      pane !== null &&
      pane.dataset.focused !== "true" &&
      pane.getAttribute("aria-hidden") !== "true" &&
      threadHeaderRowIn(pane) !== null
    ) {
      return pane;
    }
  }
  return null;
}

function swallowNextClick(): () => void {
  let timer: number | null = null;
  const cleanup = (): void => {
    window.removeEventListener("click", swallow, true);
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };
  const swallow = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
    cleanup();
  };
  window.addEventListener("click", swallow, true);
  timer = window.setTimeout(cleanup, 300);
  return cleanup;
}

function isRelevantMutation(record: MutationRecord): boolean {
  const target =
    record.target instanceof Element
      ? record.target
      : record.target.parentElement;
  if (
    target === null ||
    target.closest(".action-topbar__launcher") !== null ||
    target.closest(TOPBAR_ROOT_SELECTOR) !== null
  ) {
    return false;
  }
  const selectors = `${HEADER_ACTIONS_SELECTOR}, ${PANEL_CHROME_SELECTOR}, ${NATIVE_TAB_STRIP_SELECTOR}, ${NEW_TAB_ACTIONS_SELECTOR}, ${PANE_SELECTOR}`;
  if (target.closest(selectors) !== null) return true;
  return Array.from(record.addedNodes).some(
    (node) =>
      node instanceof Element &&
      (node.matches(selectors) || node.querySelector(selectors) !== null),
  );
}

export function mountActionTopbar(
  signal: AbortSignal,
  beginThreadActionSplitDrag?: BeginThreadActionSplitDrag,
): () => void {
  const live = document.createElement("span");
  live.className = "action-topbar__live";
  live.setAttribute("aria-live", "polite");
  document.body.append(live);

  let actions = initialActionCatalog(
    (() => {
      try {
        return localStorage.getItem(ACTION_CATALOG_STORAGE_KEY);
      } catch {
        return null;
      }
    })(),
  );
  let actionsFingerprint = catalogFingerprint(actions);
  let tabsSnapshot: TabsSnapshot | null = null;
  let snapshotThreadId: string | null = null;
  let loadingThreadId: string | null = null;
  let loadSerial = 0;
  let currentMirrors: MirroredTab[] = [];
  let currentNativeFingerprint = "";
  let topbar: TopbarElements | null = null;
  let topbarResizeObserver: ResizeObserver | null = null;
  let launcher: LauncherElements | null = null;
  let launcherOptions: LauncherOption[] = [];
  let launcherSelectedIndex = 0;
  let launcherQuery = "";
  let launcherError: string | null = null;
  let topbarDrag: TopbarDragState | null = null;
  let clearSwallowedClick: (() => void) | null = null;
  let reconcileFrame: number | null = null;
  let disposed = false;
  const feedbackTimers = new Set<number>();
  const hiddenNativeStrips = new Set<HTMLElement>();

  const announce = (message: string): void => {
    live.textContent = "";
    window.requestAnimationFrame(() => {
      if (!disposed) live.textContent = message;
    });
  };

  const saveActions = (): void => {
    try {
      localStorage.setItem(
        ACTION_CATALOG_STORAGE_KEY,
        serializeActionCatalog(actions),
      );
    } catch {
      // Learning the launcher inventory is an optimization.
    }
  };

  const positionLauncher = (): void => {
    if (launcher === null || topbar === null) return;
    const anchor = topbar.trigger.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.max(
      8,
      Math.min(anchor.left, window.innerWidth - width - 8),
    );
    const measuredHeight = launcher.popover.offsetHeight || 320;
    const opensAbove = anchor.bottom + 6 + measuredHeight > window.innerHeight;
    launcher.popover.style.width = `${width}px`;
    launcher.popover.style.left = `${left}px`;
    launcher.popover.style.top = opensAbove
      ? `${Math.max(8, anchor.top - measuredHeight - 6)}px`
      : `${anchor.bottom + 6}px`;
  };

  const closeLauncher = (restoreFocus = false): void => {
    if (launcher === null) return;
    launcher.popover.remove();
    launcher = null;
    launcherOptions = [];
    launcherQuery = "";
    launcherSelectedIndex = 0;
    launcherError = null;
    topbar?.trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) topbar?.trigger.focus();
  };

  const restoreNativeStrips = (): void => {
    for (const strip of hiddenNativeStrips) {
      delete strip.dataset.actionTopbarNativeStrip;
    }
    hiddenNativeStrips.clear();
  };

  const removeTopbar = (): void => {
    closeLauncher(false);
    topbarResizeObserver?.disconnect();
    topbarResizeObserver = null;
    if (topbar === null) return;
    delete topbar.center.dataset.actionTopbarCenter;
    if (topbar.titleGroup !== null) {
      delete topbar.titleGroup.dataset.actionTopbarTitleGroup;
    }
    topbar.root.remove();
    topbar = null;
  };

  const createTopbar = (row: HTMLElement): TopbarElements | null => {
    const center = row.firstElementChild;
    if (!(center instanceof HTMLElement)) return null;
    const titleGroup =
      center.firstElementChild instanceof HTMLElement
        ? center.firstElementChild
        : null;
    const root = document.createElement("nav");
    root.className = "action-topbar";
    root.dataset.actionTopbarRoot = "";
    root.setAttribute("aria-label", "Open panel tabs");
    const tabs = document.createElement("div");
    tabs.className = "action-topbar__tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Open panel tabs");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "action-topbar__trigger";
    trigger.title = "Search tabs and actions";
    trigger.setAttribute("aria-label", "Search open tabs and actions");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.append(
      createLineIcon("plus", "action-topbar__trigger-icon") ??
        createFallbackGlyph("+", "action-topbar__trigger-icon"),
    );
    trigger.addEventListener("click", () => {
      if (launcher === null) openLauncher();
      else closeLauncher(true);
    });
    root.append(tabs, trigger);
    center.dataset.actionTopbarCenter = "";
    if (titleGroup !== null) titleGroup.dataset.actionTopbarTitleGroup = "";
    center.append(root);
    const elements = { center, root, tabs, titleGroup, trigger };
    topbarResizeObserver = new ResizeObserver(() => {
      const width = root.getBoundingClientRect().width;
      root.toggleAttribute("data-action-topbar-compact", width < 280);
      root.toggleAttribute("data-action-topbar-minimal", width < 112);
    });
    topbarResizeObserver.observe(root);
    return elements;
  };

  const ensureTopbar = (row: HTMLElement): void => {
    if (
      topbar !== null &&
      topbar.root.isConnected &&
      topbar.root.closest(HEADER_ROW_SELECTOR) === row
    ) {
      return;
    }
    endTopbarDrag(false);
    removeTopbar();
    topbar = createTopbar(row);
  };

  const nativeNewTabButton = (): HTMLButtonElement | null => {
    const chrome = choosePanelChrome();
    return chrome === null
      ? null
      : buttonWithAriaPrefix("Open new tab", chrome);
  };

  const ensurePanel = async (pane: HTMLElement | null): Promise<boolean> => {
    await focusPane(pane, signal);
    scheduleReconcile();
    if (visibleElement<HTMLElement>(PANEL_CHROME_SELECTOR) === null) {
      buttonWithAriaPrefix("Show right panel", pane ?? undefined)?.click();
      if (
        (await waitFor(
          () => visibleElement<HTMLElement>(PANEL_CHROME_SELECTOR),
          signal,
        )) === null
      ) {
        return false;
      }
    }
    await abortableDelay(ELEMENT_WAIT_STEP_MS, signal);
    return nativeNewTabButton() !== null;
  };

  const ensureNativeNewTab = async (
    pane: HTMLElement | null,
  ): Promise<boolean> => {
    if (visibleElement<HTMLElement>(NEW_TAB_ACTIONS_SELECTOR) !== null)
      return true;
    if (!(await ensurePanel(pane))) return false;
    const nativeTrigger = nativeNewTabButton();
    if (nativeTrigger === null) return false;
    nativeTrigger.click();
    return (
      (await waitFor(
        () => visibleElement<HTMLElement>(NEW_TAB_ACTIONS_SELECTOR),
        signal,
      )) !== null
    );
  };

  const activateTab = async (tabId: string): Promise<boolean> => {
    const mirror = mainWorkspaceMirrors(currentMirrors, actions).find(
      (candidate) => candidate.summary.id === tabId,
    );
    const actionPane = mirror === undefined ? null : mainActionPane(mirror);
    if (actionPane !== null) {
      await focusPane(actionPane, signal);
      scheduleReconcile();
      return actionPane.dataset.focused === "true";
    }
    if (mirror?.summary.kind === "terminal") return false;
    if (!(await ensurePanel(null))) return false;
    syncNativeTabs();
    const native = currentMirrors.find(
      (mirror) => mirror.summary.id === tabId,
    )?.native;
    if (native === null || native === undefined) return false;
    native.selectButton.click();
    return true;
  };

  const closeTab = async (tabId: string): Promise<boolean> => {
    const mirror = mainWorkspaceMirrors(currentMirrors, actions).find(
      (candidate) => candidate.summary.id === tabId,
    );
    if (mirror === undefined) return false;
    const actionPane = mainActionPane(mirror);
    const closePaneButton = actionPane?.querySelector<HTMLButtonElement>(
      'button[aria-label="Close pane"]',
    );
    if (closePaneButton !== null && closePaneButton !== undefined) {
      closePaneButton.click();
      const timer = window.setTimeout(() => {
        feedbackTimers.delete(timer);
        if (!disposed) buttonWithAriaPrefix("Hide right panel")?.click();
      }, 180);
      feedbackTimers.add(timer);
    }
    const threadId = snapshotThreadId ?? currentThreadId();
    if (threadId === null) return closePaneButton !== null;
    const terminalId = actionPane?.querySelector<HTMLElement>(
      "[data-app-terminal]",
    )?.dataset.terminalId;
    try {
      const value = await callRpc<unknown>(
        "closeTab",
        {
          tabId,
          threadId,
          ...(terminalId === undefined ? {} : { terminalId }),
        },
        signal,
      );
      const parsed = parseTabsSnapshot(value);
      if (parsed === null || currentThreadId() !== threadId) {
        throw new Error("Invalid closed tab state");
      }
      tabsSnapshot = parsed;
      snapshotThreadId = threadId;
      syncNativeTabs();
      return true;
    } catch {
      const mountedCloseButton = mirror.native?.closeButton;
      if (mountedCloseButton !== null && mountedCloseButton !== undefined) {
        mountedCloseButton.click();
        return true;
      }
      return closePaneButton !== null;
    }
  };

  const launchAction = async (
    action: ActionDescriptor,
    pane: HTMLElement | null,
  ): Promise<boolean> => {
    await focusPane(pane, signal);
    let button = actionButton(action);
    if (button === null) {
      if (!(await ensureNativeNewTab(pane))) return false;
      button = await waitFor(() => actionButton(action), signal);
    }
    if (button === null || signal.aborted) return false;
    button.click();
    return true;
  };

  const requestLaunch = async (
    action: ActionDescriptor,
    pane: HTMLElement | null,
  ): Promise<void> => {
    const feedbackTrigger = topbar?.trigger ?? null;
    if (feedbackTrigger !== null) feedbackTrigger.dataset.feedback = "loading";
    const opened = await launchAction(action, pane).catch(() => false);
    if (signal.aborted) return;
    const liveTrigger = topbar?.trigger ?? feedbackTrigger;
    if (liveTrigger !== null) {
      liveTrigger.dataset.feedback = opened ? "success" : "error";
      const timer = window.setTimeout(
        () => {
          feedbackTimers.delete(timer);
          if (!disposed && liveTrigger.isConnected) {
            liveTrigger.dataset.feedback = "idle";
          }
        },
        opened ? 800 : 2_000,
      );
      feedbackTimers.add(timer);
    }
    if (opened) {
      announce(`${action.label} opened.`);
      scheduleReconcile();
      return;
    }
    launcherError = `${action.label} is not available for this thread.`;
    openLauncher();
    renderLauncher();
  };

  const chooseLauncherOption = (option: LauncherOption): void => {
    if (option.kind === "action") return;
    closeLauncher(true);
    void activateTab(option.targetId).then((activated) => {
      if (!activated) announce(`${option.label} is unavailable.`);
      return undefined;
    });
  };

  const applyLauncherSelection = (nextIndex: number): void => {
    if (launcher === null || launcherOptions.length === 0) return;
    launcherSelectedIndex =
      (nextIndex + launcherOptions.length) % launcherOptions.length;
    for (const [index, row] of Array.from(
      launcher.list.querySelectorAll<HTMLElement>('[role="option"]'),
    ).entries()) {
      row.setAttribute(
        "aria-selected",
        String(index === launcherSelectedIndex),
      );
    }
    launcher.input.setAttribute(
      "aria-activedescendant",
      `action-topbar-option-${launcherSelectedIndex}`,
    );
    launcher.list
      .querySelector<HTMLElement>(
        `#action-topbar-option-${launcherSelectedIndex}`,
      )
      ?.scrollIntoView({ block: "nearest" });
  };

  const launcherIcon = (option: LauncherOption): Node => {
    if (option.kind === "tab") {
      const mirror = mainWorkspaceMirrors(currentMirrors, actions).find(
        (candidate) => candidate.summary.id === option.targetId,
      );
      if (mirror !== undefined) return cloneTabIcon(mirror);
    }
    const action = actions.find(
      (candidate) => candidate.id === option.targetId,
    );
    return action === undefined
      ? createFallbackGlyph(
          option.label.slice(0, 1).toUpperCase(),
          "action-topbar__launcher-glyph",
        )
      : actionIconNode(action);
  };

  const renderLauncher = (): void => {
    if (launcher === null) return;
    launcherOptions = buildLauncherOptions(
      mainWorkspaceMirrors(currentMirrors, actions).map(
        (mirror) => mirror.summary,
      ),
      actions,
      launcherQuery,
    );
    launcherSelectedIndex = Math.min(
      launcherSelectedIndex,
      Math.max(0, launcherOptions.length - 1),
    );
    launcher.input.setAttribute(
      "aria-expanded",
      String(launcherOptions.length > 0),
    );
    launcher.input.setAttribute(
      "aria-activedescendant",
      launcherOptions.length > 0
        ? `action-topbar-option-${launcherSelectedIndex}`
        : "",
    );
    launcher.status.textContent = launcherError ?? "";
    launcher.status.hidden = launcherError === null;
    const fragment = document.createDocumentFragment();
    const heading = document.createElement("div");
    heading.className = "action-topbar__launcher-heading";
    heading.textContent = launcherQuery.trim() ? "Results" : "Actions";
    fragment.append(heading);
    if (launcherOptions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "action-topbar__launcher-empty";
      empty.textContent = "No matching tabs or actions";
      fragment.append(empty);
    } else {
      launcherOptions.forEach((option, index) => {
        const row = document.createElement("button");
        row.type = "button";
        row.id = `action-topbar-option-${index}`;
        row.className = "action-topbar__launcher-option";
        if (option.kind === "action") {
          row.dataset.actionTopbarAction = "";
          row.title = "Drag to a workspace pane";
        }
        row.setAttribute("role", "option");
        row.setAttribute(
          "aria-selected",
          String(index === launcherSelectedIndex),
        );
        const icon = document.createElement("span");
        icon.className = "action-topbar__launcher-icon";
        icon.append(launcherIcon(option));
        const label = document.createElement("span");
        label.className = "action-topbar__launcher-label";
        label.textContent = option.label;
        const detail = document.createElement("span");
        detail.className = "action-topbar__launcher-detail";
        detail.textContent = option.kind === "action" ? "Drag" : option.detail;
        row.append(icon, label, detail);
        row.addEventListener("pointermove", () =>
          applyLauncherSelection(index),
        );
        row.addEventListener("pointerdown", (event) => {
          if (
            option.kind !== "action" ||
            event.button !== 0 ||
            beginThreadActionSplitDrag === undefined
          ) {
            return;
          }
          const threadId = currentThreadId();
          if (threadId === null) return;
          const started = beginThreadActionSplitDrag({
            actionId: option.targetId,
            threadId,
            source: row,
            startX: event.clientX,
            startY: event.clientY,
          });
          row.dataset.actionTopbarDragState = started
            ? "started"
            : "unavailable";
          if (!started) {
            announce("Action split dragging is unavailable here.");
            return;
          }
          const pointerId = event.pointerId;
          tryCapturePointer(row, pointerId);
          const finish = () => {
            window.removeEventListener("pointerup", finish);
            window.removeEventListener("pointercancel", finish);
            tryReleasePointer(row, pointerId);
            closeLauncher(false);
          };
          window.addEventListener("pointerup", finish, {
            once: true,
            signal,
          });
          window.addEventListener("pointercancel", finish, {
            once: true,
            signal,
          });
        });
        row.addEventListener("click", (event) => {
          if (option.kind === "action") {
            event.preventDefault();
            return;
          }
          chooseLauncherOption(option);
        });
        fragment.append(row);
      });
    }
    launcher.list.replaceChildren(fragment);
    positionLauncher();
  };

  const createLauncher = (): LauncherElements => {
    const popover = document.createElement("div");
    popover.className = "action-topbar__launcher";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Open a panel tab");
    const form = document.createElement("form");
    form.className = "action-topbar__launcher-form";
    const inputWrap = document.createElement("div");
    inputWrap.className = "action-topbar__launcher-input-wrap";
    const searchGlyph =
      createLineIcon("search", "action-topbar__search-glyph") ??
      createFallbackGlyph("?", "action-topbar__search-glyph");
    const input = document.createElement("input");
    input.className = "action-topbar__launcher-input";
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "Search open tabs or actions…";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-label", "Search open tabs or actions");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", LAUNCHER_LISTBOX_ID);
    inputWrap.append(searchGlyph, input);
    const status = document.createElement("div");
    status.className = "action-topbar__launcher-status";
    status.setAttribute("role", "status");
    status.hidden = true;
    const list = document.createElement("div");
    list.className = "action-topbar__launcher-list";
    list.id = LAUNCHER_LISTBOX_ID;
    list.setAttribute("role", "listbox");
    form.append(inputWrap, status, list);
    popover.append(form);
    input.addEventListener("input", () => {
      launcherQuery = input.value;
      launcherSelectedIndex = 0;
      launcherError = null;
      renderLauncher();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        applyLauncherSelection(
          launcherSelectedIndex + (event.key === "ArrowDown" ? 1 : -1),
        );
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const option = launcherOptions[launcherSelectedIndex];
        if (option !== undefined) chooseLauncherOption(option);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeLauncher(true);
      }
    });
    form.addEventListener("submit", (event) => event.preventDefault());
    return { input, list, popover, status };
  };

  function openLauncher(): void {
    if (launcher !== null || topbar === null) return;
    launcherQuery = "";
    launcherSelectedIndex = 0;
    launcher = createLauncher();
    document.body.append(launcher.popover);
    topbar.trigger.setAttribute("aria-expanded", "true");
    renderLauncher();
    window.requestAnimationFrame(() => launcher?.input.focus());
  }

  const loadTabs = async (threadId: string): Promise<void> => {
    if (loadingThreadId === threadId) return;
    loadingThreadId = threadId;
    const serial = ++loadSerial;
    try {
      const value = await callRpc<unknown>("listTabs", { threadId }, signal);
      const parsed = parseTabsSnapshot(value);
      if (
        parsed !== null &&
        serial === loadSerial &&
        currentThreadId() === threadId
      ) {
        tabsSnapshot = parsed;
        snapshotThreadId = threadId;
        syncNativeTabs();
      }
    } catch {
      if (!signal.aborted && serial === loadSerial) {
        announce("Could not read panel tabs.");
      }
    } finally {
      if (serial === loadSerial) loadingThreadId = null;
    }
  };

  const requestReorder = async (
    activeTabId: string,
    overTabId: string,
  ): Promise<void> => {
    const threadId = snapshotThreadId ?? currentThreadId();
    if (threadId === null || activeTabId === overTabId) return;
    try {
      const value = await callRpc<unknown>(
        "reorderTabs",
        { activeTabId, overTabId, threadId },
        signal,
      );
      const parsed = parseTabsSnapshot(value);
      if (parsed === null || currentThreadId() !== threadId) {
        throw new Error("Invalid reordered tab state");
      }
      tabsSnapshot = parsed;
      snapshotThreadId = threadId;
      syncNativeTabs();
      announce("Tab order updated.");
    } catch {
      if (!signal.aborted) {
        announce("Could not reorder that tab.");
        void loadTabs(threadId);
      }
    }
  };

  const relaunchTabInPane = async (
    mirror: MirroredTab,
    pane: HTMLElement,
  ): Promise<void> => {
    if (mirror.summary.kind === "new-tab") {
      await focusPane(pane, signal);
      if (!(await ensurePanel(pane))) {
        announce("New tab is unavailable there.");
        return;
      }
      const nativeTrigger = nativeNewTabButton();
      if (nativeTrigger === null) {
        announce("New tab is unavailable there.");
        return;
      }
      nativeTrigger.click();
      return;
    }
    const actionId = mirror.summary.relaunchActionId;
    if (actionId === null) {
      announce("BB cannot move this file tab between thread panes.");
      return;
    }
    const action = actions.find((candidate) => candidate.id === actionId) ?? {
      id: actionId,
      label:
        mirror.summary.kind === "terminal"
          ? "Start terminal"
          : mirror.summary.kind === "browser"
            ? "Open browser"
            : mirror.summary.label,
    };
    await requestLaunch(action, pane);
  };

  const clearReorderTarget = (): void => {
    topbar?.tabs
      .querySelectorAll<HTMLElement>("[data-action-topbar-drop-target]")
      .forEach((element) => {
        delete element.dataset.actionTopbarDropTarget;
      });
  };

  const topbarTabAt = (clientX: number, clientY: number): string | null => {
    if (topbar === null) return null;
    for (const element of document.elementsFromPoint(clientX, clientY)) {
      if (!(element instanceof Element)) continue;
      const button = element.closest<HTMLButtonElement>(
        "button[data-action-topbar-tab-id]",
      );
      if (button !== null && topbar.tabs.contains(button)) {
        return button.dataset.actionTopbarTabId ?? null;
      }
    }
    return null;
  };

  const endTopbarDrag = (drop: boolean): void => {
    const current = topbarDrag;
    if (current === null) return;
    window.removeEventListener("pointermove", handleTopbarDragMove);
    window.removeEventListener("pointerup", handleTopbarDragUp);
    window.removeEventListener("pointercancel", handleTopbarDragCancel);
    current.ghost?.remove();
    current.overlay?.remove();
    current.sourceButton.style.removeProperty("opacity");
    clearReorderTarget();
    document.body.classList.remove("action-topbar-is-dragging");
    topbarDrag = null;
    if (!current.engaged) return;
    clearSwallowedClick?.();
    clearSwallowedClick = swallowNextClick();
    if (drop && current.reorderTargetId !== null) {
      void requestReorder(current.source.summary.id, current.reorderTargetId);
      return;
    }
    if (drop && current.targetPane !== null) {
      void relaunchTabInPane(current.source, current.targetPane);
      return;
    }
    if (
      drop &&
      current.source.summary.relaunchActionId === null &&
      current.source.summary.kind !== "new-tab"
    ) {
      announce("That file tab stays with its current thread.");
    }
  };

  const handleTopbarDragMove = (event: PointerEvent): void => {
    if (topbarDrag === null) return;
    const hoveredTabId = topbarTabAt(event.clientX, event.clientY);
    const reorderTargetId =
      hoveredTabId !== topbarDrag.source.summary.id ? hoveredTabId : null;
    const targetPane =
      reorderTargetId === null
        ? paneAt(event.clientX, event.clientY, topbarDrag.source)
        : null;
    if (!topbarDrag.engaged) {
      if (
        Math.hypot(
          event.clientX - topbarDrag.startX,
          event.clientY - topbarDrag.startY,
        ) < POINTER_DRAG_DISTANCE_PX
      ) {
        return;
      }
      topbarDrag.engaged = true;
      topbarDrag.ghost = makeDragGhost(topbarDrag.source);
      topbarDrag.overlay = makeDropOverlay();
      topbarDrag.sourceButton.style.opacity = "0.42";
      document.body.classList.add("action-topbar-is-dragging");
    }
    event.preventDefault();
    clearReorderTarget();
    topbarDrag.reorderTargetId = reorderTargetId;
    topbarDrag.targetPane = targetPane;
    if (reorderTargetId !== null && topbar !== null) {
      for (const button of topbar.tabs.querySelectorAll<HTMLButtonElement>(
        "button[data-action-topbar-tab-id]",
      )) {
        if (button.dataset.actionTopbarTabId === reorderTargetId) {
          button.dataset.actionTopbarDropTarget = "";
          break;
        }
      }
    }
    if (topbarDrag.ghost !== null) {
      topbarDrag.ghost.style.left = `${event.clientX + 12}px`;
      topbarDrag.ghost.style.top = `${event.clientY + 8}px`;
    }
    if (topbarDrag.overlay !== null) {
      positionPaneOverlay(
        topbarDrag.overlay,
        targetPane,
        `Open ${topbarDrag.source.summary.label} here`,
      );
    }
  };

  const handleTopbarDragUp = (): void => endTopbarDrag(true);
  const handleTopbarDragCancel = (): void => endTopbarDrag(false);

  const beginTopbarDrag = (
    event: PointerEvent,
    mirror: MirroredTab,
    sourceButton: HTMLButtonElement,
  ): void => {
    if (event.button !== 0) return;
    endTopbarDrag(false);
    topbarDrag = {
      engaged: false,
      ghost: null,
      overlay: null,
      reorderTargetId: null,
      source: mirror,
      sourceButton,
      startX: event.clientX,
      startY: event.clientY,
      targetPane: null,
    };
    window.addEventListener("pointermove", handleTopbarDragMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handleTopbarDragUp, { once: true });
    window.addEventListener("pointercancel", handleTopbarDragCancel, {
      once: true,
    });
  };

  const handleTopbarTabKeydown = (
    event: KeyboardEvent,
    source: HTMLButtonElement,
  ): void => {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    const buttons = Array.from(
      topbar?.tabs.querySelectorAll<HTMLButtonElement>(
        "button[data-action-topbar-tab-id]",
      ) ?? [],
    );
    const sourceIndex = buttons.indexOf(source);
    if (sourceIndex === -1 || buttons.length === 0) return;
    event.preventDefault();
    const target =
      event.key === "Home"
        ? buttons[0]
        : event.key === "End"
          ? buttons.at(-1)
          : buttons[
              (sourceIndex +
                (event.key === "ArrowRight" ? 1 : -1) +
                buttons.length) %
                buttons.length
            ];
    const tabId = target?.dataset.actionTopbarTabId;
    if (target === undefined || tabId === undefined) return;
    target.focus();
    void activateTab(tabId).then(() => undefined);
  };

  const renderTopbar = (): void => {
    if (topbar === null) return;
    const focusedTabId =
      document.activeElement instanceof HTMLButtonElement &&
      topbar.tabs.contains(document.activeElement)
        ? document.activeElement.dataset.actionTopbarTabId
        : undefined;
    const fragment = document.createDocumentFragment();
    for (const mirror of mainWorkspaceMirrors(currentMirrors, actions)) {
      const actionPane = mainActionPane(mirror);
      const isActive =
        actionPane?.dataset.focused === "true" ||
        (actionPane === null && mirror.native?.active === true);
      const wrapper = document.createElement("div");
      wrapper.className = "action-topbar__tab";
      wrapper.dataset.active = String(isActive);
      const select = document.createElement("button");
      select.type = "button";
      select.className = "action-topbar__tab-button";
      select.dataset.actionTopbarTabId = mirror.summary.id;
      select.setAttribute("role", "tab");
      select.setAttribute("aria-selected", String(isActive));
      select.tabIndex = isActive ? 0 : -1;
      select.title = mirror.summary.label;
      const icon = document.createElement("span");
      icon.className = "action-topbar__tab-icon";
      icon.append(cloneTabIcon(mirror));
      const label = document.createElement("span");
      label.className = "action-topbar__tab-label";
      label.textContent = mirror.summary.label;
      select.append(icon, label);
      select.addEventListener("click", () => {
        void activateTab(mirror.summary.id).then((activated) => {
          if (!activated) announce(`${mirror.summary.label} is unavailable.`);
          return undefined;
        });
      });
      select.addEventListener("pointerdown", (event) => {
        beginTopbarDrag(event, mirror, select);
      });
      select.addEventListener("keydown", (event) => {
        handleTopbarTabKeydown(event, select);
      });
      if (mirror.summary.closable) {
        const close = document.createElement("button");
        close.type = "button";
        close.className = "action-topbar__tab-close";
        close.dataset.actionTopbarClose = "";
        close.title = `Close ${mirror.summary.label}`;
        close.setAttribute("aria-label", `Close ${mirror.summary.label}`);
        close.append(createFallbackGlyph("×", "action-topbar__close-glyph"));
        close.addEventListener("pointerdown", (event) =>
          event.stopPropagation(),
        );
        close.addEventListener("click", (event) => {
          event.stopPropagation();
          void closeTab(mirror.summary.id).then((closed) => {
            if (!closed) {
              announce(`${mirror.summary.label} cannot be closed right now.`);
            }
            return undefined;
          });
        });
        wrapper.append(close);
      }
      wrapper.append(select);
      fragment.append(wrapper);
    }
    topbar.tabs.replaceChildren(fragment);
    if (
      topbar.tabs.querySelector<HTMLButtonElement>(
        'button[data-action-topbar-tab-id][tabindex="0"]',
      ) === null
    ) {
      const first = topbar.tabs.querySelector<HTMLButtonElement>(
        "button[data-action-topbar-tab-id]",
      );
      if (first !== null) first.tabIndex = 0;
    }
    const active = topbar.tabs.querySelector<HTMLElement>(
      '.action-topbar__tab[data-active="true"]',
    );
    const focused =
      focusedTabId === undefined
        ? null
        : (Array.from(
            topbar.tabs.querySelectorAll<HTMLButtonElement>(
              "button[data-action-topbar-tab-id]",
            ),
          ).find(
            (button) => button.dataset.actionTopbarTabId === focusedTabId,
          ) ?? null);
    window.requestAnimationFrame(() => {
      if (focused?.isConnected) focused.focus();
      if (active?.isConnected) {
        active.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    });
  };

  const hideNativeTabStrip = (): void => {
    if (topbar === null) return;
    const strip = chooseNativeTabStrip();
    if (strip === null) return;
    strip.dataset.actionTopbarNativeStrip = "";
    hiddenNativeStrips.add(strip);
  };

  function syncNativeTabs(): void {
    const nativeTabs = readNativeTabs();
    currentNativeFingerprint = nativeTabsFingerprint(nativeTabs);
    currentMirrors = pairTabs(
      tabsSnapshot,
      nativeTabs,
      actions,
      currentMirrors,
    );
    hideNativeTabStrip();
    renderTopbar();
    renderLauncher();
  }

  const reconcile = (): void => {
    reconcileFrame = null;
    if (disposed || signal.aborted) return;
    const threadId = currentThreadId();
    const row = activeThreadHeaderRow();
    if (threadId === null || row === null) {
      endTopbarDrag(false);
      removeTopbar();
      restoreNativeStrips();
      return;
    }
    ensureTopbar(row);
    hideNativeTabStrip();
    if (threadId !== snapshotThreadId) {
      tabsSnapshot = null;
      snapshotThreadId = null;
      currentMirrors = [];
      renderTopbar();
      void loadTabs(threadId);
    }
    const discovered = discoverLauncherActions();
    const nextActions = applyDiscoveredCatalog(actions, discovered);
    const nextActionsFingerprint = catalogFingerprint(nextActions);
    if (nextActionsFingerprint !== actionsFingerprint) {
      actions = nextActions;
      actionsFingerprint = nextActionsFingerprint;
      saveActions();
      renderLauncher();
    }
    const nativeTabs = readNativeTabs();
    const nextNativeFingerprint = nativeTabsFingerprint(nativeTabs);
    if (nextNativeFingerprint !== currentNativeFingerprint) {
      syncNativeTabs();
      // Native order/title/count is the invalidation signal. Refresh once per
      // actual strip change instead of polling every connected BB window.
      if (tabsSnapshot !== null) void loadTabs(threadId);
    } else {
      hideNativeTabStrip();
      renderTopbar();
    }
    positionLauncher();
  };

  function scheduleReconcile(): void {
    if (reconcileFrame !== null || disposed) return;
    reconcileFrame = window.requestAnimationFrame(reconcile);
  }

  const documentPointerDown = (event: PointerEvent): void => {
    if (
      launcher !== null &&
      event.target instanceof Node &&
      !launcher.popover.contains(event.target) &&
      event.target !== topbar?.trigger
    ) {
      closeLauncher(false);
    }
  };
  document.addEventListener("pointerdown", documentPointerDown, true);
  const reposition = () => positionLauncher();
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);

  const observer = new MutationObserver((records) => {
    if (records.some(isRelevantMutation)) scheduleReconcile();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["data-focused", "aria-hidden", "aria-pressed"],
  });

  reconcile();

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    endTopbarDrag(false);
    clearSwallowedClick?.();
    clearSwallowedClick = null;
    for (const timer of feedbackTimers) window.clearTimeout(timer);
    feedbackTimers.clear();
    removeTopbar();
    restoreNativeStrips();
    document.removeEventListener("pointerdown", documentPointerDown, true);
    window.removeEventListener("resize", reposition);
    window.removeEventListener("scroll", reposition, true);
    if (reconcileFrame !== null) window.cancelAnimationFrame(reconcileFrame);
    live.remove();
  };
  signal.addEventListener("abort", dispose, { once: true });
  return dispose;
}
