import type { PluginSidebarThreadIndicator } from "@get-bb/plugin-sdk";

export type ThreadStatusColorRole =
  | "workflow"
  | "agent"
  | "command"
  | "plan"
  | "goal"
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
      return "working";
    case "workflow":
      return "workflow";
    case "background-agent":
      return "agent";
    case "background-command":
      return "command";
    case "plan-mode":
      return "plan";
    case "goal":
      return "goal";
    case "draft":
    case "working-draft":
      return "inactive";
    case "none":
    default:
      return null;
  }
}
