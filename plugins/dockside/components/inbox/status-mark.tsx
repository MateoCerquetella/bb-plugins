import type { CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import "./status-mark.css";

export type StatusMarkKind = "working" | "needs-you" | "failed" | "unread" | "inactive" | "stale" | "draft";

/** Shape carries the state even when a custom palette uses similar colors. */
export function StatusMark({ kind, className, style }: {
  kind: StatusMarkKind;
  className?: string;
  style?: CSSProperties;
}) {
  const shared = cn("size-3.5 shrink-0", `dockside-status-mark-${kind}`, className);
  if (kind === "inactive" || kind === "stale" || kind === "draft") {
    return <Icon name={kind === "inactive" ? "Clock" : kind === "stale" ? "Hourglass" : "Edit"} aria-hidden className={shared} style={style} />;
  }
  const cutout = "var(--sidebar, var(--background, #111))";
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={shared} style={style} fill="none">
      {kind === "working" ? (
        <>
          <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" opacity="0.2" />
          <circle cx="10" cy="10" r="2" fill="currentColor" />
          <circle className="dockside-status-orbit" cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="14 30" />
        </>
      ) : (
        <>
          <circle cx="10" cy="10" r="8.5" fill="currentColor" />
          {kind === "unread" ? (
            <path d="m6.3 10 2.4 2.5 5-5" stroke={cutout} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          ) : kind === "failed" ? (
            <path d="m7 7 6 6m0-6-6 6" stroke={cutout} strokeWidth="2" strokeLinecap="round" />
          ) : (
            <>
              <path d="M10 5.5v5" stroke={cutout} strokeWidth="2" strokeLinecap="round" />
              <circle cx="10" cy="14" r="1" fill={cutout} />
            </>
          )}
        </>
      )}
    </svg>
  );
}
