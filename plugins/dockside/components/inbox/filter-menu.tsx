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
} from "@/lib/thread-management";

const FILTER_GROUP_LABELS: Readonly<Record<ThreadFilterGroup, string>> = {
  status: "Status",
  inactivity: "Inactivity",
};

const FILTER_GROUPS = ["status", "inactivity"] as const;

export function FilterMenu({
  value,
  onChange,
}: {
  value: ThreadFilterPreset;
  onChange: (value: ThreadFilterPreset) => void;
}) {
  const label = THREAD_FILTER_LABELS[value];
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (
          THREAD_FILTER_PRESETS.includes(next as ThreadFilterPreset)
        ) {
          onChange(next as ThreadFilterPreset);
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
          value !== "all" && "bg-primary/10 text-primary",
        )}
      >
        <Icon name="Filter" className="size-3.5 shrink-0" aria-hidden />
        {value === "all" ? null : (
          <span className="max-w-20 truncate text-2xs font-medium">{label}</span>
        )}
      </SelectTrigger>
      <SelectContent align="end" className="w-64 bg-background">
        <div className="px-2 pb-1.5 pt-1 text-xs font-semibold text-foreground">
          Filter workspaces
        </div>
        <FilterOption preset="all" />
        <FilterOption preset="status" />
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
      value={preset}
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
