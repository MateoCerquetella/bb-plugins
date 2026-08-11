import {
  formatResetTime,
  formatUsedPercent,
  providerStatusLabel,
  type ProviderUsage,
  type UsageSnapshot,
  type UsageWindow,
} from "./usage.ts";
import { providerMark } from "./provider-marks.ts";
import {
  mergeLastKnownWindows,
  sidebarUsagePrimarySummary,
  sidebarUsageSummary,
  sidebarUsageWindows,
} from "./sidebar-usage.ts";

const ROOT_ATTRIBUTE = "data-usage-tracker-sidebar";
const CACHE_KEY = "bb:usage-tracker:sidebar:last-known";
const AUTO_REFRESH_MS = 5 * 60_000;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SIDEBAR_PROVIDER_IDS = ["claudeCode", "codex"] as const;

type SidebarProviderId = (typeof SIDEBAR_PROVIDER_IDS)[number];

interface RpcEnvelope {
  ok: boolean;
  result?: UsageSnapshot;
  error?: { message?: string };
}

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
    name: providerId === "codex" ? "Codex" : "Claude Code",
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

function detailsCard(
  provider: ProviderUsage,
  onClose: () => void,
): HTMLDivElement {
  const pair = sidebarUsageWindows(provider);
  const card = element("div", "usage-tracker-sidebar__details");
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
  header.append(identity, close);

  const windows = element("div", "usage-tracker-sidebar__windows");
  windows.append(
    detailWindowRow("5-hour limit", pair.fiveHour),
    detailWindowRow("Weekly limit", pair.weekly),
  );
  card.append(header, windows);

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
  let snapshot = readCachedSnapshot();
  let selectedProviderId: SidebarProviderId | null = null;
  let isLoading = false;
  let lastError: string | null = null;
  let lastLoadedAt = 0;
  let requestController: AbortController | null = null;
  let ensureFrame: number | null = null;
  let disposed = false;

  const providerFor = (providerId: SidebarProviderId): ProviderUsage =>
    snapshot?.providers.find((provider) => provider.id === providerId) ??
    emptyProvider(providerId);

  const render = (): void => {
    if (root === null) return;
    const content: Node[] = [];

    if (selectedProviderId !== null) {
      content.push(
        detailsCard(providerFor(selectedProviderId), () => {
          selectedProviderId = null;
          render();
        }),
      );
    }

    const strip = element("div", "usage-tracker-sidebar__strip");
    strip.setAttribute("role", "group");
    strip.setAttribute("aria-label", "Agent usage limits");

    for (const providerId of SIDEBAR_PROVIDER_IDS) {
      const provider = providerFor(providerId);
      const pair = sidebarUsageWindows(provider);
      const button = element("button", "usage-tracker-sidebar__provider");
      button.type = "button";
      button.dataset.provider = providerId;
      button.dataset.status = provider.status;
      button.setAttribute(
        "aria-expanded",
        String(selectedProviderId === providerId),
      );
      button.setAttribute("aria-label", `${provider.name}: ${sidebarUsageSummary(provider)}`);
      button.title = `${provider.name} · ${sidebarUsageSummary(provider)} · Click for 5-hour and weekly details`;

      const mark = element("span", "usage-tracker-sidebar__mark");
      mark.append(providerGlyph(providerId));
      const primaryWindow = pair.fiveHour ?? pair.weekly;
      const reading = element(
        "span",
        "usage-tracker-sidebar__reading",
        isLoading && snapshot === null ? "…" : sidebarUsagePrimarySummary(provider),
      );
      button.append(mark, progressRail(primaryWindow), reading);
      button.addEventListener("click", () => {
        selectedProviderId =
          selectedProviderId === providerId ? null : providerId;
        render();
      });
      strip.append(button);
    }

    const refresh = element("button", "usage-tracker-sidebar__refresh");
    refresh.type = "button";
    refresh.disabled = isLoading;
    refresh.dataset.loading = String(isLoading);
    if (lastError !== null) refresh.dataset.error = "true";
    refresh.setAttribute(
      "aria-label",
      isLoading ? "Refreshing agent usage" : "Refresh agent usage",
    );
    refresh.title = lastError ?? "Refresh agent usage";
    refresh.append(refreshGlyph());
    refresh.addEventListener("click", () => void load());
    strip.append(refresh);
    content.push(strip);
    root.replaceChildren(...content);
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
      const payload = (await response.json()) as RpcEnvelope;
      if (!response.ok || !payload.ok || payload.result === undefined) {
        throw new Error(payload.error?.message ?? "Usage is unavailable.");
      }
      snapshot = mergeSnapshot(payload.result, snapshot);
      cacheSnapshot(snapshot);
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

  const observer = new MutationObserver(scheduleEnsureMounted);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  ensureMounted();
  void load();

  const refreshInterval = window.setInterval(() => void load(), AUTO_REFRESH_MS);
  const refreshIfStale = (): void => {
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
        render();
      }
    },
    { signal },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && selectedProviderId !== null) {
        selectedProviderId = null;
        render();
      }
    },
    { signal },
  );

  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    if (ensureFrame !== null) cancelAnimationFrame(ensureFrame);
    window.clearInterval(refreshInterval);
    requestController?.abort();
    root?.remove();
    root = null;
  };
}
