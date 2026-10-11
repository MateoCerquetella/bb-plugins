import type { Dashboard } from "./contract.ts";

export const MAX_CLIPBOARD_LENGTH = 4096;

// Only embed paths on the authenticated, project-bound viewer origin.
export function liveViewerUrl(dashboard: Dashboard | null): string | null {
  if (!dashboard?.connected) return null;
  const session = dashboard.sessions.find(item => ["idle", "live"].includes(item.status));
  if (!session) return null;
  const base = new URL(dashboard.uiUrl);
  if (base.protocol !== "https:" || base.username || base.password) return null;
  const url = new URL("/v1/sessions/debug", base.origin);
  try {
    const upstream = new URL(session.debugUrl);
    if (upstream.origin === base.origin && upstream.pathname.startsWith("/v1/sessions/")) {
      url.pathname = upstream.pathname;
      url.search = upstream.search;
    }
  } catch { /* Older Steel versions omit the session URL. */ }
  url.searchParams.set("interactive", "true");
  url.searchParams.set("clipboardBridge", "true");
  return url.toString();
}

export function validatePaste(text: string): string | null {
  if (!text.length) return "Clipboard is empty.";
  if (text.length > MAX_CLIPBOARD_LENGTH) return `Paste is limited to ${MAX_CLIPBOARD_LENGTH} characters.`;
  // The upstream bridge maps these to keys which can submit or leave a field.
  if (/[\u0000-\u001f\u007f]/u.test(text)) return "Paste one line without tabs or control characters.";
  return null;
}

export function trustedViewerMessage(event: Pick<MessageEvent, "source" | "origin" | "data">,
  frame: Window | null, url: string): boolean {
  return !!frame && event.source === frame && event.origin === new URL(url).origin
    && event.data !== null && typeof event.data === "object";
}
