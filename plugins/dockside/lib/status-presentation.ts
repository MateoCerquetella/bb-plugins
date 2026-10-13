import type { PluginSidebarThreadIndicator } from "@get-bb/plugin-sdk";

export type ThreadStatusColorRole =
  | "error"
  | "inactive"
  | "unread"
  | "waiting"
  | "working";

export function statusColorRole(
  indicator: PluginSidebarThreadIndicator,
): ThreadStatusColorRole | null {
  switch (indicator) {
    case "unread-error":
      return "error";
    case "waiting-for-input":
      return "waiting";
    case "unread-success":
      return "unread";
    case "runtime":
    case "workflow":
    case "background-agent":
    case "background-command":
    case "plan-mode":
    case "goal":
      return "working";
    case "draft":
    case "working-draft":
      return "inactive";
    case "none":
    default:
      return null;
  }
}
