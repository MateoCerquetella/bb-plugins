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
  THREAD_FILTER_OPTIONS,
  THREAD_FILTER_PRESETS,
  type ThreadFilterGroup,
  type ThreadFilterPreset,
  type WorkspaceFilter,
} from "@/lib/thread-management";

const FILTER_GROUP_LABELS: Readonly<Record<ThreadFilterGroup, string>> = {
  status: "Status",
  inactivity: "Inactivity",
};

const FILTER_GROUPS = ["status", "inactivity"] as const;

export function FilterMenu({
  value,
  projects,
  onChange,
}: {
  value: WorkspaceFilter;
  projects: readonly { id: string; name: string }[];
  onChange: (value: WorkspaceFilter) => void;
}) {
  const label =
    value.kind === "preset"
      ? THREAD_FILTER_LABELS[value.preset]
      : projects.find((project) => project.id === value.projectId)?.name ??
        "Project";
  const selectedValue =
    value.kind === "preset"
      ? presetValue(value.preset)
      : projectValue(value.projectId);

  return (
    <Select
      value={selectedValue}
      onValueChange={(next) => {
        const preset = THREAD_FILTER_PRESETS.find(
          (candidate) => next === presetValue(candidate),
        );
        if (preset) {
          onChange({ kind: "preset", preset });
          return;
        }
        const project = projects.find(
          (candidate) => next === projectValue(candidate.id),
        );
        if (project) {
          onChange({ kind: "project", projectId: project.id });
        }
      }}
    >
      <SelectTrigger
        hideChevron
        aria-label={`Filter workspaces: ${label}`}
        title={`Filter workspaces: ${label}`}
        className={cn(
          "h-6 w-auto min-w-6 shrink-0 justify-center gap-1 border-0 px-1.5 text-muted-foreground shadow-none",
          "hover:bg-sidebar-accent hover:text-foreground focus:ring-1 focus:ring-ring",
          selectedValue !== presetValue("all") && "bg-primary/10 text-primary",
        )}
      >
        <Icon name="Filter" className="size-3.5 shrink-0" aria-hidden />
        {selectedValue === presetValue("all") ? null : (
          <span className="max-w-20 truncate text-2xs font-medium">{label}</span>
        )}
      </SelectTrigger>
      <SelectContent align="end" className="w-64 bg-background">
        <div className="px-2 pb-1.5 pt-1 text-xs font-semibold text-foreground">
          Filter workspaces
        </div>
        <FilterOption preset="all" />
        <FilterOption preset="status" />
        {projects.length > 0 ? (
          <SelectGroup>
            <SelectSeparator />
            <SelectLabel className="pb-0.5 pt-1">Projects</SelectLabel>
            {projects.map((project) => (
              <SelectItem
                key={project.id}
                value={projectValue(project.id)}
                className="py-1 pl-2 pr-8 text-xs font-medium focus:bg-sidebar-accent"
              >
                <span className="truncate text-foreground">{project.name}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
        {FILTER_GROUPS.map((group) => (
          <SelectGroup key={group}>
            <SelectSeparator />
            <SelectLabel className="pb-0.5 pt-1">
              {FILTER_GROUP_LABELS[group]}
            </SelectLabel>
            {THREAD_FILTER_OPTIONS.filter(
              (option) => option.group === group,
            ).map((option) => (
              <FilterOption key={option.preset} preset={option.preset} />
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterOption({ preset }: { preset: ThreadFilterPreset }) {
  const option = THREAD_FILTER_OPTIONS.find((entry) => entry.preset === preset);
  if (!option) return null;

  return (
    <SelectItem
      value={presetValue(preset)}
      className="items-start py-1 pl-2 pr-8 focus:bg-sidebar-accent"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-xs font-medium leading-4 text-foreground">
          {option.label}
        </span>
        <span className="whitespace-normal text-2xs leading-3 text-muted-foreground">
          {option.description}
        </span>
      </span>
    </SelectItem>
  );
}

function presetValue(preset: ThreadFilterPreset): string {
  return `preset:${preset}`;
}

function projectValue(projectId: string): string {
  return `project:${projectId}`;
}
