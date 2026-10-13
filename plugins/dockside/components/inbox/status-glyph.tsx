import type { PluginSidebarThreadIndicator } from "@get-bb/plugin-sdk";
import { StatusMark, type StatusMarkKind } from "@/components/inbox/status-mark";
import { Icon } from "@/components/ui/icon";
import { workingActivityPresentation } from "@/lib/family-status";
import { CUSTOM_COLOR_DEFAULTS } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import {
  statusColorRole,
  type ThreadStatusColorRole,
} from "@/lib/status-presentation";

function statusColor(role: ThreadStatusColorRole): string {
  const fallback = CUSTOM_COLOR_DEFAULTS[role];
  return `var(--dockside-status-${role}, ${fallback})`;
}

/**
 * Whether this indicator draws a glyph that speaks for the row.
 *
 * The row gives the glyph and the age ONE slot, so this decides which of the
 * two the user sees. Listed kind by kind rather than "anything but none": an
 * indicator bb ships tomorrow must fall through to the age label, not blank
 * the slot.
 */
export function hasStatusGlyph(
  indicator: PluginSidebarThreadIndicator,
): boolean {
  switch (indicator) {
    case "unread-error":
    case "waiting-for-input":
    case "unread-success":
    case "runtime":
    case "workflow":
    case "background-agent":
    case "background-command":
    case "plan-mode":
    case "goal":
    case "draft":
    case "working-draft":
      return true;
    default:
      return false;
  }
}

export function StatusGlyph({
  indicator,
  label,
  className,
}: {
  indicator: PluginSidebarThreadIndicator;
  label: string | null;
  className?: string;
}) {
  const shared = cn("size-3.5 shrink-0", className);
  const aria = label ?? undefined;
  const role = statusColorRole(indicator);
  const style = role === null ? undefined : { color: statusColor(role) };
  if (role === "workflow" || role === "agent" || role === "command" ||
      role === "plan" || role === "goal") {
    return (
      <span role={aria ? "img" : undefined} aria-label={aria} title={aria} className={shared}>
        <Icon name={workingActivityPresentation(role).icon} aria-hidden
          className="size-full dockside-status-mark-activity" style={style} />
      </span>
    );
  }

  const kind: StatusMarkKind | null =
    role === "working" ? "working" :
    role === "error" ? "failed" :
    role === "waiting" ? "needs-you" :
    role === "unread" ? "unread" :
    role === "inactive" ? "draft" : null;
  if (kind === null) return null;
  return (
    <span role={aria ? "img" : undefined} aria-label={aria} title={aria} className={shared}>
      <StatusMark kind={kind} style={style} />
    </span>
  );
}
