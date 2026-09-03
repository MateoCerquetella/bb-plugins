import {
  formatResetCredits,
  formatResetTime,
  formatUsedPercent,
  providerStatusLabel,
  type ProviderUsage,
  type UsageSnapshot,
  type UsageWindow,
} from "./usage.ts";

import {
  normalizeCompactLimitOption,
  SIDEBAR_PROVIDER_IDS,
  type CompactLimitOption,
  type SidebarProviderId,
} from "./preferences.ts";
import { providerMark } from "./provider-marks.ts";
import {
  mergeLastKnownWindows,
  selectSidebarUsagePrimary,
  sidebarUsageDetailRows,
  sidebarUsagePrimaryAccessibleText,
  sidebarUsagePrimarySelectionSummary,
} from "./sidebar-usage.ts";

const ROOT_ATTRIBUTE = "data-usage-tracker-sidebar";
const CACHE_KEY = "bb:usage-tracker:sidebar:last-known";
const PREFERENCES_CACHE_KEY = "bb:usage-tracker:sidebar:enabled-providers";
const COMPACT_LIMIT_CACHE_KEY = "bb:usage-tracker:sidebar:compact-limit";
const AUTO_REFRESH_MS = 5 * 60_000;
const PREFERENCES_REFRESH_MS = 5_000;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DETAILS_ID_PREFIX = "usage-tracker-sidebar-details";

interface RpcEnvelope<T> {
  ok: boolean;
  result?: T;
  error?: { message?: string };
}

interface PreferencesResult {
  enabledProviderIds: SidebarProviderId[];
  compactLimit: CompactLimitOption;
}

interface ResetPrepareResult {
  outcome: "ready" | "unavailable" | "no-credit";
  confirmationToken?: string;
  expiresAtMs?: number;
  availableCount?: number;
  message?: string;
}

interface ResetConfirmation {
  confirmationToken: string;
  availableCount: number;
  expiresAtMs: number;
}

interface ResetMessage {
  kind: "info" | "success" | "error";
  text: string;
}

type ResetConsumptionOutcome =
  | "reset"
  | "nothingToReset"
  | "noCredit"
  | "alreadyRedeemed"
  | "confirmation-invalid"
  | "confirmation-expired";

type ResetRpcMethod = "prepareReset" | "consumeReset";

