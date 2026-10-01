import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { zoomAnchor } from "./control";

export function useCanvasNavigation(viewport: RefObject<HTMLDivElement | null>, zoom: number, setZoom: (zoom: number) => void) {
  const current = useRef(zoom);
  const frame = useRef(0);
  const scroll = useRef<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    current.current = zoom;
    if (scroll.current && viewport.current) viewport.current.scrollTo(scroll.current);
    scroll.current = null;
  }, [zoom, viewport]);
  const change = useCallback((next: number, x?: number, y?: number) => {
    const element = viewport.current;
    const value = Math.max(.1, Math.min(1.5, next));
    if (element) scroll.current = zoomAnchor(element.scrollLeft, element.scrollTop,
      x ?? element.clientWidth / 2, y ?? element.clientHeight / 2, current.current, value);
    current.current = value;
    setZoom(value);
  }, [setZoom, viewport]);
  const zoomTo = useCallback((next: number, animate = true) => {
    cancelAnimationFrame(frame.current);
    const start = current.current, target = Math.max(.1, Math.min(1.5, next)), began = performance.now();
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { change(target); return; }
    const tick = (now: number) => {
      const progress = Math.min(1, (now - began) / 160);
      change(start + (target - start) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [change]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (window.matchMedia("(max-width: 900px)").matches || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      cancelAnimationFrame(frame.current);
      const bounds = element.getBoundingClientRect();
      change(current.current * Math.exp(-Math.max(-200, Math.min(200, event.deltaY)) * .005),
        event.clientX - bounds.left, event.clientY - bounds.top);
    };
    let pinch: { distance: number; zoom: number } | null = null;
    const touch = (event: TouchEvent) => {
      if (event.touches.length !== 2 || window.matchMedia("(max-width: 900px)").matches) { pinch = null; return; }
      event.preventDefault();
      cancelAnimationFrame(frame.current);
      const [a, b] = Array.from(event.touches), bounds = element.getBoundingClientRect();
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (!pinch) pinch = { distance: Math.max(1, distance), zoom: current.current };
      change(pinch.zoom * distance / pinch.distance, (a.clientX + b.clientX) / 2 - bounds.left, (a.clientY + b.clientY) / 2 - bounds.top);
    };
    const end = () => { pinch = null; };
    // React delegates wheel as passive; canvas zoom needs its own cancellable listener.
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("touchstart", touch, { passive: false });
    element.addEventListener("touchmove", touch, { passive: false });
    element.addEventListener("touchend", end);
    element.addEventListener("touchcancel", end);
    return () => {
      cancelAnimationFrame(frame.current);
      element.removeEventListener("wheel", wheel); element.removeEventListener("touchstart", touch);
      element.removeEventListener("touchmove", touch); element.removeEventListener("touchend", end); element.removeEventListener("touchcancel", end);
    };
  }, [change, viewport]);
  return zoomTo;
}
