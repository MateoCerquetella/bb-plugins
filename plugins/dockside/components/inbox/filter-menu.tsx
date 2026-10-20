import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  THREAD_FILTER_LABELS,
  type ThreadFilterPreset,
  type WorkspaceFilter,
} from "@/lib/thread-management";

const PROJECT_VALUE_PREFIX = "project:";

const GROUPING_OPTIONS = [
  { preset: "all", label: "Projects" },
  { preset: "status", label: "Status" },
  { preset: "environment", label: "Environment" },
] as const satisfies readonly FilterOption[];

const STATUS_OPTIONS = [
  { preset: "needs-you", label: "Needs your input" },
  { preset: "failed", label: "Failed" },
  { preset: "working", label: "Working" },
  { preset: "unread", label: "Unread" },
  { preset: "quiet", label: "Idle" },
] as const satisfies readonly FilterOption[];

const FILTER_OPTIONS: readonly FilterOption[] = [
  ...GROUPING_OPTIONS,
  ...STATUS_OPTIONS,
];

interface FilterOption {
  preset: ThreadFilterPreset;
  label: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

export function FilterMenu({
  value,
  onChange,
  projects,
}: {
  value: WorkspaceFilter;
  onChange: (value: WorkspaceFilter) => void;
  projects: readonly ProjectOption[];
}) {
  const selectedPreset = value.kind === "preset" ? value.preset : "all";
  const selectedProject =
    value.kind === "project"
      ? projects.find((project) => project.id === value.projectId)
      : undefined;
  const label = selectedProject?.name ?? THREAD_FILTER_LABELS[selectedPreset];
  const selectedValue = selectedProject
    ? `${PROJECT_VALUE_PREFIX}${selectedProject.id}`
    : selectedPreset;
  const filtered = value.kind === "project" || selectedPreset !== "all";

  return (
    <Select
      value={selectedValue}
      onValueChange={(next) => {
        if (next.startsWith(PROJECT_VALUE_PREFIX)) {
          onChange({
            kind: "project",
            projectId: next.slice(PROJECT_VALUE_PREFIX.length),
          });
          return;
        }
        const option = FILTER_OPTIONS.find(({ preset }) => preset === next);
        if (option) onChange({ kind: "preset", preset: option.preset });
      }}
    >
      <SelectTrigger
        hideChevron
        aria-label={`Filter chats: ${label}`}
        title={`Filter chats: ${label}`}
        className={cn(
          "size-7 shrink-0 justify-center rounded-md border-0 p-0 text-muted-foreground shadow-none",
          "hover:bg-sidebar-accent hover:text-foreground focus:ring-1 focus:ring-ring",
          filtered && "bg-sidebar-accent text-foreground",
        )}
      >
        <Icon name="Filter" className="size-3.5" aria-hidden />
      </SelectTrigger>
      <SelectContent align="end" className="w-52 bg-background">
        <SelectGroup>
          <SelectLabel>Group by</SelectLabel>
          {GROUPING_OPTIONS.map((option) => (
            <FilterOptionItem key={option.preset} option={option} />
          ))}
        </SelectGroup>
        {projects.length > 0 ? (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Projects</SelectLabel>
              {projects.map((project) => (
                <SelectItem
                  key={project.id}
                  value={`${PROJECT_VALUE_PREFIX}${project.id}`}
                  className="h-7 py-1 text-xs"
                >
                  {project.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        ) : null}
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Status</SelectLabel>
          {STATUS_OPTIONS.map((option) => (
            <FilterOptionItem key={option.preset} option={option} />
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function FilterOptionItem({ option }: { option: FilterOption }) {
  return (
    <SelectItem value={option.preset} className="h-7 py-1 text-xs">
      {option.label}
    </SelectItem>
  );
}
