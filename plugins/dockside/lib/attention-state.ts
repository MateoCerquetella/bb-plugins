import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { threadIsWorking } from "./inbox.ts";

export type SemanticStateTone =
  | "closed"
  | "destructive"
  | "merged"
  | "muted"
  | "primary"
  | "success"
  | "warning";

export function familyWaitingForAgents(
  children: readonly PluginSidebarThread[],
): boolean {
  return children.some(threadIsWorking);
}

export function semanticStateToneClass(tone: SemanticStateTone): string {
  switch (tone) {
    case "closed":
      return "bg-muted/60 text-muted-foreground/60";
    case "destructive":
      return "bg-destructive/10 text-destructive";
    case "merged":
      return "bg-primary/10 text-[color:var(--pr-merged)]";
    case "primary":
      return "bg-primary/10 text-primary";
    case "success":
      return "bg-primary/10 text-success-foreground";
    case "warning":
      return "bg-primary/10 text-[color:var(--warning-text,var(--warning))]";
    case "muted":
      return "bg-muted text-muted-foreground";
  }
}
