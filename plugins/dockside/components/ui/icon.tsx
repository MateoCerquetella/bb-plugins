import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Add01Icon,
  Archive02Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowTurnBackwardIcon,
  ArrowUp01Icon,
  BotIcon,
  CancelCircleIcon,
  CheckListIcon,
  CheckmarkSquare02Icon,
  Clock01Icon,
  ComputerTerminal01Icon,
  Edit02Icon,
  FilterHorizontalIcon,
  Folder01Icon,
  GitBranchIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
  HelpCircleIcon,
  HourglassIcon,
  Loading03Icon,
  PinIcon,
  Delete02Icon,
  Target02Icon,
  Tick02Icon,
  UserAdd01Icon,
  ViewIcon,
  WorkflowCircle03Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

const ICON_MAP = {
  Add: Add01Icon,
  Archive: Archive02Icon,
  ArrowTurnBackward: ArrowTurnBackwardIcon,
  Bot: BotIcon,
  Check: Tick02Icon,
  CheckSquare: CheckmarkSquare02Icon,
  ChevronDown: ArrowDown01Icon,
  ChevronLeft: ArrowLeft01Icon,
  ChevronRight: ArrowRight01Icon,
  ChevronUp: ArrowUp01Icon,
  CircleQuestion: HelpCircleIcon,
  CircleX: CancelCircleIcon,
  Clock: Clock01Icon,
  Edit: Edit02Icon,
  Eye: ViewIcon,
  Filter: FilterHorizontalIcon,
  Folder: Folder01Icon,
  GitBranch: GitBranchIcon,
  GitMerge: GitMergeIcon,
  GitPullRequest: GitPullRequestIcon,
  GitPullRequestClosed: GitPullRequestClosedIcon,
  GitPullRequestDraft: GitPullRequestDraftIcon,
  Hourglass: HourglassIcon,
  ListTodo: CheckListIcon,
  Loading: Loading03Icon,
  Pin: PinIcon,
  Trash: Delete02Icon,
  Target: Target02Icon,
  Terminal: ComputerTerminal01Icon,
  UserRoundPlus: UserAdd01Icon,
  Workflow: WorkflowCircle03Icon,
} as const satisfies Record<string, IconSvgElement>;

export type IconName = keyof typeof ICON_MAP;

export function Icon({
  name,
  className,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
  style,
}: {
  name: IconName;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-label"?: string;
  style?: CSSProperties;
}) {
  return (
    <HugeiconsIcon
      icon={ICON_MAP[name]}
      className={cn(className)}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
      style={style}
      data-icon={name}
    />
  );
}
