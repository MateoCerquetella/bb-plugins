import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

const HOVER_DELAY = 2000;

// Resize the existing section in place: moving an iframe through a portal
// would reconnect its authenticated viewer and discard human control state.
export function usePanelExpansion() {
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hoverSuppressed = useRef(false);
  const pointerInside = useRef(false);
  const [mode, setMode] = useState<"compact" | "hover" | "pinned">("compact");
  const [geometry, setGeometry] = useState<CSSProperties>();
  const cancel = useCallback(() => { clearTimeout(timer.current); timer.current = undefined; }, []);
  const shrink = useCallback(() => { cancel(); hoverSuppressed.current = true; setMode("compact"); }, [cancel]);
  const toggle = () => { cancel(); hoverSuppressed.current = true; setMode(value => value === "compact" ? "pinned" : "compact"); };
  const canHover = () => !document.hidden && document.hasFocus() && !matchMedia("(pointer: coarse), (max-width: 640px)").matches;

  useLayoutEffect(() => {
    if (mode === "compact") { setGeometry(undefined); return; }
    const update = () => {
      const box = anchor.current?.getBoundingClientRect();
      if (!box || box.width <= 0 || box.height <= 0) { shrink(); return; }
      const top = Math.max(8, Math.min(box.top, innerHeight - 80));
      const right = Math.max(8, innerWidth - box.right);
      setGeometry({ top, right, height: Math.max(0, Math.min(box.bottom, innerHeight - 8) - top),
        width: Math.min(innerWidth - right - 8, Math.max(box.width, innerWidth * .9)) });
    };
    update();
    const observer = new ResizeObserver(update);
    if (anchor.current) observer.observe(anchor.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [mode, shrink]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      // The clipboard dialog owns Escape while it is open.
      if (event.key === "Escape" && !panel.current?.querySelector("dialog[open]")) shrink();
    };
    const blur = () => {
      // Focusing the cross-origin viewer also blurs this window; it is still
      // part of this panel and must not cancel a hover or an explicit expansion.
      if (document.hasFocus() && panel.current?.contains(document.activeElement) && document.activeElement?.tagName === "IFRAME") return;
      cancel();
      hoverSuppressed.current = true;
      setMode(value => value === "hover" ? "compact" : value);
    };
    const visibility = () => { if (document.hidden) shrink(); };
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancel();
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [cancel, shrink]);

  useEffect(() => {
    // Browsers do not deliver ancestor pointerenter/leave consistently when
    // the pointer crosses straight into a cross-origin iframe. CSS :hover
    // still tracks that hit area, without intercepting input with an overlay.
    const track = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      // On direct iframe entry the outer document receives pointerout at the
      // new coordinates even when no panel pointerenter is dispatched.
      const inside = !!panel.current?.contains(document.elementFromPoint(event.clientX, event.clientY));
      pointerInside.current = inside;
      if (!inside) {
        cancel();
        if (event.type === "pointermove") hoverSuppressed.current = false;
        if (mode === "hover") setMode("compact");
      }
    };
    document.addEventListener("pointermove", track, true);
    document.addEventListener("pointerout", track, true);
    document.addEventListener("pointerover", track, true);
    const poll = setInterval(() => {
      const hovered = (pointerInside.current || panel.current?.matches(":hover")) && canHover();
      if (!hovered) {
        cancel();
        if (mode === "hover") setMode("compact");
      } else if (mode === "compact" && !hoverSuppressed.current && timer.current === undefined) {
        timer.current = setTimeout(() => {
          timer.current = undefined;
          if ((pointerInside.current || panel.current?.matches(":hover")) && canHover()) setMode("hover");
        }, HOVER_DELAY);
      }
    }, 100);
    return () => {
      clearInterval(poll); cancel();
      document.removeEventListener("pointermove", track, true);
      document.removeEventListener("pointerout", track, true);
      document.removeEventListener("pointerover", track, true);
    };
  }, [mode, cancel]);

  const enter = (event: PointerEvent<HTMLElement>) => {
    pointerInside.current = event.pointerType === "mouse";
    if (event.pointerType !== "mouse" || mode !== "compact" || hoverSuppressed.current || !canHover() || timer.current !== undefined) return;
    timer.current = setTimeout(() => { timer.current = undefined; setMode("hover"); }, HOVER_DELAY);
  };
  const leave = (event: PointerEvent<HTMLElement>) => {
    if (panel.current?.contains(document.elementFromPoint(event.clientX, event.clientY))) return;
    pointerInside.current = false;
    cancel(); setMode(value => value === "hover" ? "compact" : value);
  };

  return { anchor, panel, expanded: mode !== "compact", geometry, enter, leave, toggle };
}
