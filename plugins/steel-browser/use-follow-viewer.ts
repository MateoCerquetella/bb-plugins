import { useEffect, useRef, useState } from "react";

// Keep the viewer in its message so scrolling the thread remains predictable.
export function useFollowViewer(threadId: string) {
  const anchor = useRef<HTMLDivElement>(null);
  const [latest, setLatest] = useState(false);
  useEffect(() => {
    const element = anchor.current;
    if (!element) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const siblings = Array.from(document.querySelectorAll<HTMLElement>("[data-steel-thread]"))
        .filter(item => item.dataset.steelThread === threadId);
      setLatest(siblings.at(-1) === element && element.getBoundingClientRect().width > 0);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("resize", schedule);
    window.addEventListener("steel-viewers-changed", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    schedule();
    window.dispatchEvent(new Event("steel-viewers-changed"));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("steel-viewers-changed", schedule);
      queueMicrotask(() => window.dispatchEvent(new Event("steel-viewers-changed")));
    };
  }, [threadId]);
  return { anchor, style: undefined, anchorStyle: undefined, latest };
}
