import {
  UrlLink,
  type PluginSidebarPullRequest,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { semanticStateToneClass } from "@/lib/attention-state";
import { pullRequestPresentation } from "@/lib/pull-request-presentation";

export function PullRequestMetadata({
  pullRequest,
  interactive = true,
}: {
  pullRequest: PluginSidebarPullRequest;
  interactive?: boolean;
}) {
  const presentation = pullRequestPresentation(pullRequest);
  const semanticColor = `var(--dockside-pr-${presentation.colorRole}, currentColor)`;
  const label = `${presentation.label} pull request ${pullRequest.number}: ${pullRequest.title}`;
  const content = (
    <>
      <span className="shrink-0 font-mono text-muted-foreground/80">
        #{pullRequest.number}
      </span>
      <span
        data-dockside-pr-state={presentation.colorRole}
        className={`inline-flex size-4 shrink-0 items-center justify-center rounded ${semanticStateToneClass(presentation.tone)}`}
        style={{
          color: semanticColor,
          backgroundColor: `color-mix(in srgb, ${semanticColor} 24%, transparent)`,
        }}
      >
        <Icon name={presentation.icon} className="size-3" aria-hidden />
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 z-30 mb-1 w-max max-w-56 translate-y-0.5 rounded-md border border-border bg-popover px-2 py-1.5 text-left text-2xs leading-tight text-popover-foreground opacity-0 shadow-md transition-all group-hover/pr:translate-y-0 group-hover/pr:opacity-100 group-focus-visible/pr:translate-y-0 group-focus-visible/pr:opacity-100"
      >
        <span className="block font-semibold">
          {presentation.label} · #{pullRequest.number}
        </span>
        <span className="mt-0.5 block max-w-52 whitespace-normal break-words text-muted-foreground">
          {pullRequest.title}
        </span>
      </span>
    </>
  );

  if (!interactive) {
    return (
      <span
        className="group/pr pointer-events-none relative flex h-4 min-w-0 items-center gap-1.5 text-2xs text-muted-foreground"
        title={`${presentation.label}: ${pullRequest.title}`}
      >
        <span className="sr-only">{label}</span>
        <span aria-hidden className="contents">
          {content}
        </span>
      </span>
    );
  }

  // Number first; the semantic PR icon deliberately owns the far-right edge.
  return (
    <UrlLink
      href={pullRequest.url}
      onClick={(event) => event.stopPropagation()}
      className="group/pr pointer-events-auto relative flex h-4 min-w-0 items-center gap-1.5 text-2xs text-muted-foreground hover:text-foreground"
      aria-label={label}
      title={`${presentation.label}: ${pullRequest.title}`}
    >
      {content}
    </UrlLink>
  );
}

export function WaitingForAgentsMetadata() {
  return (
    <span
      title="Agents working"
      className={`inline-flex size-4 shrink-0 items-center justify-center rounded ${semanticStateToneClass("primary")}`}
      style={{
        color:
          "var(--dockside-status-working, var(--success-foreground, var(--primary)))",
      }}
    >
      <Icon name="Loading" className="size-3 animate-spin" aria-hidden />
      <span className="sr-only">Agents working</span>
    </span>
  );
}
