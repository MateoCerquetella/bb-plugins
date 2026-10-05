import { useEffect, useRef, useState, type CSSProperties } from "react";

// Change positioning in place: moving an iframe to a portal reloads its document.
export function useFollowViewer(threadId: string) {
  const anchor = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>();
  const [anchorStyle, setAnchorStyle] = useState<CSSProperties>();
  useEffect(() => {
    const element = anchor.current;
    if (!element) return;
    let frame = 0;
    let following = false;
    let placeholderHeight = 0;
    let scrollport: HTMLElement | null = element.parentElement;
    while (scrollport && !/(auto|scroll)/.test(getComputedStyle(scrollport).overflowY)) {
      scrollport = scrollport.parentElement;
    }
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const bounds = scrollport?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = Math.max(viewport?.offsetTop ?? 0, bounds?.top ?? 0) + 8;
      const bottom = Math.min((viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight), bounds?.bottom ?? innerHeight);
      const right = Math.min(innerWidth, bounds?.right ?? innerWidth) - 8;
      const left = Math.max(8, bounds?.left ?? 0, Math.min(rect.left, right - rect.width));
      const siblings = Array.from(document.querySelectorAll<HTMLElement>("[data-steel-thread]"))
        .filter(item => item.dataset.steelThread === threadId);
      const eligible = siblings.at(-1) === element && rect.width > 0 && bottom - top > 160;
      const follow = eligible && (following ? rect.top < top + 56 : rect.top < top - 56);
      if (follow && !following) placeholderHeight = rect.height;
      following = follow;
      const next: CSSProperties | undefined = follow ? {
        position: "fixed", top, left,
        width: Math.min(560, rect.width, right - left),
        maxHeight: Math.min(480, (bottom - top) * 0.55),
        zIndex: 20,
      } : undefined;
      setStyle(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      const nextAnchorStyle = follow ? { height: placeholderHeight } : undefined;
      setAnchorStyle(previous => JSON.stringify(previous) === JSON.stringify(nextAnchorStyle) ? previous : nextAnchorStyle);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    if (scrollport) observer.observe(scrollport);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [threadId]);
  return { anchor, style };
}
