// Per-device BB palette. BB keeps one palette for the whole server and writes
// its CSS into <style id="bb-app-theme">. This device can override that CSS
// locally: "default" clears it, any custom or plugin palette uses its own CSS.
export const PALETTE_KEY = "aura.device-palette";
export const PALETTE_CHANGE = "aura-palette-change";
const STYLE_ID = "bb-app-theme";

export type PaletteOption = { id: string; name: string };

export function readDevicePalette(): string | null {
  try { return globalThis.localStorage?.getItem(PALETTE_KEY) || null; } catch { return null; }
}
export function writeDevicePalette(id: string | null): void {
  try {
    if (id) globalThis.localStorage?.setItem(PALETTE_KEY, id);
    else globalThis.localStorage?.removeItem(PALETTE_KEY);
  } catch { /* Storage unavailable: keep BB's palette. */ }
  globalThis.dispatchEvent?.(new Event(PALETTE_CHANGE));
}

/** Palettes whose CSS BB exposes: BB default plus custom and plugin palettes. */
export async function listPalettes(signal?: AbortSignal): Promise<PaletteOption[]> {
  const response = await fetch("/api/v1/settings/themes", { credentials: "same-origin", signal });
  if (!response.ok) throw new Error(`Could not list palettes (${response.status}).`);
  const body = await response.json() as { custom?: string[]; plugins?: { id: string; name: string }[] };
  return [
    { id: "default", name: "BB default" },
    ...(body.custom ?? []).map(id => ({ id, name: id })),
    ...(body.plugins ?? []).map(plugin => ({ id: plugin.id, name: plugin.name })),
  ];
}

async function paletteCss(id: string, signal: AbortSignal): Promise<string | null> {
  if (id === "default") return "";
  const response = await fetch(`/api/v1/settings/themes/${encodeURIComponent(id)}`, { credentials: "same-origin", signal });
  if (!response.ok) return null;
  const body = await response.json() as { customCss?: string | null };
  return typeof body.customCss === "string" ? body.customCss : null;
}

export function mountDevicePalette(signal: AbortSignal): () => void {
  let override: string | null = null; // CSS this device wants, or null for BB's own
  let shared: string | null = null;   // the last CSS BB itself wrote
  let applied: string | null = null;  // the last CSS this device wrote
  let request: AbortController | null = null;
  let disposed = false;
  function style(): HTMLStyleElement | null {
    const element = document.getElementById(STYLE_ID);
    return element instanceof HTMLStyleElement ? element : null;
  }
  function enforce(): void {
    const element = style();
    if (!element) return;
    const text = element.textContent ?? "";
    if (text !== applied) shared = text;
    if (override !== null && text !== override) element.textContent = applied = override;
  }
  async function load(): Promise<void> {
    request?.abort();
    const id = readDevicePalette();
    if (!id) {
      override = null;
      const element = style();
      if (element && applied !== null && shared !== null && element.textContent === applied) element.textContent = shared;
      applied = null;
      return;
    }
    const controller = request = new AbortController();
    try {
      const css = await paletteCss(id, AbortSignal.any([signal, controller.signal]));
      if (disposed || controller.signal.aborted) return;
      override = css; // null (unknown palette) leaves BB's palette in place
      enforce();
    } catch { /* Keep the current palette through a transient failure. */ }
  }
  const observer = new MutationObserver(() => {
    if (override !== null) enforce();
    else { const text = style()?.textContent; if (text != null && text !== applied) shared = text; }
  });
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  const onChange = () => { void load(); };
  const onStorage = (event: StorageEvent) => { if (event.key === PALETTE_KEY) void load(); };
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    request?.abort();
    observer.disconnect();
    window.removeEventListener(PALETTE_CHANGE, onChange);
    window.removeEventListener("storage", onStorage);
    signal.removeEventListener("abort", dispose);
    const element = style();
    if (applied !== null && element?.textContent === applied && shared !== null) element.textContent = shared;
  }
  window.addEventListener(PALETTE_CHANGE, onChange);
  window.addEventListener("storage", onStorage);
  signal.addEventListener("abort", dispose, { once: true });
  shared = style()?.textContent ?? null;
  if (signal.aborted) dispose(); else void load();
  return dispose;
}