type SidebarFocusTarget =
  | { kind: "provider"; providerId: SidebarProviderId }
  | { kind: "close" }
  | { kind: "windows" }
  | { kind: "refresh" }
  | { kind: "reset" }
  | null;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function callResetRpc<T>(
  method: ResetRpcMethod,
  body: unknown,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(
    `/api/v1/plugins/usage-tracker/rpc/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal,
    },
  );
  const payload = (await response.json()) as RpcEnvelope<T>;
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new Error(payload.error?.message ?? "Usage reset is unavailable.");
  }
  return payload.result;
}

function providerGlyph(providerId: SidebarProviderId): SVGSVGElement {
  const mark = providerMark(providerId);
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", mark.viewBox);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  if (mark.fillRule !== undefined) svg.setAttribute("fill-rule", mark.fillRule);
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", mark.path);
  svg.append(path);
  return svg;
}

function refreshGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", "M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.7-2.5L20 11M4 13l2.2 4.5A7 7 0 0 0 18 15");
  svg.append(path);
  return svg;
}

function closeGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  const first = document.createElementNS(SVG_NAMESPACE, "path");
  first.setAttribute("d", "M7 7l10 10");
  const second = document.createElementNS(SVG_NAMESPACE, "path");
  second.setAttribute("d", "M17 7L7 17");
  svg.append(first, second);
  return svg;
}

function emptyProvider(providerId: SidebarProviderId): ProviderUsage {
  return {
    id: providerId,
    name:
      providerId === "codex"
        ? "Codex"
        : providerId === "claudeCode"
          ? "Claude Code"
          : "Antigravity",
    status: "error",
    accountEmail: null,
    planLabel: null,
    message: "Usage is loading.",
    windows: [],
  };
}

function readCachedSnapshot(): UsageSnapshot | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    if (
      value === null ||
      typeof value !== "object" ||
      !Array.isArray((value as Partial<UsageSnapshot>).providers)
    ) {
      return null;
    }
    return value as UsageSnapshot;
  } catch {
    return null;
  }
}

function cacheSnapshot(snapshot: UsageSnapshot): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage is an optimization. The live strip still works without it.
  }
}

function isSidebarProviderId(value: unknown): value is SidebarProviderId {
  return SIDEBAR_PROVIDER_IDS.some((providerId) => providerId === value);
}

function detailsId(providerId: string): string {
  return `${DETAILS_ID_PREFIX}-${providerId}`;
}

function activeSidebarFocusTarget(root: HTMLElement): SidebarFocusTarget {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  if (active.classList.contains("usage-tracker-sidebar__close")) {
    return { kind: "close" };
  }
  if (active.classList.contains("usage-tracker-sidebar__windows")) {
    return { kind: "windows" };
  }
  if (active.classList.contains("usage-tracker-sidebar__refresh")) {
    return { kind: "refresh" };
  }
  if (active.classList.contains("usage-tracker-sidebar__reset-action")) {
    return { kind: "reset" };
  }
  if (isSidebarProviderId(active.dataset.provider)) {
    return { kind: "provider", providerId: active.dataset.provider };
  }
  return null;
}

function focusSidebarTarget(
  root: HTMLElement,
  target: Exclude<SidebarFocusTarget, null>,
): boolean {
  let element: HTMLElement | null;
  switch (target.kind) {
    case "provider":
      element =
        Array.from(
          root.querySelectorAll<HTMLElement>(
            ".usage-tracker-sidebar__provider",
          ),
        ).find((candidate) => candidate.dataset.provider === target.providerId) ??
        null;
      break;
    case "close":
      element = root.querySelector<HTMLElement>(
        ".usage-tracker-sidebar__close",
      );
      break;
    case "windows":
      element = root.querySelector<HTMLElement>(
        ".usage-tracker-sidebar__windows",
      );
      break;
    case "refresh":
      element = root.querySelector<HTMLElement>(
        ".usage-tracker-sidebar__refresh",
      );
      break;
    case "reset":
      element = root.querySelector<HTMLElement>(
        ".usage-tracker-sidebar__reset-confirm",
      );
      if (element === null) {
        element = root.querySelector<HTMLElement>(
          ".usage-tracker-sidebar__reset-start",
        );
      }
      break;
  }
  element?.focus({ preventScroll: true });
  return element !== null && document.activeElement === element;
}

function readCachedProviderIds(): SidebarProviderId[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(PREFERENCES_CACHE_KEY) ?? "null",
    );
    if (
      !Array.isArray(value) ||
      value.some((providerId) => !isSidebarProviderId(providerId)) ||
      new Set(value).size !== value.length
    ) {
      return [...SIDEBAR_PROVIDER_IDS];
    }
    return SIDEBAR_PROVIDER_IDS.filter((providerId) =>
      value.includes(providerId),
    );
  } catch {
    return [...SIDEBAR_PROVIDER_IDS];
  }
}

function cacheProviderIds(providerIds: readonly SidebarProviderId[]): void {
  try {
    localStorage.setItem(PREFERENCES_CACHE_KEY, JSON.stringify(providerIds));
  } catch {
    // Storage is an optimization. Preferences are still refreshed live.
  }
}

function readCachedCompactLimit(): CompactLimitOption {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(COMPACT_LIMIT_CACHE_KEY) ?? "null",
    );
    return normalizeCompactLimitOption(value);
  } catch {
    return "Weekly";
  }
}

function cacheCompactLimit(compactLimit: CompactLimitOption): void {
  try {
    localStorage.setItem(COMPACT_LIMIT_CACHE_KEY, JSON.stringify(compactLimit));
  } catch {
    // Storage is an optimization. Preferences are still refreshed live.
  }
}

function mergeSnapshot(
  current: UsageSnapshot,
  previous: UsageSnapshot | null,
): UsageSnapshot {
  return {
    ...current,
    providers: current.providers.map((provider) =>
      mergeLastKnownWindows(
        provider,
        previous?.providers.find((candidate) => candidate.id === provider.id),
      ),
    ),
  };
}

function progressRail(window: UsageWindow | null): HTMLSpanElement {
  const rail = element("span", "usage-tracker-sidebar__rail");
  const fill = element("span", "usage-tracker-sidebar__fill");
  fill.style.width = `${window?.barPercent ?? 0}%`;
  if (window === null) rail.dataset.empty = "true";
  rail.append(fill);
  return rail;
}

function detailWindowRow(
  label: string,
  window: UsageWindow | null,
): HTMLDivElement {
  const row = element("div", "usage-tracker-sidebar__window");
  const heading = element("div", "usage-tracker-sidebar__window-heading");
  heading.append(
    element("span", undefined, label),
    element(
      "strong",
      undefined,
      window === null ? "—" : `${formatUsedPercent(window.usedPercent)}%`,
    ),
  );
  row.append(heading, progressRail(window));
  row.append(
    element(
      "span",
      "usage-tracker-sidebar__reset",
      window === null ? "No limit reported" : formatResetTime(window.resetsAt),
    ),
  );
  return row;
}

interface ResetCardActions {
  confirmation: ResetConfirmation | null;
  message: ResetMessage | null;
  isPreparing: boolean;
  isConsuming: boolean;
  onPrepare: () => void;
  onCancel: () => void;
  onConsume: () => void;
}

function resetActionButton(
  label: string,
  className: string,
  disabled: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = element(
    "button",
    `usage-tracker-sidebar__reset-action ${className}`,
    label,
  );
  button.type = "button";
  button.disabled = disabled;
  button.setAttribute("aria-disabled", String(disabled));
  button.addEventListener("click", onClick);
  return button;
}

function resetSection(
  provider: ProviderUsage,
  actions: ResetCardActions,
): HTMLDivElement {
  const section = element("div", "usage-tracker-sidebar__resets");
  const heading = element("div", "usage-tracker-sidebar__reset-heading");
  const count = provider.resetCredits?.availableCount ?? null;
  heading.append(element("span", undefined, "Usage resets"));
  section.append(heading);

  const summary = element(
    "p",
    "usage-tracker-sidebar__reset-summary",
    count === null
      ? "Reset availability unavailable."
      : formatResetCredits(count),
  );
  section.append(summary);

  if (count !== null && count > 0) {
    if (actions.confirmation === null) {
      section.append(
        resetActionButton(
          actions.isPreparing
            ? "Checking reset availability…"
            : "Use a reset…",
          "usage-tracker-sidebar__reset-start",
          actions.isPreparing || actions.isConsuming,
          actions.onPrepare,
        ),
      );
    } else {
      const confirmation = element(
        "div",
        "usage-tracker-sidebar__reset-confirmation",
      );
      confirmation.setAttribute("role", "alertdialog");
      confirmation.setAttribute("aria-label", "Confirm usage reset");
      confirmation.append(
        element(
          "p",
          undefined,
          `Use one of your ${actions.confirmation.availableCount} usage resets? This consumes one reset and immediately resets an eligible Codex usage window.`,
        ),
      );
      const confirmationActions = element(
        "div",
        "usage-tracker-sidebar__reset-actions",
      );
      confirmationActions.append(
        resetActionButton(
          "Cancel",
          "usage-tracker-sidebar__reset-cancel",
          actions.isConsuming,
          actions.onCancel,
        ),
        resetActionButton(
          actions.isConsuming ? "Using reset…" : "Yes, use reset",
          "usage-tracker-sidebar__reset-confirm",
          actions.isConsuming,
          actions.onConsume,
        ),
      );
      confirmation.append(confirmationActions);
      section.append(confirmation);
    }
  }

  if (actions.message !== null) {
    const message = element(
      "p",
      "usage-tracker-sidebar__reset-message",
      actions.message.text,
    );
    message.dataset.kind = actions.message.kind;
    message.setAttribute(
      "role",
      actions.message.kind === "error" ? "alert" : "status",
    );
    section.append(message);
  }

  return section;
}

function detailsCard(
  provider: ProviderUsage,
  onClose: () => void,
  refresh: HTMLButtonElement,
  resetActions: ResetCardActions,
): HTMLDivElement {
  const card = element("div", "usage-tracker-sidebar__details");
  card.id = detailsId(provider.id);
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", `${provider.name} usage limits`);

  const header = element("div", "usage-tracker-sidebar__details-header");
  const identity = element("div", "usage-tracker-sidebar__details-identity");
  const mark = element("span", "usage-tracker-sidebar__details-mark");
  mark.dataset.provider = provider.id;
  mark.append(providerGlyph(provider.id as SidebarProviderId));
  const title = element("div");
  title.append(
    element("strong", undefined, provider.name),
    element(
      "span",
      undefined,
      provider.status === "ok"
        ? "Subscription usage"
        : providerStatusLabel(provider.status),
    ),
  );
  identity.append(mark, title);

  const close = element("button", "usage-tracker-sidebar__close");
  close.type = "button";
  close.setAttribute("aria-label", "Close usage details");
  close.append(closeGlyph());
  close.addEventListener("click", onClose);
  // The strip drops its own refresh button on a narrow sidebar, so the card
  // carries one and keeps the action reachable at any width.
  const actions = element("div", "usage-tracker-sidebar__details-actions");
  actions.append(refresh, close);
  header.append(identity, actions);

  const windows = element("div", "usage-tracker-sidebar__windows");
  windows.tabIndex = 0;
  windows.setAttribute("role", "region");
  windows.setAttribute("aria-label", `${provider.name} usage windows`);
  const detailRows = sidebarUsageDetailRows(provider);
  windows.dataset.hasFiveHour = String(
    detailRows.some((row) => row.label === "5-hour limit"),
  );
  windows.append(
    ...detailRows.map(({ label, window }) => detailWindowRow(label, window)),
  );
  card.append(header, windows);

  if (provider.id === "codex") {
    card.append(resetSection(provider, resetActions));
  }

  if (provider.status !== "ok" && provider.message !== null) {
    const message = element(
      "p",
      "usage-tracker-sidebar__message",
      provider.message,
    );
    if (provider.windows.length > 0) message.prepend("Last known values · ");
    card.append(message);
  }

  return card;
}

function visibleSidebarFooterMenu(): HTMLElement | null {
  const footers = Array.from(
    document.querySelectorAll<HTMLElement>('[data-sidebar="footer"]'),
  );
  const footer =
    footers.find((footer) => footer.getClientRects().length > 0) ??
    footers[0] ??
    null;
  return footer?.querySelector<HTMLElement>('[data-sidebar="menu"]') ?? null;
}

export function mountSidebarUsageStrip(signal: AbortSignal): () => void {
  let root: HTMLLIElement | null = null;
  let lastKnownSnapshot = readCachedSnapshot();
  let currentSnapshot: UsageSnapshot | null = null;
  let enabledProviderIds = readCachedProviderIds();
  let compactLimit = readCachedCompactLimit();
  let selectedProviderId: SidebarProviderId | null = null;
  let isLoading = false;
  let isLoadingPreferences = false;
  let lastError: string | null = null;
  let lastLoadedAt = 0;
  let requestController: AbortController | null = null;
  let preferencesRequestController: AbortController | null = null;
  let resetRequestController: AbortController | null = null;
  let resetConfirmation: ResetConfirmation | null = null;
  let resetMessage: ResetMessage | null = null;
  let isPreparingReset = false;
  let isConsumingReset = false;
  let ensureFrame: number | null = null;
  let requestedFocus: SidebarFocusTarget = null;
  let disposed = false;

  const providerFor = (providerId: SidebarProviderId): ProviderUsage =>
    lastKnownSnapshot?.providers.find(
      (provider) => provider.id === providerId,
    ) ??
    emptyProvider(providerId);

  const refreshButton = (): HTMLButtonElement => {
    const refresh = element("button", "usage-tracker-sidebar__refresh");
    refresh.type = "button";
    refresh.setAttribute("aria-disabled", String(isLoading));
    refresh.dataset.loading = String(isLoading);
    if (lastError !== null) refresh.dataset.error = "true";
    refresh.setAttribute(
      "aria-label",
      isLoading ? "Refreshing agent usage" : "Refresh agent usage",
    );
    refresh.title = lastError ?? "Refresh agent usage";
    refresh.append(refreshGlyph());
    refresh.addEventListener("click", () => void load());
    return refresh;
  };

  async function prepareReset(): Promise<void> {
    if (
      selectedProviderId !== "codex" ||
      isPreparingReset ||
      isConsumingReset ||
      disposed
    ) {
      return;
    }

    isPreparingReset = true;
    resetMessage = null;
    render();
    const controller = new AbortController();
    resetRequestController = controller;
    const abortRequest = () => controller.abort();
    signal.addEventListener("abort", abortRequest, { once: true });

    try {
      const result = await callResetRpc<ResetPrepareResult>(
        "prepareReset",
        null,
        controller.signal,
      );
      if (
        result.outcome === "ready" &&
        typeof result.confirmationToken === "string" &&
        result.confirmationToken.length > 0 &&
        typeof result.availableCount === "number" &&
        Number.isSafeInteger(result.availableCount) &&
        result.availableCount > 0 &&
        typeof result.expiresAtMs === "number" &&
        Number.isSafeInteger(result.expiresAtMs)
      ) {
        resetConfirmation = {
          confirmationToken: result.confirmationToken,
          availableCount: result.availableCount,
          expiresAtMs: result.expiresAtMs,
        };
        requestedFocus = { kind: "reset" };
      } else {
        resetConfirmation = null;
        resetMessage = {
          kind: "error",
          text: result.message ?? "Usage reset is unavailable.",
        };
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        resetConfirmation = null;
        resetMessage = {
          kind: "error",
          text:
            error instanceof Error
              ? error.message
              : "Usage reset is unavailable.",
        };
      }
    } finally {
      signal.removeEventListener("abort", abortRequest);
      if (resetRequestController === controller) {
        resetRequestController = null;
      }
      isPreparingReset = false;
      render();
    }
  }

  function cancelResetConfirmation(): void {
    if (isConsumingReset) return;
    resetConfirmation = null;
    resetMessage = null;
    requestedFocus = { kind: "reset" };
    render();
  }

  async function consumeReset(): Promise<void> {
    if (
      selectedProviderId !== "codex" ||
      resetConfirmation === null ||
      isConsumingReset ||
      disposed
    ) {
      return;
    }

    const confirmationToken = resetConfirmation.confirmationToken;
    isConsumingReset = true;
    resetMessage = {
      kind: "info",
      text: "Sending usage reset…",
    };
    render();
    const controller = new AbortController();
    resetRequestController = controller;
    const abortRequest = () => controller.abort();
    signal.addEventListener("abort", abortRequest, { once: true });

    try {
      const result = await callResetRpc<{ outcome: ResetConsumptionOutcome }>(
        "consumeReset",
        { confirmationToken },
        controller.signal,
      );
      resetConfirmation = null;
      switch (result.outcome) {
        case "reset":
          resetMessage = {
            kind: "success",
            text: "Usage reset. Refreshing limits.",
          };
          break;
        case "alreadyRedeemed":
          resetMessage = {
            kind: "success",
            text: "Usage reset was already applied. Refreshing limits.",
          };
          break;
        case "nothingToReset":
          resetMessage = {
            kind: "info",
            text: "No eligible usage window needed a reset.",
          };
          break;
        case "noCredit":
          resetMessage = {
            kind: "error",
            text: "No usage resets are available now.",
          };
          break;
        case "confirmation-expired":
          resetMessage = {
            kind: "error",
            text: "That reset confirmation expired. Choose Use a reset again.",
          };
          break;
        case "confirmation-invalid":
          resetMessage = {
            kind: "error",
            text: "That reset confirmation is no longer valid.",
          };
          break;
      }
      void load();
    } catch (error) {
      if (!controller.signal.aborted) {
        resetMessage = {
          kind: "error",
          text:
            error instanceof Error
              ? error.message
              : "Usage reset is unavailable.",
        };
      }
    } finally {
      signal.removeEventListener("abort", abortRequest);
      if (resetRequestController === controller) {
        resetRequestController = null;
      }
      isConsumingReset = false;
      render();
    }
  }

  const render = (): void => {
    if (root === null) return;
    const focusTarget = requestedFocus ?? activeSidebarFocusTarget(root);
    requestedFocus = null;
    const previousDialog = root.querySelector<HTMLElement>(
      ".usage-tracker-sidebar__details",
    );
    const previousWindows = root.querySelector<HTMLElement>(
      ".usage-tracker-sidebar__windows",
    );
    const previousScrollTop =
      selectedProviderId !== null &&
      previousDialog?.id === detailsId(selectedProviderId)
        ? (previousWindows?.scrollTop ?? 0)
        : 0;
    root.dataset.providerCount = String(enabledProviderIds.length);
    root.hidden = enabledProviderIds.length === 0;
    if (enabledProviderIds.length === 0) {
      root.replaceChildren();
      return;
    }
    const content: Node[] = [];

    if (selectedProviderId !== null) {
      const providerId = selectedProviderId;
      content.push(
        detailsCard(
          providerFor(providerId),
          () => {
            selectedProviderId = null;
            resetConfirmation = null;
            resetMessage = null;
            requestedFocus = { kind: "provider", providerId };
            render();
          },
          refreshButton(),
          {
            confirmation: resetConfirmation,
            message: resetMessage,
            isPreparing: isPreparingReset,
            isConsuming: isConsumingReset,
            onPrepare: () => void prepareReset(),
            onCancel: cancelResetConfirmation,
            onConsume: () => void consumeReset(),
          },
        ),
      );
    }

    const strip = element("div", "usage-tracker-sidebar__strip");
    strip.dataset.providerCount = String(enabledProviderIds.length);
    strip.setAttribute("role", "group");
    strip.setAttribute("aria-label", "Agent usage limits");

    for (const providerId of enabledProviderIds) {
      const provider = providerFor(providerId);
      const currentProvider = currentSnapshot?.providers.find(
        (candidate) => candidate.id === providerId,
      );
      const primary = selectSidebarUsagePrimary(
        currentProvider,
        provider,
        compactLimit,
      );
      const primaryAccessibleText = sidebarUsagePrimaryAccessibleText(
        provider.name,
        compactLimit,
        primary,
        selectedProviderId === providerId,
      );
      const button = element("button", "usage-tracker-sidebar__provider");
      button.type = "button";
      button.dataset.provider = providerId;
      button.dataset.status = provider.status;
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-controls", detailsId(providerId));
      button.setAttribute(
        "aria-expanded",
        String(selectedProviderId === providerId),
      );
      button.setAttribute("aria-label", primaryAccessibleText);
      button.title = primaryAccessibleText;

      const mark = element("span", "usage-tracker-sidebar__mark");
      mark.append(providerGlyph(providerId));
      const primarySummary = sidebarUsagePrimarySelectionSummary(primary);
      const reading = element(
        "span",
        "usage-tracker-sidebar__reading",
        isLoading && lastKnownSnapshot === null ? "…" : primarySummary,
      );
      button.append(mark, progressRail(primary.window), reading);
      button.addEventListener("click", () => {
        if (isConsumingReset) return;
        const isClosing = selectedProviderId === providerId;
        selectedProviderId = isClosing ? null : providerId;
        resetConfirmation = null;
        resetMessage = null;
        requestedFocus = isClosing
          ? { kind: "provider", providerId }
          : { kind: "close" };
        render();
      });
      strip.append(button);
    }

    strip.append(refreshButton());
    content.push(strip);
    root.replaceChildren(...content);
    const nextWindows = root.querySelector<HTMLElement>(
      ".usage-tracker-sidebar__windows",
    );
    if (nextWindows !== null) nextWindows.scrollTop = previousScrollTop;
    if (focusTarget !== null) focusSidebarTarget(root, focusTarget);
  };

  const ensureMounted = (): void => {
    if (disposed) return;
    const footerMenu = visibleSidebarFooterMenu();
    if (footerMenu === null) {
      root?.remove();
      root = null;
      return;
    }
    if (root !== null && root.parentElement === footerMenu) return;
    root?.remove();
    root = element("li", "usage-tracker-sidebar");
    root.setAttribute(ROOT_ATTRIBUTE, "");
    root.setAttribute("data-sidebar", "menu-item");
    footerMenu.append(root);
    render();
  };

  const scheduleEnsureMounted = (): void => {
    if (ensureFrame !== null || disposed) return;
    ensureFrame = requestAnimationFrame(() => {
      ensureFrame = null;
      ensureMounted();
    });
  };

  const load = async (): Promise<void> => {
    if (isLoading || disposed) return;
    isLoading = true;
    lastError = null;
    render();
    requestController = new AbortController();
    const abortRequest = () => requestController?.abort();
    signal.addEventListener("abort", abortRequest, { once: true });

    try {
      const response = await fetch(
        "/api/v1/plugins/usage-tracker/rpc/getUsage",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadId: null }),
          credentials: "same-origin",
          signal: requestController.signal,
        },
      );
      const payload = (await response.json()) as RpcEnvelope<UsageSnapshot>;
      if (!response.ok || !payload.ok || payload.result === undefined) {
        throw new Error(payload.error?.message ?? "Usage is unavailable.");
      }
      currentSnapshot = payload.result;
      lastKnownSnapshot = mergeSnapshot(currentSnapshot, lastKnownSnapshot);
      cacheSnapshot(lastKnownSnapshot);
      lastLoadedAt = Date.now();
    } catch (error) {
      if (!requestController.signal.aborted) {
        lastError = error instanceof Error ? error.message : "Usage is unavailable.";
      }
    } finally {
      signal.removeEventListener("abort", abortRequest);
      requestController = null;
      isLoading = false;
      render();
    }
  };

  const syncPreferences = async (): Promise<void> => {
    if (isLoadingPreferences || disposed) return;
    isLoadingPreferences = true;
    preferencesRequestController = new AbortController();
    const abortRequest = () => preferencesRequestController?.abort();
    signal.addEventListener("abort", abortRequest, { once: true });

    try {
      const response = await fetch(
        "/api/v1/plugins/usage-tracker/rpc/getPreferences",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "null",
          credentials: "same-origin",
          signal: preferencesRequestController.signal,
        },
      );
      const payload = (await response.json()) as RpcEnvelope<PreferencesResult>;
      if (!response.ok || !payload.ok || payload.result === undefined) return;

      const nextProviderIds = SIDEBAR_PROVIDER_IDS.filter((providerId) =>
        payload.result?.enabledProviderIds.includes(providerId),
      );
      const nextCompactLimit = normalizeCompactLimitOption(
        payload.result.compactLimit,
      );
      const newlyEnabled = nextProviderIds.some(
        (providerId) => !enabledProviderIds.includes(providerId),
      );
      const changed =
        nextCompactLimit !== compactLimit ||
        nextProviderIds.length !== enabledProviderIds.length ||
        nextProviderIds.some(
          (providerId, index) => providerId !== enabledProviderIds[index],
        );
      if (!changed) return;

      enabledProviderIds = nextProviderIds;
      compactLimit = nextCompactLimit;
      if (
        selectedProviderId !== null &&
        !enabledProviderIds.includes(selectedProviderId)
      ) {
        selectedProviderId = null;
        resetConfirmation = null;
        resetMessage = null;
        requestedFocus = { kind: "refresh" };
      }
      cacheProviderIds(enabledProviderIds);
      cacheCompactLimit(compactLimit);
      render();
      if (newlyEnabled) void load();
    } catch {
      // Keep the last-known preference while the local server reconnects.
    } finally {
      signal.removeEventListener("abort", abortRequest);
      preferencesRequestController = null;
      isLoadingPreferences = false;
    }
  };

  const observer = new MutationObserver(scheduleEnsureMounted);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  ensureMounted();
  void load();
  void syncPreferences();

  const refreshInterval = window.setInterval(() => void load(), AUTO_REFRESH_MS);
  const preferencesRefreshInterval = window.setInterval(
    () => void syncPreferences(),
    PREFERENCES_REFRESH_MS,
  );
  const refreshIfStale = (): void => {
    void syncPreferences();
    if (Date.now() - lastLoadedAt > 60_000) void load();
  };
  window.addEventListener("focus", refreshIfStale, { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) refreshIfStale();
    },
    { signal },
  );
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        selectedProviderId !== null &&
        root !== null &&
        event.target instanceof Node &&
        !root.contains(event.target)
      ) {
        selectedProviderId = null;
        resetConfirmation = null;
        resetMessage = null;
        render();
      }
    },
    { signal },
  );
  window.addEventListener(
    "keydown",
    (event) => {
      const active = document.activeElement;
      const belongsToUsageTracker =
        root !== null &&
        ((event.target instanceof Node && root.contains(event.target)) ||
          (active instanceof Node && root.contains(active)));
      if (
        event.key === "Escape" &&
        selectedProviderId !== null &&
        belongsToUsageTracker
      ) {
        const providerId = selectedProviderId;
        event.preventDefault();
        event.stopImmediatePropagation();
        selectedProviderId = null;
        resetConfirmation = null;
        resetMessage = null;
        requestedFocus = { kind: "provider", providerId };
        render();
      }
    },
    { capture: true, signal },
  );

  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    if (ensureFrame !== null) cancelAnimationFrame(ensureFrame);
    window.clearInterval(refreshInterval);
    window.clearInterval(preferencesRefreshInterval);
    requestController?.abort();
    preferencesRequestController?.abort();
    resetRequestController?.abort();
    root?.remove();
    root = null;
  };
}
