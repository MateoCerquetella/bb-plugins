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

export function FilterMenu({
  value,
  onChange,
}: {
  value: WorkspaceFilter;
  onChange: (value: WorkspaceFilter) => void;
}) {
  const selectedPreset = value.kind === "preset" ? value.preset : "all";
  const label = THREAD_FILTER_LABELS[selectedPreset];

  return (
    <Select
      value={selectedPreset}
      onValueChange={(value) => {
        const option = FILTER_OPTIONS.find(({ preset }) => preset === value);
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
          selectedPreset !== "all" && "bg-sidebar-accent text-foreground",
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
