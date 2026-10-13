import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk";
import type { SemanticStateTone } from "./attention-state.ts";

export interface PullRequestPresentation {
  label: string;
  icon:
    | "Check"
    | "CircleX"
    | "Eye"
    | "GitMerge"
    | "GitPullRequest"
    | "GitPullRequestClosed"
    | "GitPullRequestDraft"
    | "Hourglass";
  tone: SemanticStateTone;
  colorRole:
    | "blocked"
    | "checks"
    | "closed"
    | "draft"
    | "merged"
    | "ready"
    | "review";
}

/**
 * Turn BB's rolled-up PR state into one stable, compact sidebar treatment.
 * Terminal states win first; attention then refines an open pull request.
 */
export function pullRequestPresentation(
  pullRequest: Pick<PluginSidebarPullRequest, "attention" | "state">,
): PullRequestPresentation {
  if (
    pullRequest.state === "merged" ||
    pullRequest.attention === "merged"
  ) {
    return {
      label: "MERGED",
      icon: "GitMerge",
      tone: "merged",
      colorRole: "merged",
    };
  }
  if (
    pullRequest.state === "closed" ||
    pullRequest.attention === "closed"
  ) {
    return {
      label: "CLOSED",
      icon: "GitPullRequestClosed",
      tone: "closed",
      colorRole: "closed",
    };
  }
  if (
    pullRequest.state === "draft" ||
    pullRequest.attention === "draft"
  ) {
    return {
      label: "DRAFT",
      icon: "GitPullRequestDraft",
      tone: "muted",
      colorRole: "draft",
    };
  }

  switch (pullRequest.attention) {
    case "changes_requested":
      return {
        label: "CHANGES",
        icon: "CircleX",
        tone: "destructive",
        colorRole: "blocked",
      };
    case "blocked":
    case "checks_failed":
    case "conflicts":
      return {
        label: "BLOCKED",
        icon: "CircleX",
        tone: "destructive",
        colorRole: "blocked",
      };
    case "checks_pending":
      return {
        label: "CHECKS",
        icon: "Hourglass",
        tone: "warning",
        colorRole: "checks",
      };
    case "review_requested":
      return {
        label: "IN REVIEW",
        icon: "Eye",
        tone: "primary",
        colorRole: "review",
      };
    case "ready_to_merge":
      return {
        label: "READY",
        icon: "Check",
        tone: "success",
        colorRole: "ready",
      };
    default:
      return {
        label: "OPEN",
        icon: "GitPullRequest",
        tone: "muted",
        colorRole: "draft",
      };
  }
}
