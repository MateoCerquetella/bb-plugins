import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from 'react';
import {
  Markdown,
  definePluginApp,
  useBbContext,
  useBbNavigate,
  useComposer,
  useComposerView,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  type PluginNavPanelProps,
  type PluginNewThreadPanelProps,
  type PluginPendingInteractionProps,
  type PluginThreadHeaderActionProps,
  type PluginThreadPanelProps
} from '@get-bb/plugin-sdk/app';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Icon, type IconName } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import type {
  ProjectConfigMutation,
  ProjectConfigView,
  AssigneeConfirmation,
  ProjectCredentialsInteractionResponse,
  CreateIssueContext,
  CreateIssueMetadata,
  CreateIssueOption,
  IssueDraftRecord,
  SecretMutation,
  TrackerProject,
  WorkItem,
  WorkItemDetail,
  WorkSource,
  WorkStateCategory,
  WorkStatusOption,
  TaskboardRpcContract
} from './contract.js';
import {
  CREATE_OUTCOME_UNCERTAIN_MARKER,
  FILTER_PRESET_NAME_MAX_LENGTH,
  type FilterPreset,
  formatWorkItemHandoffPrompt
} from './contract.js';
import {
  defaultProjectBoardSettings,
  projectBoardSettingsSchema,
  type ProjectBoardSettings,
  type TrackerView,
  type WorkItemFilterField
} from './board-settings.js';
import {
  jiraBaseUrlSchema,
  projectCredentialsInteractionPayloadSchema,
  projectCredentialsInteractionResponseSchema
} from './credential-contract.js';
import {
  assigneeAvatarIdentity,
  assigneeFilterOptions,
  canonicalizeSelectedFilterOptions,
  filterWorkItemsByAttributes,
  isFilterOptionSelected,
  labelFilterOptions,
  priorityFilterOptions,
  projectFilterOptions,
  sortWorkItemsByWorkflow,
  statusFilterOptions,
  toggleFilterOptionSelection,
  workflowStatusLaneKey,
  workflowStatusLanes,
  workflowStatusTone,
  workflowStatusGroups,
  type FilterOption
} from './browse.js';
import {
  ACROSS_PROJECTS_SCOPE,
  MAX_BROWSE_QUERY_LENGTH,
  browsePreferenceStore,
  createAssigneeScope,
  isGroupCollapsed,
  projectBrowseScope,
  rememberCreateAssigneeAfterSuccess,
  restoreRememberedCreateAssignee,
  toggleGroupCollapsedOverride,
  type BrowsePreferences,
  type BrowsePreferenceScope
} from './browse-preferences.js';
import {
  availableContextProjectId,
  contextSelectionToken,
  previousProjectRouteContext,
  projectRouteContext,
  shouldApplyContextProject,
  type NavigationEntryLike,
  type ProjectRouteContext
} from './project-selection.js';
import './app.css';

const PANEL_PATH = 'tasks';
const THREAD_PANEL_ACTION_ID = 'taskboard-panel';
const ALL_SOURCES = 'all';
const RIGHT_PANEL_PINNED_STORAGE_KEY = 'bb-taskboard:right-panel-pinned';
const RIGHT_PANEL_PIN_EVENT = 'bb-taskboard:right-panel-pin-changed';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'bb-taskboard:sidebar-collapsed';
const SIDEBAR_WIDTH_STORAGE_KEY = 'bb-taskboard:sidebar-width';
const LAST_PROJECT_STORAGE_KEY = 'bb-taskboard:last-project';
const SIDEBAR_AUTO_COLLAPSE_WIDTH = 720;
const SIDEBAR_DEFAULT_WIDTH = 208;
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 340;
const CREATE_METADATA_NETWORK_ERROR =
  'Taskboard could not load issue creation options. Check the connection and try again.';

const STATE_CATEGORY_ORDER: readonly WorkStateCategory[] = [
  'in_progress',
  'todo',
  'backlog',
  'done',
  'canceled'
];

const STATE_CATEGORY_LABELS: Readonly<Record<WorkStateCategory, string>> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In progress',
  done: 'Done',
  canceled: 'Canceled'
};

type FilterPresentationKey = 'source' | WorkItemFilterField;
interface FilterPresentation {
  label: string;
  icon: IconName;
  description: string;
}

const FILTER_PRESENTATION = {
  source: {
    label: 'Source',
    icon: 'GitBranch',
    description: 'The external tracker selected for the work.'
  },
  state: {
    label: 'State group',
    icon: 'Circle',
    description: 'Broad Backlog, Todo, In progress, Done, and Canceled groups.'
  },
  status: {
    label: 'Status',
    icon: 'Workflow',
    description: 'Exact provider workflow states such as In Review or Blocked.'
  },
  assignee: {
    label: 'Assignee',
    icon: 'UserRound',
    description: 'People assigned to the work, including Unassigned.'
  },
  priority: {
    label: 'Priority',
    icon: 'AlertCircle',
    description: 'Urgent, High, Medium, Low, and unprioritized work.'
  },
  project: {
    label: 'Project',
    icon: 'Folder',
    description: 'The provider project, repository, or Jira project.'
  },
  labels: {
    label: 'Labels',
    icon: 'Layers',
    description: 'Provider labels, including work with no labels.'
  }
} as const satisfies Record<FilterPresentationKey, FilterPresentation>;

const BOARD_FILTER_FIELDS = [
  'state',
  'status',
  'assignee',
  'priority',
  'project',
  'labels'
] as const satisfies readonly WorkItemFilterField[];

const BOARD_FILTER_OPTIONS = BOARD_FILTER_FIELDS.map(field => ({
  field,
  ...FILTER_PRESENTATION[field]
}));

type SourceFilter = typeof ALL_SOURCES | WorkSource;

type TrackerRoute =
  | { kind: 'root' }
  | { kind: 'all' }
  | { kind: 'project'; projectId: string }
  | { kind: 'manage'; projectId: string | null }
  | {
      kind: 'item';
      projectId: string;
      source: WorkSource;
      locator: string;
    };

function loadLastProjectId(): string | null {
  try {
    return window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeLastProjectId(projectId: string): void {
  try {
    window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, projectId);
  } catch {
    // Persistence is best-effort in sandboxed browser contexts.
  }
}

function loadSourceProjectContext(): ProjectRouteContext | null {
  const browserNavigation = (
    window as Window & {
      navigation?: {
        currentEntry?: { index: number } | null;
        entries(): NavigationEntryLike[];
      };
    }
  ).navigation;
  const currentIndex = browserNavigation?.currentEntry?.index;
  if (browserNavigation !== undefined && currentIndex !== undefined) {
    try {
      return previousProjectRouteContext(
        browserNavigation.entries(),
        currentIndex,
        window.location.origin
      );
    } catch {
      // Fall back to the document referrer when navigation history is unavailable.
    }
  }
  return projectRouteContext(document.referrer, window.location.origin);
}

function ManageHeaderAction({ subPath }: PluginNavPanelProps) {
  const route = parseTrackerRoute(subPath);
  const { projectId: contextProjectId } = useBbContext();
  const navigate = useBbNavigate();
  const routeProjectId =
    route.kind === 'project' || route.kind === 'item'
      ? route.projectId
      : route.kind === 'manage'
        ? route.projectId
        : null;
  const projectId = routeProjectId ?? contextProjectId ?? loadLastProjectId();
  const showCreate = route.kind === 'root' || route.kind === 'project';

  return (
    <div className="flex items-center gap-1.5">
      {showCreate ? (
        <DirectCreateIssueAction projectId={projectId} variant="labeled" />
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          navigate.toPluginPanel(PANEL_PATH, {
            subPath: projectId
              ? routeToSubPath({ kind: 'manage', projectId })
              : 'manage'
          })
        }
      >
        <Icon name="Settings" className="size-4" />
        Manage
      </Button>
    </div>
  );
}

function encodeLocator(locator: string): string {
  // encodeURIComponent deliberately leaves "~" untouched, but this route uses
  // it as the percent-escape marker. Escape literal tildes first so arbitrary
  // external locators still round-trip without colliding with that marker.
  return encodeURIComponent(locator)
    .replaceAll('~', '%7E')
    .replaceAll('%', '~');
}

function decodeLocator(locator: string): string {
  try {
    return decodeURIComponent(locator.replaceAll('~', '%'));
  } catch {
    return '';
  }
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function isWorkSource(value: string): value is WorkSource {
  return value === 'linear' || value === 'github' || value === 'jira';
}

function sourceName(source: WorkSource): string {
  if (source === 'github') return 'GitHub';
  if (source === 'jira') return 'Jira';
  return 'Linear';
}

const TRACKER_OPTIONS: ReadonlyArray<{
  source: WorkSource;
  description: string;
}> = [
  { source: 'github', description: 'Repository issues' },
  { source: 'linear', description: 'Team issues' },
  { source: 'jira', description: 'JQL-filtered issues' }
];

function SourceGlyph({ source }: { source: WorkSource }) {
  if (source === 'github') {
    return <Icon name="Github" className="size-3.5" aria-hidden="true" />;
  }

  if (source === 'linear') {
    return (
      <svg aria-hidden="true" className="size-3.5" viewBox="0 0 16 16">
        <circle
          cx="8"
          cy="8"
          r="5.65"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
        />
        <path
          d="m3.6 10.7 1.7 1.7M2.85 8l5.15 5.15M3.65 5.25l7.1 7.1"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.35"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="size-3.5" viewBox="0 0 16 16">
      <path
        d="M8 1.4 14.6 8 8 14.6 1.4 8 8 1.4Z"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M8 3.9 12.1 8 8 12.1 3.9 8 8 3.9Z"
        fill="currentColor"
        opacity="0.52"
      />
      <path d="M8 6.15 9.85 8 8 9.85 6.15 8 8 6.15Z" fill="currentColor" />
    </svg>
  );
}

function SourceMark({
  source,
  className
}: {
  source: WorkSource;
  className?: string;
}) {
  const name = sourceName(source);
  return (
    <span
      data-source={source}
      className={cn(
        'tb-source-mark inline-flex shrink-0 items-center gap-1.5 text-xs',
        className
      )}
      title={name}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-3.5 shrink-0 items-center justify-center"
        data-source-glyph={source}
      >
        <SourceGlyph source={source} />
      </span>
      <span className="tb-source-mark-name">{name}</span>
    </span>
  );
}

interface CreatedIssueResult {
  item: WorkItem;
  warnings: string[];
  assigneeConfirmation: AssigneeConfirmation;
  mention: {
    provider: 'external-work-item';
    id: string;
    label: string;
  };
}

function titleFromPrompt(prompt: string): string {
  const firstLine = prompt
    .split(/\r?\n/u)
    .map(line => line.trim())
    .find(Boolean);
  if (!firstLine) return '';
  return firstLine.replace(/^#{1,6}\s+/u, '').slice(0, 120);
}

function createOptionLabel(
  options: readonly CreateIssueOption[],
  value: string | null,
  fallback: string
): string {
  if (!value) return fallback;
  return options.find(option => option.id === value)?.label ?? fallback;
}

function IssuePropertySelect({
  icon,
  label,
  value,
  options,
  onChange,
  disabled = false
}: {
  icon: IconName;
  label: string;
  value: string | null;
  options: readonly CreateIssueOption[];
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-lg bg-background px-2.5 text-xs font-medium shadow-none"
          disabled={disabled}
          aria-label={`${label}: ${createOptionLabel(options, value, `No ${label.toLowerCase()}`)}`}
        >
          <Icon name={icon} className="size-3.5 text-muted-foreground" />
          <span className={cn(!value && 'text-muted-foreground')}>
            {createOptionLabel(options, value, label)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 min-w-56 overflow-y-auto"
        mobileTitle={label}
      >
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <span className="text-muted-foreground">
            No {label.toLowerCase()}
          </span>
          {value === null ? (
            <Icon name="Check" className="ml-auto size-3.5" />
          ) : null}
        </DropdownMenuItem>
        {options.map(option => (
          <DropdownMenuItem
            key={option.id}
            onSelect={() => onChange(option.id)}
          >
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {value === option.id ? (
              <Icon name="Check" className="ml-auto size-3.5" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function IssueLabelsSelect({
  options,
  values,
  onChange,
  disabled = false
}: {
  options: readonly CreateIssueOption[];
  values: readonly string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-lg bg-background px-2.5 text-xs font-medium shadow-none"
          disabled={disabled}
          aria-label={`${values.length} labels selected`}
        >
          <Icon name="Layers" className="size-3.5 text-muted-foreground" />
          <span className={cn(values.length === 0 && 'text-muted-foreground')}>
            {values.length === 0
              ? 'Labels'
              : `${values.length} label${values.length === 1 ? '' : 's'}`}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 min-w-56 overflow-y-auto"
        mobileTitle="Labels"
      >
        {options.map(option => (
          <DropdownMenuCheckboxItem
            key={option.id}
            checked={values.includes(option.id)}
            onSelect={event => event.preventDefault()}
            onCheckedChange={checked => {
              onChange(
                checked
                  ? [...new Set([...values, option.id])]
                  : values.filter(value => value !== option.id)
              );
            }}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type CreateIssueDialogProps = {
  projectId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (result: CreatedIssueResult) => void;
} & (
  | { mode: 'direct' }
  | {
      mode: 'composer-assisted';
      draftRequestId: string;
      initialPrompt: string;
      onRegenerate: () => void;
    }
);

function CreateIssueDialog(props: CreateIssueDialogProps) {
  const { projectId, open, onOpenChange, onCreated } = props;
  const assisted = props.mode === 'composer-assisted';
  const draftRequestId = assisted ? props.draftRequestId : null;
  const initialPrompt = assisted ? props.initialPrompt : '';
  const rpc = useRpc<TaskboardRpcContract>();
  const navigate = useBbNavigate();
  const formId = useId();
  const metadataErrorId = `${formId}-metadata-error`;
  const [context, setContext] = useState<CreateIssueContext>();
  const [contextError, setContextError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [issueType, setIssueType] = useState('');
  const [metadata, setMetadata] = useState<CreateIssueMetadata>();
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [loadedMetadataScope, setLoadedMetadataScope] = useState<string | null>(
    null
  );
  const [loadedConnectorRevision, setLoadedConnectorRevision] = useState<
    number | null
  >(null);
  const [metadataRevision, setMetadataRevision] = useState(0);
  const [statusId, setStatusId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [priorityId, setPriorityId] = useState<string | null>(null);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<
    IssueDraftRecord['status'] | 'idle' | 'manual'
  >('idle');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createOutcomeUncertain, setCreateOutcomeUncertain] = useState(false);
  const draftRevisionRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setContext(undefined);
    setContextError(null);
    setTitle('');
    setDescription('');
    setDestinationId('');
    setIssueType('');
    setMetadata(undefined);
    setMetadataLoading(false);
    setMetadataError(null);
    setLoadedMetadataScope(null);
    setLoadedConnectorRevision(null);
    setStatusId(null);
    setAssigneeId(null);
    setPriorityId(null);
    setLabelIds([]);
    setDueDate('');
    setMilestoneId(null);
    setDraftStatus(assisted ? 'idle' : 'manual');
    setDraftError(null);
    setCreating(false);
    setCreateError(null);
    setCreateOutcomeUncertain(false);
    if (!projectId) {
      setContextError('Choose a BB project before creating an issue.');
      return;
    }
    let active = true;
    void rpc
      .call('getCreateIssueContext', { projectId })
      .then(result => {
        if (!active) return;
        setContext(result.context);
        setDestinationId(result.context.defaultDestinationId ?? '');
        setIssueType(result.context.defaultIssueType ?? '');
      })
      .catch(error => {
        if (active) setContextError(describeError(error));
      });
    return () => {
      active = false;
    };
  }, [assisted, draftRequestId, initialPrompt, open, projectId, rpc]);

  useEffect(() => {
    setMetadata(undefined);
    setMetadataLoading(false);
    setMetadataError(null);
    setLoadedMetadataScope(null);
    setLoadedConnectorRevision(null);
    setStatusId(null);
    setAssigneeId(null);
    setPriorityId(null);
    setLabelIds([]);
    setDueDate('');
    setMilestoneId(null);
    if (
      !open ||
      !projectId ||
      context?.available !== true ||
      destinationId.trim() === ''
    ) {
      return;
    }
    const requestedIssueType =
      context.source === 'jira' ? issueType.trim() || null : null;
    let active = true;
    setMetadataLoading(true);
    const timeout = window.setTimeout(() => {
      void rpc
        .call('getCreateIssueMetadata', {
          projectId,
          expectedSource: context.source,
          destinationId,
          issueType: requestedIssueType
        })
        .then(result => {
          if (!active) return;
          if (!result.ok) {
            setMetadataError(result.error.safeMessage);
            return;
          }
          const selectedIssueType =
            requestedIssueType &&
            result.metadata.issueTypeOptions.some(
              option => option.id === requestedIssueType
            )
              ? requestedIssueType
              : result.metadata.defaultIssueTypeId;
          const resolvedScope = createAssigneeScope(
            projectId,
            context.source,
            destinationId,
            context.source === 'jira' ? selectedIssueType : null
          );
          setMetadata(result.metadata);
          setLoadedMetadataScope(JSON.stringify(resolvedScope));
          setLoadedConnectorRevision(result.connectorRevision);
          setStatusId(result.metadata.defaultStatusId);
          if (selectedIssueType) {
            setIssueType(selectedIssueType);
          }
          setAssigneeId(
            restoreRememberedCreateAssignee(
              resolvedScope,
              result.metadata.assigneeOptions
            )
          );
        })
        .catch(() => {
          if (active) {
            setMetadataError(CREATE_METADATA_NETWORK_ERROR);
          }
        })
        .finally(() => {
          if (active) setMetadataLoading(false);
        });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [
    context,
    destinationId,
    issueType,
    metadataRevision,
    open,
    projectId,
    rpc
  ]);

  useEffect(() => {
    if (
      !assisted ||
      !draftRequestId ||
      !open ||
      !projectId ||
      context?.available !== true
    ) {
      return;
    }
    const revision = ++draftRevisionRef.current;
    let active = true;
    const isActive = () =>
      active && draftRevisionRef.current === revision;
    const useFallback = (error: unknown) => {
      if (!isActive()) return;
      setTitle(titleFromPrompt(initialPrompt));
      setDescription(initialPrompt.trim());
      setDraftStatus('failed');
      setDraftError(describeError(error));
    };

    setDraftStatus('running');
    setDraftError(null);
    void (async () => {
      try {
        await rpc.call('startIssueDraft', {
          requestId: draftRequestId,
          projectId,
          prompt: initialPrompt
        });
        while (isActive()) {
          const { draft } = await rpc.call('getIssueDraft', {
            requestId: draftRequestId
          });
          if (!isActive()) return;
          if (draft === null) {
            throw new Error('The issue draft is no longer available.');
          }
          if (draft.status === 'complete') {
            setTitle(draft.title);
            setDescription(draft.description);
            setDraftStatus('complete');
            return;
          }
          if (draft.status === 'failed') {
            throw new Error(draft.error);
          }
          await new Promise(resolve => setTimeout(resolve, 700));
        }
      } catch (error) {
        useFallback(error);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    assisted,
    context?.available,
    draftRequestId,
    initialPrompt,
    open,
    projectId,
    rpc
  ]);

  const discardDraft = () => {
    if (!draftRequestId) return;
    void rpc
      .call('cancelIssueDraft', { requestId: draftRequestId })
      .catch(() => undefined);
  };

  const closeDialog = () => {
    draftRevisionRef.current += 1;
    discardDraft();
    onOpenChange(false);
  };

  const useOriginalPrompt = () => {
    if (!assisted) return;
    draftRevisionRef.current += 1;
    discardDraft();
    setTitle(titleFromPrompt(initialPrompt));
    setDescription(initialPrompt.trim());
    setDraftStatus('manual');
    setDraftError(null);
  };

  const currentMetadataScope =
    projectId && context?.available === true && destinationId.trim() !== ''
      ? JSON.stringify(
          createAssigneeScope(
            projectId,
            context.source,
            destinationId,
            context.source === 'jira' ? issueType.trim() || null : null
          )
        )
      : null;

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !projectId ||
      !context?.available ||
      creating ||
      createOutcomeUncertain ||
      metadataLoading ||
      loadedConnectorRevision === null ||
      currentMetadataScope === null ||
      loadedMetadataScope !== currentMetadataScope
    ) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const submittedScope = createAssigneeScope(
        projectId,
        context.source,
        destinationId,
        context.source === 'jira' ? issueType.trim() || null : null
      );
      const result = await rememberCreateAssigneeAfterSuccess(
        rpc.call('createIssue', {
          projectId,
          expectedSource: context.source,
          connectorRevision: loadedConnectorRevision,
          title,
          description,
          destinationId,
          issueType: context.source === 'jira' ? issueType : null,
          statusId,
          assigneeId,
          priorityId,
          labelIds,
          dueDate: dueDate || null,
          milestoneId
        }),
        submittedScope,
        assigneeId
      );
      onCreated?.(result);
      toast.success(`${result.item.key} created in ${sourceName(result.item.source)}`);
      if (result.warnings.length > 0) {
        toast.warning(result.warnings.join(' '));
      }
      discardDraft();
      onOpenChange(false);
    } catch (error) {
      const message = describeError(error);
      const uncertain = message.includes(CREATE_OUTCOME_UNCERTAIN_MARKER);
      setCreateOutcomeUncertain(uncertain);
      setCreateError(
        message.replace(CREATE_OUTCOME_UNCERTAIN_MARKER, '').trim()
      );
    } finally {
      setCreating(false);
    }
  };

  const canSubmit =
    context?.available === true &&
    !createOutcomeUncertain &&
    !metadataLoading &&
    loadedConnectorRevision !== null &&
    currentMetadataScope !== null &&
    loadedMetadataScope === currentMetadataScope &&
    (!assisted || !['idle', 'running'].includes(draftStatus)) &&
    title.trim() !== '' &&
    destinationId.trim() !== '' &&
    (context.source !== 'jira' || issueType.trim() !== '');

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (!creating) {
          if (nextOpen) onOpenChange(true);
          else closeDialog();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-7">
            {context ? <SourceGlyph source={context.source} /> : null}
            <DialogTitle>
              {context
                ? `${context.projectName} · ${sourceName(context.source)} · New issue`
                : 'Prepare issue'}
            </DialogTitle>
          </div>
          <DialogDescription>
            {context === undefined
              ? 'Loading the tracker configured for this BB project…'
              : !context.available
                ? `Finish setting up ${sourceName(context.source)} for this project.`
                : !assisted
                  ? `Create an issue directly in the tracker configured for ${context.projectName}.`
                : draftStatus === 'complete'
                  ? `Drafted from your prompt and the ${context.projectName} repository.`
                  : draftStatus === 'manual'
                    ? 'The original prompt is ready for review.'
                  : draftStatus === 'failed'
                    ? 'The original prompt is ready as an editable fallback.'
                    : `Reading ${context.projectName} and structuring the ticket…`}
          </DialogDescription>
        </DialogHeader>

        {contextError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p role="alert" className="text-sm text-destructive">
              {contextError}
            </p>
          </div>
        ) : context === undefined ? (
          <div className="space-y-3 py-1" aria-label="Loading issue form">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : !context.available ? (
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <p role="alert" className="text-sm text-muted-foreground">
              {context.message ?? `${sourceName(context.source)} is not ready.`}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                closeDialog();
                navigate.toPluginPanel(PANEL_PATH, {
                  subPath: routeToSubPath({
                    kind: 'manage',
                    projectId: context.projectId
                  })
                });
              }}
            >
              <Icon name="Settings" className="size-4" />
              Manage Taskboard
            </Button>
          </div>
        ) : (
          <form id={formId} className="grid gap-4" onSubmit={create}>
            <div className="grid gap-1.5">
              <label
                htmlFor={`${formId}-destination`}
                className="text-xs font-semibold"
              >
                {context.destinationLabel}
              </label>
              {context.allowsCustomDestination ? (
                <Input
                  id={`${formId}-destination`}
                  value={destinationId}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="ENG"
                  disabled={creating}
                  onChange={event => {
                    setDestinationId(event.target.value);
                    setCreateError(null);
                  }}
                />
              ) : context.destinations.length > 1 ? (
                <Select
                  value={destinationId}
                  disabled={creating}
                  onValueChange={value => {
                    setDestinationId(value);
                    setCreateError(null);
                  }}
                >
                  <SelectTrigger id={`${formId}-destination`} className="w-full">
                    <SelectValue placeholder={`Choose ${context.destinationLabel.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {context.destinations.map(destination => (
                      <SelectItem key={destination.id} value={destination.id}>
                        {destination.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div
                  id={`${formId}-destination`}
                  className="flex h-9 items-center rounded-md border border-border bg-surface-recessed-solid px-3 text-sm"
                >
                  {context.destinations[0]?.label}
                </div>
              )}
              {context.source === 'jira' && context.destinations.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Taskboard could not infer a project key from the JQL, so enter it here.
                </p>
              ) : null}
            </div>

            {assisted &&
            (draftStatus === 'idle' || draftStatus === 'running') ? (
              <div
                className="grid gap-3 rounded-lg border border-border bg-surface-recessed-solid p-3"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-start gap-2.5">
                  <Icon
                    name="Loading"
                    className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      Structuring your issue
                    </p>
                    <p className="text-xs text-muted-foreground">
                      A model is reading relevant repository context and turning
                      the prompt into a title, description, and acceptance criteria.
                    </p>
                  </div>
                </div>
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-32 w-full" />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={useOriginalPrompt}
                  >
                    Use original prompt
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {assisted ? (
                  <div
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg border p-3',
                      draftStatus === 'failed'
                        ? 'border-destructive/30 bg-destructive/5'
                        : 'border-border bg-surface-recessed-solid'
                    )}
                  >
                    <Icon
                      name={
                        draftStatus === 'failed'
                          ? 'AlertCircle'
                          : draftStatus === 'manual'
                            ? 'ListTodo'
                            : 'AiContentGenerator01'
                      }
                      className={cn(
                        'mt-0.5 size-4 shrink-0',
                        draftStatus === 'failed'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      )}
                      aria-hidden="true"
                    />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        {draftStatus === 'failed'
                          ? 'Repository-aware draft unavailable'
                          : draftStatus === 'manual'
                            ? 'Using the original prompt'
                            : 'Drafted with repository context'}
                      </p>
                      <p
                        className={cn(
                          'text-xs',
                          draftStatus === 'failed'
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                        )}
                      >
                        {draftStatus === 'failed'
                          ? `${draftError ?? 'The drafting model failed.'} Review the original prompt below before creating.`
                          : draftStatus === 'manual'
                            ? 'Review and edit the prompt below before creating the issue.'
                            : 'Review and edit the generated ticket before it is created.'}
                      </p>
                      {draftStatus === 'failed' || draftStatus === 'manual' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="mt-1 -ml-2"
                          disabled={creating}
                          onClick={() => {
                            if (props.mode === 'composer-assisted') {
                              props.onRegenerate();
                            }
                          }}
                        >
                          <Icon
                            name="ArrowReloadHorizontal"
                            className="size-3.5"
                          />
                          Try repository draft again
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-1.5">
                  <label
                    htmlFor={`${formId}-title`}
                    className="text-xs font-semibold"
                  >
                    Title
                  </label>
                  <Input
                    id={`${formId}-title`}
                    value={title}
                    autoFocus
                    maxLength={500}
                    placeholder="What needs to be done?"
                    disabled={creating}
                    onChange={event => {
                      setTitle(event.target.value);
                      setCreateError(null);
                    }}
                  />
                </div>

                <div className="grid gap-1.5">
                  <label
                    htmlFor={`${formId}-description`}
                    className="text-xs font-semibold"
                  >
                    Description
                  </label>
                  <Textarea
                    id={`${formId}-description`}
                    value={description}
                    rows={9}
                    maxLength={100_000}
                    placeholder="Add context, acceptance criteria, or links…"
                    disabled={creating}
                    onChange={event => {
                      setDescription(event.target.value);
                      setCreateError(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Markdown is supported by GitHub and Linear. Jira receives formatted text.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 border-t border-border-hairline pt-3">
                  {metadataLoading ? (
                    <>
                      <Skeleton className="h-8 w-20 rounded-lg" />
                      <Skeleton className="h-8 w-24 rounded-lg" />
                      <Skeleton className="h-8 w-20 rounded-lg" />
                    </>
                  ) : metadata ? (
                    <>
                      {metadata.statusOptions.length > 0 ? (
                        <IssuePropertySelect
                          icon="Circle"
                          label="Status"
                          value={statusId}
                          options={metadata.statusOptions}
                          onChange={setStatusId}
                          disabled={creating}
                        />
                      ) : null}
                      {metadata.assigneeOptions.length > 0 ? (
                        <IssuePropertySelect
                          icon="UserRound"
                          label="Assignee"
                          value={assigneeId}
                          options={metadata.assigneeOptions}
                          onChange={setAssigneeId}
                          disabled={creating}
                        />
                      ) : null}
                      {metadata.priorityOptions.length > 0 ? (
                        <IssuePropertySelect
                          icon="ChartColumn"
                          label="Priority"
                          value={priorityId}
                          options={metadata.priorityOptions}
                          onChange={setPriorityId}
                          disabled={creating}
                        />
                      ) : null}
                      {metadata.labelOptions.length > 0 ? (
                        <IssueLabelsSelect
                          options={metadata.labelOptions}
                          values={labelIds}
                          onChange={setLabelIds}
                          disabled={creating}
                        />
                      ) : null}
                      {metadata.supportsDueDate ? (
                        <label className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
                          <Icon
                            name="Calendar"
                            className="size-3.5 text-muted-foreground"
                          />
                          <span className="sr-only">Due date</span>
                          <input
                            type="date"
                            value={dueDate}
                            disabled={creating}
                            aria-label="Due date"
                            className="w-[7.3rem] border-0 bg-transparent p-0 text-xs outline-none disabled:opacity-60"
                            onChange={event => setDueDate(event.target.value)}
                          />
                        </label>
                      ) : null}
                      {metadata.milestoneOptions.length > 0 ? (
                        <IssuePropertySelect
                          icon="Target"
                          label="Milestone"
                          value={milestoneId}
                          options={metadata.milestoneOptions}
                          onChange={setMilestoneId}
                          disabled={creating}
                        />
                      ) : null}
                      {metadata.issueTypeOptions.length > 0 ? (
                        <IssuePropertySelect
                          icon="Ticket"
                          label="Issue type"
                          value={issueType || null}
                          options={metadata.issueTypeOptions}
                          onChange={value => setIssueType(value ?? '')}
                          disabled={creating}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {metadataError ? (
                    <div
                      id={metadataErrorId}
                      role="alert"
                      className="flex min-w-0 items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive"
                    >
                      <Icon
                        name="AlertCircle"
                        className="mt-0.5 size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-xs font-medium">
                          Couldn&apos;t load creation options
                        </p>
                        <p className="break-words text-xs">{metadataError}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs"
                        disabled={metadataLoading}
                        onClick={() => setMetadataRevision(value => value + 1)}
                      >
                        {metadataLoading ? 'Retrying…' : 'Retry'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </>
            )}

            {createError ? (
              <p role="alert" className="text-sm text-destructive">
                {createError}
              </p>
            ) : null}

            <DialogFooter className="border-t border-border-hairline pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={creating}
                onClick={closeDialog}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!canSubmit || creating}
                aria-describedby={metadataError ? metadataErrorId : undefined}
              >
                {creating ? 'Creating…' : `Create ${sourceName(context.source)} issue`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DirectCreateIssueAction({
  projectId,
  variant
}: {
  projectId: string | null;
  variant: 'labeled' | 'icon';
}) {
  const [launchProjectId, setLaunchProjectId] = useState<string | null>(null);
  const open = launchProjectId !== null;
  const label = projectId
    ? 'Create a new Taskboard issue'
    : 'Choose a BB project before creating an issue';
  const button = (
    <Button
      type="button"
      variant={variant === 'labeled' ? 'outline' : 'ghost'}
      size={variant === 'labeled' ? 'sm' : 'icon'}
      className={cn(
        variant === 'icon' &&
          'size-9 shrink-0 focus-visible:ring-2 focus-visible:ring-ring'
      )}
      aria-label={label}
      disabled={!projectId}
      onClick={() => {
        if (projectId) setLaunchProjectId(projectId);
      }}
    >
      <Icon
        name={variant === 'labeled' ? 'Ticket' : 'Plus'}
        className="size-4"
      />
      {variant === 'labeled' ? 'New issue' : null}
    </Button>
  );
  return (
    <>
      {variant === 'icon' ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      {launchProjectId ? (
        <CreateIssueDialog
          mode="direct"
          projectId={launchProjectId}
          open={open}
          onOpenChange={nextOpen => {
            if (!nextOpen) setLaunchProjectId(null);
          }}
        />
      ) : null}
    </>
  );
}

function ComposerCreateIssueAction() {
  const view = useComposerView();
  const composer = useComposer();
  const { projectId: contextProjectId } = useBbContext();
  const [open, setOpen] = useState(false);
  const [draftSession, setDraftSession] = useState<{
    requestId: string;
    prompt: string;
  } | null>(null);
  const projectId =
    view.scope.kind === 'new-thread'
      ? (view.scope.projectId ?? contextProjectId)
      : contextProjectId;
  const hasPrompt = view.draft.text.trim().length > 0;
  const guidance = !projectId
    ? 'Choose a project to create an issue'
    : !hasPrompt
      ? 'Write a prompt to create an issue'
      : 'Turn prompt into Taskboard issue';

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center" data-taskboard-create-action>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 bg-transparent text-foreground hover:bg-state-hover"
                aria-label="Create Taskboard issue"
                data-taskboard-create-button
                disabled={!projectId || !hasPrompt || view.run.isSubmitting}
                onMouseDown={event => event.preventDefault()}
                onClick={() => {
                  if (!projectId) {
                    toast.error('Choose a BB project before creating an issue.');
                    return;
                  }
                  if (!hasPrompt) {
                    toast.info(
                      'Write a prompt first, then click the Taskboard ticket.'
                    );
                    composer.focus();
                    return;
                  }
                  setDraftSession({
                    requestId: globalThis.crypto.randomUUID(),
                    prompt: view.draft.text
                  });
                  setOpen(true);
                }}
              >
                <Icon name="Ticket" className="size-4" aria-hidden="true" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{guidance}</TooltipContent>
        </Tooltip>
        {draftSession ? (
          <CreateIssueDialog
            mode="composer-assisted"
            projectId={projectId}
            open={open}
            onOpenChange={setOpen}
            draftRequestId={draftSession.requestId}
            initialPrompt={draftSession.prompt}
            onRegenerate={() => {
              setDraftSession(current =>
                current
                  ? {
                      ...current,
                      requestId: globalThis.crypto.randomUUID()
                    }
                  : current
              );
            }}
            onCreated={result => {
              composer.insertMention(result.mention);
              composer.focus();
            }}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function parseTrackerRoute(rawSubPath: string): TrackerRoute {
  const path = rawSubPath.split('?', 1)[0] ?? '';
  const segments = path.split('/').filter(Boolean);
  const head = segments[0];
  if (head === undefined) return { kind: 'root' };
  if (head === 'all') return { kind: 'all' };
  if (head === 'manage') {
    return {
      kind: 'manage',
      projectId: segments[1] ? decodeSegment(segments[1]) : null
    };
  }
  if (head === 'item') {
    const projectId = segments[1];
    const source = segments[2];
    const encodedLocator = segments[3];
    if (projectId && source && isWorkSource(source) && encodedLocator) {
      const locator = decodeLocator(encodedLocator);
      if (locator) {
        return {
          kind: 'item',
          projectId: decodeSegment(projectId),
          source,
          locator
        };
      }
    }
    return { kind: 'all' };
  }
  return { kind: 'project', projectId: decodeSegment(head) };
}

function routeToSubPath(route: TrackerRoute): string {
  switch (route.kind) {
    case 'root':
      return '';
    case 'all':
      return 'all';
    case 'manage':
      return route.projectId
        ? `manage/${encodeURIComponent(route.projectId)}`
        : 'manage';
    case 'project':
      return encodeURIComponent(route.projectId);
    case 'item':
      return `item/${encodeURIComponent(route.projectId)}/${route.source}/${encodeLocator(route.locator)}`;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function changedProjectId(payload: unknown): string | null {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('projectId' in payload) ||
    typeof payload.projectId !== 'string'
  ) {
    return null;
  }
  return payload.projectId;
}

function useRefreshOnReconnect(refresh: () => void): void {
  const connectionState = useRealtimeConnectionState();
  const previousStateRef = useRef(connectionState);
  // "reconnecting" proves this shared socket connected before this component
  // mounted; only "connecting" is the initial, never-connected state.
  const hasConnectedRef = useRef(connectionState !== 'connecting');
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (
      connectionState === 'connected' &&
      hasConnectedRef.current &&
      previousStateRef.current !== 'connected'
    ) {
      refreshRef.current();
    }
    if (connectionState === 'connected') hasConnectedRef.current = true;
    previousStateRef.current = connectionState;
  }, [connectionState]);
}

function useProjectFilterPresets(projectId: string | null): {
  presets: readonly FilterPreset[];
  error: string | null;
  refreshError: string | null;
  loading: boolean;
  reload: (options?: { background?: boolean }) => Promise<void>;
  setAuthoritative: (presets: readonly FilterPreset[]) => void;
} {
  const rpc = useRpc<TaskboardRpcContract>();
  const [presets, setPresets] = useState<readonly FilterPreset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [loading, setLoading] = useState(projectId !== null);
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(
    projectId
  );
  const requestRevisionRef = useRef(0);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const reload = useCallback(async (
    options: { background?: boolean } = {}
  ) => {
    if (projectIdRef.current !== projectId) return;
    const requestRevision = ++requestRevisionRef.current;
    if (projectId === null) {
      setPresets([]);
      setError(null);
      setRefreshError(null);
      setLoading(false);
      setLoadedProjectId(null);
      return;
    }
    if (!options.background) {
      setPresets([]);
      setLoading(true);
      setLoadedProjectId(projectId);
      setError(null);
    }
    setRefreshError(null);
    try {
      const result = await rpc.call('listFilterPresets', { projectId });
      if (
        requestRevision !== requestRevisionRef.current ||
        projectIdRef.current !== projectId
      ) {
        return;
      }
      setPresets(result.presets);
      setError(null);
      setRefreshError(null);
      setLoadedProjectId(projectId);
    } catch (nextError) {
      if (
        requestRevision !== requestRevisionRef.current ||
        projectIdRef.current !== projectId
      ) {
        return;
      }
      const message = describeError(nextError);
      if (options.background) {
        setRefreshError(message);
      } else {
        setPresets([]);
        setError(message);
      }
      setLoadedProjectId(projectId);
    } finally {
      if (
        requestRevision === requestRevisionRef.current &&
        projectIdRef.current === projectId
      ) {
        setLoading(false);
      }
    }
  }, [projectId, rpc]);

  useEffect(() => {
    void reload();
    return () => {
      requestRevisionRef.current += 1;
    };
  }, [reload]);
  useRealtime('taskboard:presets-changed', payload => {
    if (projectId === null) return;
    const changedProject = changedProjectId(payload);
    if (changedProject === null || changedProject === projectId) {
      void reload({ background: true });
    }
  });
  useRefreshOnReconnect(() => {
    if (projectId !== null) void reload({ background: true });
  });

  const setAuthoritative = useCallback(
    (nextPresets: readonly FilterPreset[]) => {
      if (projectIdRef.current !== projectId) return;
      requestRevisionRef.current += 1;
      setPresets(nextPresets);
      setError(null);
      setRefreshError(null);
      setLoading(false);
      setLoadedProjectId(projectId);
      // A mutation result is authoritative for that request, but another
      // surface may have committed a later change while it was in flight.
      // Refresh after the response so the last completed read always wins.
      void reload({ background: true });
    },
    [projectId, reload]
  );

  const scopeMatches = loadedProjectId === projectId;
  return {
    presets: scopeMatches ? presets : [],
    error: scopeMatches ? error : null,
    refreshError: scopeMatches ? refreshError : null,
    loading: scopeMatches ? loading : projectId !== null,
    reload,
    setAuthoritative
  };
}

function loadRightPanelPinned(): boolean {
  try {
    return (
      window.localStorage.getItem(RIGHT_PANEL_PINNED_STORAGE_KEY) === 'true'
    );
  } catch {
    return false;
  }
}

function storeRightPanelPinned(pinned: boolean): void {
  try {
    window.localStorage.setItem(
      RIGHT_PANEL_PINNED_STORAGE_KEY,
      String(pinned)
    );
    window.dispatchEvent(new Event(RIGHT_PANEL_PIN_EVENT));
  } catch {
    // Persistence is best-effort in sandboxed browser contexts.
  }
}

function loadSidebarCollapsed(): boolean {
  try {
    return (
      window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
    );
  } catch {
    return false;
  }
}

function storeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      String(collapsed)
    );
  } catch {
    // Persistence is best-effort in sandboxed browser contexts.
  }
}

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

function loadSidebarWidth(): number {
  try {
    const stored = Number(
      window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    );
    return Number.isFinite(stored) && stored > 0
      ? clampSidebarWidth(stored)
      : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function storeSidebarWidth(width: number): void {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // Persistence is best-effort in sandboxed browser contexts.
  }
}

function formatUpdatedAt(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
  }).format(new Date(timestamp));
}

function WorkStateGlyph({
  category,
  className = 'size-4'
}: {
  category: WorkStateCategory;
  className?: string;
}) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.5
  };
  return (
    <svg
      aria-hidden="true"
      data-state-category={category}
      data-taskboard-state-glyph={category}
      className={cn('tb-state-glyph shrink-0', className)}
      viewBox="0 0 16 16"
    >
      {category === 'backlog' ? (
        <circle {...common} cx="8" cy="8" r="5.25" strokeDasharray="1.6 2.1" />
      ) : category === 'todo' ? (
        <circle {...common} cx="8" cy="8" r="5.25" />
      ) : category === 'in_progress' ? (
        <>
          <circle {...common} cx="8" cy="8" r="5.25" opacity="0.35" />
          <path {...common} d="M8 2.75a5.25 5.25 0 0 1 0 10.5" strokeWidth="2" />
        </>
      ) : category === 'done' ? (
        <>
          <circle {...common} cx="8" cy="8" r="5.25" />
          <path {...common} d="m5.35 8.05 1.7 1.75 3.65-3.7" />
        </>
      ) : (
        <>
          <circle {...common} cx="8" cy="8" r="5.25" />
          <path {...common} d="m5.1 10.9 5.8-5.8" />
        </>
      )}
    </svg>
  );
}

function SidebarRow({
  active = false,
  onClick,
  children
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      data-active={active ? 'true' : 'false'}
      className={cn(
        'tb-sidebar-row flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring max-md:pointer-coarse:h-10',
        active ? 'font-medium text-foreground' : 'hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function TrackerSidebar({
  route,
  projects,
  isLoading,
  preferredProjectId,
  overlay = false,
  onNavigate
}: {
  route: TrackerRoute;
  projects: readonly TrackerProject[] | undefined;
  isLoading: boolean;
  preferredProjectId: string | null;
  overlay?: boolean;
  onNavigate: (route: TrackerRoute) => void;
}) {
  const activeProjectId =
    route.kind === 'project' || route.kind === 'item'
      ? route.projectId
      : route.kind === 'root'
        ? preferredProjectId
        : null;
  const managedProjectId =
    route.kind === 'project' || route.kind === 'item'
      ? route.projectId
      : route.kind === 'manage'
        ? route.projectId
        : preferredProjectId;
  const asideRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(loadSidebarWidth);
  const [resizing, setResizing] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  };
  const moveResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizing) return;
    const rightEdge = asideRef.current?.getBoundingClientRect().right;
    if (rightEdge === undefined) return;
    setWidth(clampSidebarWidth(Math.round(rightEdge - event.clientX)));
  };
  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizing) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setResizing(false);
    storeSidebarWidth(widthRef.current);
  };
  const resetWidth = () => {
    setWidth(SIDEBAR_DEFAULT_WIDTH);
    storeSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
  };
  const resizeWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number | null = null;
    if (event.key === 'ArrowLeft') nextWidth = widthRef.current + 10;
    if (event.key === 'ArrowRight') nextWidth = widthRef.current - 10;
    if (event.key === 'Home') nextWidth = SIDEBAR_MIN_WIDTH;
    if (event.key === 'End') nextWidth = SIDEBAR_MAX_WIDTH;
    if (nextWidth === null) return;
    event.preventDefault();
    const clamped = clampSidebarWidth(nextWidth);
    setWidth(clamped);
    storeSidebarWidth(clamped);
  };

  return (
    <aside
      ref={asideRef}
      aria-label="Taskboard navigation"
      style={overlay ? undefined : { width }}
      className={cn(
        'tb-sidebar relative flex h-full shrink-0 flex-col border-l',
        overlay && 'w-72 min-w-0 max-w-full shadow-lg',
        resizing && 'select-none'
      )}
    >
      {!overlay ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={width}
          tabIndex={0}
          title="Drag to resize · double-click to reset"
          className={cn(
            'absolute inset-y-0 -left-px z-10 w-1 cursor-col-resize transition-colors focus-visible:bg-primary/50 focus-visible:outline-none',
            resizing ? 'bg-primary/50' : 'hover:bg-primary/30'
          )}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onDoubleClick={resetWidth}
          onKeyDown={resizeWithKeyboard}
        />
      ) : null}
      <nav
        aria-label="Taskboard navigation"
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-3"
      >
        <div className="px-2 pb-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-subtle-foreground">
          Projects
        </div>
        {isLoading ? (
          <div className="space-y-2 px-2 pt-2">
            {['w-3/4', 'w-2/3', 'w-4/5'].map(width => (
              <div className="flex h-7 items-center gap-2" key={width}>
                <Skeleton className="size-3 rounded-sm" />
                <Skeleton className={cn('h-3', width)} />
              </div>
            ))}
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="space-y-px">
            {projects.map(project => (
              <SidebarRow
                key={project.id}
                active={activeProjectId === project.id}
                onClick={() =>
                  onNavigate({ kind: 'project', projectId: project.id })
                }
              >
                <Icon name="Folder" className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate" title={project.name}>
                  {project.name}
                </span>
              </SidebarRow>
            ))}
          </div>
        ) : (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            No BB projects found.
          </p>
        )}

        <div className="my-3 border-t border-border-hairline/80" />
        <div className="space-y-px">
          <SidebarRow
            active={route.kind === 'all'}
            onClick={() => onNavigate({ kind: 'all' })}
          >
            <Icon name="ListView" className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Across projects</span>
          </SidebarRow>
        </div>
      </nav>

      <div className="shrink-0 border-t border-border-hairline px-2 py-1.5">
        <SidebarRow
          active={route.kind === 'manage'}
          onClick={() =>
            onNavigate({ kind: 'manage', projectId: managedProjectId })
          }
        >
          <Icon name="Settings" className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Manage</span>
        </SidebarRow>
      </div>
    </aside>
  );
}

function SidebarDrawer({
  onClose,
  children
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Taskboard sidebar"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="absolute inset-0 z-30 focus-visible:outline-none"
    >
      <button
        type="button"
        aria-label="Close sidebar"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/18 backdrop-blur-[2px]"
      />
      <div className="absolute inset-y-0 right-0 flex max-w-[85%]">
        {children}
      </div>
    </div>
  );
}

function TrackerTopbar({
  route,
  projects,
  sidebarCollapsed,
  refreshing,
  refreshDisabled,
  onNavigate,
  onBack,
  onRefresh,
  onToggleSidebar
}: {
  route: TrackerRoute;
  projects: readonly TrackerProject[] | undefined;
  sidebarCollapsed: boolean;
  refreshing: boolean;
  refreshDisabled: boolean;
  onNavigate: (route: TrackerRoute) => void;
  onBack: () => void;
  onRefresh: () => void;
  onToggleSidebar: () => void;
}) {
  const projectId =
    route.kind === 'project' || route.kind === 'item'
      ? route.projectId
      : route.kind === 'manage'
        ? route.projectId
        : null;
  const project = projects?.find(candidate => candidate.id === projectId);

  const breadcrumb = (() => {
    if (route.kind === 'root') {
      return (
        <span className="whitespace-nowrap font-semibold">Taskboard</span>
      );
    }
    if (route.kind === 'all') {
      return (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span className="font-semibold">Across projects</span>
          <span className="tb-topbar-pill rounded-full px-2 py-0.5 text-2xs font-medium">
            All
          </span>
        </span>
      );
    }
    if (route.kind === 'manage') {
      return (
        <span className="flex min-w-0 items-center gap-2">
          <span className="whitespace-nowrap font-semibold">
            Project settings
          </span>
          {project ? (
            <>
              <Icon
                name="ChevronRight"
                className="size-3 shrink-0 text-muted-foreground"
              />
              <span className="truncate text-xs font-normal text-muted-foreground">
                {project.name}
              </span>
            </>
          ) : null}
        </span>
      );
    }
    if (route.kind === 'project') {
      return (
        <span className="flex min-w-0 items-center gap-2">
          <Icon
            name="Folder"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="truncate font-semibold">
            {project?.name ?? 'BB project'}
          </span>
          <span className="tb-topbar-pill hidden rounded-full px-2 py-0.5 text-2xs font-medium @md:inline-flex">
            Issues
          </span>
        </span>
      );
    }
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 max-md:pointer-coarse:size-9"
          aria-label="Back to work items"
          onClick={onBack}
        >
          <Icon name="ChevronLeft" className="size-4" />
        </Button>
        <button
          type="button"
          className="hidden min-w-0 items-center gap-2 text-muted-foreground hover:text-foreground @md:flex"
          onClick={() =>
            onNavigate({ kind: 'project', projectId: route.projectId })
          }
        >
          <Icon name="Folder" className="size-3.5 shrink-0" />
          <span className="truncate font-medium">
            {project?.name ?? 'BB project'}
          </span>
        </button>
        <Icon
          name="ChevronRight"
          className="hidden size-3 shrink-0 text-muted-foreground @md:block"
        />
        <span className="min-w-0 truncate font-medium text-muted-foreground">
          {route.locator}
        </span>
      </span>
    );
  })();

  return (
    <header className="tb-topbar flex h-11 shrink-0 items-center gap-2.5 border-b px-3.5 text-sm max-md:h-12 max-md:pl-12 max-md:pointer-coarse:pl-14">
      <div className="min-w-0 flex-1 overflow-hidden">{breadcrumb}</div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-muted-foreground hover:text-foreground max-md:pointer-coarse:size-9"
        aria-label="Refresh work items"
        aria-busy={refreshing}
        disabled={refreshDisabled || refreshing}
        onClick={onRefresh}
      >
        <Icon
          name="RotateCcw"
          className={cn('size-3.5', refreshing && 'animate-spin')}
        />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 max-md:pointer-coarse:size-9"
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!sidebarCollapsed}
        onClick={onToggleSidebar}
      >
        <Icon name="PanelRight" className="size-4" />
      </Button>
    </header>
  );
}

function toggled<T>(values: readonly T[], value: T, checked: boolean): T[] {
  if (checked) return values.includes(value) ? [...values] : [...values, value];
  return values.filter(candidate => candidate !== value);
}

function sameStringValues(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function FilterChip({
  icon,
  label,
  selectedNames,
  children
}: {
  icon: IconName;
  label: string;
  selectedNames: readonly string[];
  children: ReactNode;
}) {
  const active = selectedNames.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-active={active ? 'true' : 'false'}
          className={cn(
            'tb-filter-chip flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors max-md:pointer-coarse:h-10',
            active ? 'text-foreground' : 'hover:text-foreground'
          )}
        >
          <Icon name={icon} className="size-3 shrink-0" aria-hidden="true" />
          {label}
          {active ? (
            <span className="max-w-40 truncate font-medium @max-md:max-w-24">
              {selectedNames.join(', ')}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterSectionLabel({ filter }: { filter: FilterPresentationKey }) {
  const presentation = FILTER_PRESENTATION[filter];
  return (
    <DropdownMenuLabel className="flex items-center gap-1.5">
      <Icon
        name={presentation.icon}
        className="size-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span>{presentation.label}</span>
    </DropdownMenuLabel>
  );
}

function TrackerSearchInput({
  query,
  onQueryChange,
  className
}: {
  query: string;
  onQueryChange: (query: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'tb-search-shell relative min-w-40 flex-1 rounded-md',
        className
      )}
    >
      <Icon
        name="Search"
        className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        name="work-item-search"
        value={query}
        maxLength={MAX_BROWSE_QUERY_LENGTH}
        onChange={event => onQueryChange(event.target.value)}
        aria-label="Search work items"
        placeholder="Search key or title"
        className="tb-search-input h-7 w-full pl-7 text-xs max-md:pointer-coarse:h-10"
      />
    </div>
  );
}

function TrackerViewToggle({
  view,
  onViewChange,
  constrained = false,
  className
}: {
  view: TrackerView;
  onViewChange: (view: TrackerView) => void;
  constrained?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Work view"
      className={cn(
        'tb-view-toggle flex rounded-md p-0.5',
        constrained ? 'min-w-0 flex-1' : 'shrink-0',
        className
      )}
    >
      {(['list', 'kanban'] as const).map(option => (
        <button
          key={option}
          type="button"
          aria-pressed={view === option}
          data-active={view === option ? 'true' : 'false'}
          onClick={() => onViewChange(option)}
          className={cn(
            'tb-view-toggle-option flex h-6 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:pointer-coarse:h-9',
            constrained && 'min-w-0 flex-1 justify-center gap-0 overflow-hidden px-2',
            view === option
              ? 'text-foreground shadow-2xs'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {!constrained ? (
            <Icon
              name={option === 'list' ? 'ListView' : 'Columns2'}
              className="size-3.5"
            />
          ) : null}
          <span className={cn(constrained && 'truncate')}>
            {option === 'list' ? 'List' : 'Kanban'}
          </span>
        </button>
      ))}
    </div>
  );
}

function FilterPresetMenu({
  presets,
  error,
  refreshError,
  loading,
  actionsReady,
  constrained = false,
  onApply,
  onRetry,
  onSaveCurrent
}: {
  presets: readonly FilterPreset[];
  error: string | null;
  refreshError: string | null;
  loading: boolean;
  actionsReady: boolean;
  constrained?: boolean;
  onApply: (preset: FilterPreset) => void;
  onRetry: () => void;
  onSaveCurrent: () => void;
}) {
  const hasLoadIssue = error !== null || refreshError !== null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {constrained ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="tb-filter-chip h-7 shrink-0 gap-1.5 px-2 text-xs max-md:pointer-coarse:h-10"
            data-active={hasLoadIssue ? 'true' : 'false'}
            aria-label={
              hasLoadIssue ? 'Filter presets need attention' : 'Filter presets'
            }
          >
            <Icon
              name={hasLoadIssue ? 'AlertCircle' : 'Star'}
              className="size-3.5"
              aria-hidden="true"
            />
            <span className="sr-only">Presets</span>
          </Button>
        ) : (
          <button
            type="button"
            data-active={hasLoadIssue ? 'true' : 'false'}
            aria-label={hasLoadIssue ? 'Presets need attention' : undefined}
            className="tb-filter-chip flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors hover:text-foreground max-md:pointer-coarse:h-10"
          >
            <Icon
              name={hasLoadIssue ? 'AlertCircle' : 'Star'}
              className="size-3 shrink-0"
              aria-hidden="true"
            />
            Presets
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={constrained ? 'end' : 'start'}
        mobileTitle="Filter presets"
        className="flex max-h-[var(--radix-dropdown-menu-content-available-height)] w-64 max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {!actionsReady ? (
            <DropdownMenuItem disabled>
              Waiting for the project tracker…
            </DropdownMenuItem>
          ) : null}
          {loading ? (
            <DropdownMenuItem disabled>Loading presets…</DropdownMenuItem>
          ) : error ? (
            <>
              <div
                role="alert"
                className="px-2 py-1.5 text-xs leading-relaxed text-destructive"
              >
                Could not load presets: {error}
              </div>
              <DropdownMenuItem onSelect={onRetry}>
                <Icon name="ArrowReloadHorizontal" className="size-3.5" />
                Try again
              </DropdownMenuItem>
            </>
          ) : presets.length === 0 ? (
            <DropdownMenuItem disabled>No saved presets</DropdownMenuItem>
          ) : (
            presets.map(preset => (
              <DropdownMenuItem
                key={preset.id}
                disabled={!actionsReady}
                onSelect={() => onApply(preset)}
              >
                <Icon name="Star" className="size-3.5" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{preset.name}</span>
              </DropdownMenuItem>
            ))
          )}
          {refreshError && !error ? (
            <div
              role="alert"
              className="mt-1 border-t border-border px-2 py-2 text-xs leading-relaxed text-muted-foreground"
            >
              Could not refresh presets. Keeping the last loaded list.
              <button
                type="button"
                className="ml-1 font-medium text-foreground underline-offset-2 hover:underline"
                onClick={onRetry}
              >
                Try again
              </button>
            </div>
          ) : null}
        </div>
        <div className="shrink-0 border-t border-border bg-popover p-1">
          <DropdownMenuItem
            disabled={!actionsReady}
            onSelect={onSaveCurrent}
          >
            <Icon name="Plus" className="size-3.5" aria-hidden="true" />
            Save current view as…
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TrackerFilterBar({
  presets,
  presetsError,
  presetsRefreshError,
  presetsLoading,
  presetActionsReady,
  onApplyPreset,
  onRetryPresets,
  onSaveCurrentPreset,
  source,
  enabledFilters,
  stateCategories,
  statuses,
  statusOptions,
  assignees,
  assigneeOptions,
  priorities,
  priorityOptions,
  externalProjects,
  projectOptions,
  labels,
  labelOptions,
  query,
  view,
  surfaceMode,
  showSourceFilter,
  showViewToggle,
  onSourceChange,
  onStateCategoriesChange,
  onStatusesChange,
  onAssigneesChange,
  onPrioritiesChange,
  onExternalProjectsChange,
  onLabelsChange,
  onQueryChange,
  onViewChange,
  onClear
}: {
  presets: readonly FilterPreset[] | null;
  presetsError: string | null;
  presetsRefreshError: string | null;
  presetsLoading: boolean;
  presetActionsReady: boolean;
  onApplyPreset: (preset: FilterPreset) => void;
  onRetryPresets: () => void;
  onSaveCurrentPreset: () => void;
  source: SourceFilter;
  enabledFilters: readonly WorkItemFilterField[];
  stateCategories: readonly WorkStateCategory[];
  statuses: readonly string[];
  statusOptions: readonly FilterOption[];
  assignees: readonly string[];
  assigneeOptions: readonly FilterOption[];
  priorities: readonly string[];
  priorityOptions: readonly FilterOption[];
  externalProjects: readonly string[];
  projectOptions: readonly FilterOption[];
  labels: readonly string[];
  labelOptions: readonly FilterOption[];
  query: string;
  view: TrackerView;
  surfaceMode: 'full' | 'constrained';
  showSourceFilter: boolean;
  showViewToggle: boolean;
  onSourceChange: (source: SourceFilter) => void;
  onStateCategoriesChange: (categories: WorkStateCategory[]) => void;
  onStatusesChange: (statuses: string[]) => void;
  onAssigneesChange: (assignees: string[]) => void;
  onPrioritiesChange: (priorities: string[]) => void;
  onExternalProjectsChange: (projects: string[]) => void;
  onLabelsChange: (labels: string[]) => void;
  onQueryChange: (query: string) => void;
  onViewChange: (view: TrackerView) => void;
  onClear: () => void;
}) {
  const filtered =
    source !== ALL_SOURCES ||
    stateCategories.length > 0 ||
    statuses.length > 0 ||
    assignees.length > 0 ||
    priorities.length > 0 ||
    externalProjects.length > 0 ||
    labels.length > 0 ||
    query.trim() !== '';
  const keepOpen = (event: Event) => event.preventDefault();
  const selectedNames = (
    selected: readonly string[],
    options: readonly FilterOption[]
  ) =>
    selected.map(
      value =>
        options.find(option =>
          isFilterOptionSelected([value], option.value)
        )?.label ?? value
    );
  const [facetQuery, setFacetQuery] = useState('');
  const facetSearchRef = useRef<HTMLInputElement>(null);
  const normalizedFacetQuery = facetQuery.trim().toLocaleLowerCase();
  const matchesFacet = (label: string) =>
    normalizedFacetQuery === '' ||
    label.toLocaleLowerCase().includes(normalizedFacetQuery);
  const filteredOptions = (options: readonly FilterOption[]) =>
    options.filter(option => matchesFacet(option.label));
  const matchingFacetValueCount =
    (showSourceFilter
      ? ([ALL_SOURCES, 'linear', 'github', 'jira'] as const).filter(option =>
          matchesFacet(
            option === ALL_SOURCES ? 'All sources' : sourceName(option)
          )
        ).length
      : 0) +
    (enabledFilters.includes('state')
      ? STATE_CATEGORY_ORDER.filter(category =>
          matchesFacet(STATE_CATEGORY_LABELS[category])
        ).length
      : 0) +
    (enabledFilters.includes('status') ? filteredOptions(statusOptions).length : 0) +
    (enabledFilters.includes('assignee')
      ? filteredOptions(assigneeOptions).length
      : 0) +
    (enabledFilters.includes('priority')
      ? filteredOptions(priorityOptions).length
      : 0) +
    (enabledFilters.includes('project')
      ? filteredOptions(projectOptions).length
      : 0) +
    (enabledFilters.includes('labels') ? filteredOptions(labelOptions).length : 0);
  const hasMatchingFacetValues =
    normalizedFacetQuery === '' || matchingFacetValueCount > 0;
  const activeFacetCount = [
    showSourceFilter && source !== ALL_SOURCES,
    enabledFilters.includes('state') && stateCategories.length > 0,
    enabledFilters.includes('status') && statuses.length > 0,
    enabledFilters.includes('assignee') && assignees.length > 0,
    enabledFilters.includes('priority') && priorities.length > 0,
    enabledFilters.includes('project') && externalProjects.length > 0,
    enabledFilters.includes('labels') && labels.length > 0
  ].filter(Boolean).length;

  if (surfaceMode === 'constrained') {
    return (
      <div
        role="search"
        aria-label="Filter work items"
        data-taskboard-filter-mode="constrained"
        className="tb-filter-bar grid shrink-0 gap-1.5 border-b px-2 py-1.5"
      >
        <TrackerSearchInput query={query} onQueryChange={onQueryChange} />
        <div className="flex items-center justify-between gap-2">
          {showViewToggle ? (
            <TrackerViewToggle
              view={view}
              onViewChange={onViewChange}
              constrained
            />
          ) : (
            <span />
          )}
          {presets !== null ? (
            <FilterPresetMenu
              presets={presets}
              error={presetsError}
              refreshError={presetsRefreshError}
              loading={presetsLoading}
              actionsReady={presetActionsReady}
              constrained
              onApply={onApplyPreset}
              onRetry={onRetryPresets}
              onSaveCurrent={onSaveCurrentPreset}
            />
          ) : null}
          <DropdownMenu
            onOpenChange={open => {
              if (!open) setFacetQuery('');
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="tb-filter-chip h-7 min-w-0 shrink-0 gap-1.5 px-2 text-xs max-md:pointer-coarse:h-10"
                data-active={activeFacetCount > 0 ? 'true' : 'false'}
                aria-label={`Filters, ${activeFacetCount} active filter ${activeFacetCount === 1 ? 'category' : 'categories'}`}
              >
                <Icon name="SlidersHorizontal" className="size-3.5" />
                <span className="truncate">
                  Filters{activeFacetCount > 0 ? ` · ${activeFacetCount}` : ''}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="flex max-h-[var(--radix-dropdown-menu-content-available-height)] w-72 flex-col overflow-hidden p-0"
              onOpenAutoFocus={event => {
                event.preventDefault();
                window.requestAnimationFrame(() => facetSearchRef.current?.focus());
              }}
            >
              <div className="z-10 shrink-0 space-y-2 border-b border-border bg-popover p-2">
                <p className="text-xs font-medium">
                  {activeFacetCount > 0
                    ? `${activeFacetCount} active filter ${activeFacetCount === 1 ? 'category' : 'categories'}`
                    : 'Filter this project'}
                </p>
                <Input
                  ref={facetSearchRef}
                  value={facetQuery}
                  onChange={event => setFacetQuery(event.target.value)}
                  onKeyDown={event => {
                    if (
                      event.key !== 'Escape' &&
                      event.key !== 'ArrowDown' &&
                      event.key !== 'ArrowUp'
                    ) {
                      event.stopPropagation();
                    }
                  }}
                  aria-label="Search filter values"
                  placeholder="Find assignees, labels, statuses…"
                  className="h-8 text-xs"
                />
              </div>

              <div
                data-taskboard-filter-values
                className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-1"
              >
                {!hasMatchingFacetValues ? (
                  <p
                    role="status"
                    className="px-3 py-5 text-center text-xs text-muted-foreground"
                  >
                    No matching values
                  </p>
                ) : (
                  <>
                {showSourceFilter ? (
                  <>
                    <FilterSectionLabel filter="source" />
                    {([ALL_SOURCES, 'linear', 'github', 'jira'] as const)
                      .filter(option =>
                        matchesFacet(
                          option === ALL_SOURCES
                            ? 'All sources'
                            : sourceName(option)
                        )
                      )
                      .map(option => (
                        <DropdownMenuCheckboxItem
                          key={option}
                          checked={source === option}
                          onSelect={keepOpen}
                          onCheckedChange={checked => {
                            if (checked === true) onSourceChange(option);
                          }}
                        >
                          {option === ALL_SOURCES
                            ? 'All sources'
                            : sourceName(option)}
                        </DropdownMenuCheckboxItem>
                      ))}
                    <DropdownMenuSeparator />
                  </>
                ) : null}

                {enabledFilters.includes('state') ? (
                  <>
                    <FilterSectionLabel filter="state" />
                    {STATE_CATEGORY_ORDER.filter(category =>
                      matchesFacet(STATE_CATEGORY_LABELS[category])
                    ).map(category => (
                      <DropdownMenuCheckboxItem
                        key={category}
                        checked={stateCategories.includes(category)}
                        onSelect={keepOpen}
                        onCheckedChange={checked =>
                          onStateCategoriesChange(
                            toggled(stateCategories, category, checked === true)
                          )
                        }
                      >
                        <WorkStateGlyph category={category} />
                        {STATE_CATEGORY_LABELS[category]}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : null}

                {enabledFilters.includes('status') ? (
                  <>
                    <FilterSectionLabel filter="status" />
                    {filteredOptions(statusOptions).map(option => (
                      <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={isFilterOptionSelected(statuses, option.value)}
                        onSelect={keepOpen}
                        onCheckedChange={() =>
                          onStatusesChange(
                            toggleFilterOptionSelection(statuses, option.value)
                          )
                        }
                      >
                        {option.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : null}

                {enabledFilters.includes('assignee') ? (
                  <>
                    <FilterSectionLabel filter="assignee" />
                    {filteredOptions(assigneeOptions).map(option => (
                      <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={isFilterOptionSelected(assignees, option.value)}
                        onSelect={keepOpen}
                        onCheckedChange={() =>
                          onAssigneesChange(
                            toggleFilterOptionSelection(assignees, option.value)
                          )
                        }
                      >
                        {option.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : null}

                {enabledFilters.includes('priority') ? (
                  <>
                    <FilterSectionLabel filter="priority" />
                    {filteredOptions(priorityOptions).map(option => (
                      <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={isFilterOptionSelected(priorities, option.value)}
                        onSelect={keepOpen}
                        onCheckedChange={() =>
                          onPrioritiesChange(
                            toggleFilterOptionSelection(priorities, option.value)
                          )
                        }
                      >
                        {option.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : null}

                {enabledFilters.includes('project') ? (
                  <>
                    <FilterSectionLabel filter="project" />
                    {filteredOptions(projectOptions).map(option => (
                      <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={isFilterOptionSelected(
                          externalProjects,
                          option.value
                        )}
                        onSelect={keepOpen}
                        onCheckedChange={() =>
                          onExternalProjectsChange(
                            toggleFilterOptionSelection(
                              externalProjects,
                              option.value
                            )
                          )
                        }
                      >
                        {option.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : null}

                {enabledFilters.includes('labels') ? (
                  <>
                    <FilterSectionLabel filter="labels" />
                    {filteredOptions(labelOptions).map(option => (
                      <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={isFilterOptionSelected(labels, option.value)}
                        onSelect={keepOpen}
                        onCheckedChange={() =>
                          onLabelsChange(
                            toggleFilterOptionSelection(labels, option.value)
                          )
                        }
                      >
                        {option.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </>
                ) : null}
                  </>
                )}
              </div>

              <DropdownMenuItem
                disabled={!filtered}
                onSelect={onClear}
                className="shrink-0 border-t border-border bg-popover font-medium"
              >
                <Icon name="X" className="size-3.5" />
                Clear filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  return (
    <div
      role="search"
      aria-label="Filter work items"
      data-taskboard-filter-mode="full"
      className="tb-filter-bar shrink-0 border-b"
    >
      <div
        className={cn(
          'mx-auto flex w-full flex-wrap items-center gap-1.5 px-2 py-1.5',
          (view === 'list' || !showViewToggle) && 'max-w-[56rem]'
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-px">
        {presets !== null ? (
          <FilterPresetMenu
            presets={presets}
            error={presetsError}
            refreshError={presetsRefreshError}
            loading={presetsLoading}
            actionsReady={presetActionsReady}
            onApply={onApplyPreset}
            onRetry={onRetryPresets}
            onSaveCurrent={onSaveCurrentPreset}
          />
        ) : null}
        {showSourceFilter ? (
          <FilterChip
            icon={FILTER_PRESENTATION.source.icon}
            label={FILTER_PRESENTATION.source.label}
            selectedNames={source === ALL_SOURCES ? [] : [sourceName(source)]}
          >
            {([ALL_SOURCES, 'linear', 'github', 'jira'] as const).map(
              option => (
                <DropdownMenuCheckboxItem
                  key={option}
                  checked={source === option}
                  onCheckedChange={checked => {
                    if (checked === true) onSourceChange(option);
                  }}
                >
                  {option === ALL_SOURCES ? 'All sources' : sourceName(option)}
                </DropdownMenuCheckboxItem>
              )
            )}
          </FilterChip>
        ) : null}

        {enabledFilters.includes('state') ? (
          <FilterChip
            icon={FILTER_PRESENTATION.state.icon}
            label={FILTER_PRESENTATION.state.label}
            selectedNames={stateCategories.map(
              category => STATE_CATEGORY_LABELS[category]
            )}
          >
            {STATE_CATEGORY_ORDER.map(category => (
              <DropdownMenuCheckboxItem
                key={category}
                checked={stateCategories.includes(category)}
                onSelect={keepOpen}
                onCheckedChange={checked =>
                  onStateCategoriesChange(
                    toggled(stateCategories, category, checked === true)
                  )
                }
              >
                <span className="flex items-center gap-2">
                  <WorkStateGlyph category={category} />
                  {STATE_CATEGORY_LABELS[category]}
                </span>
              </DropdownMenuCheckboxItem>
            ))}
          </FilterChip>
        ) : null}

        {enabledFilters.includes('status') ? (
          <FilterChip
            icon={FILTER_PRESENTATION.status.icon}
            label={FILTER_PRESENTATION.status.label}
            selectedNames={selectedNames(statuses, statusOptions)}
          >
            {statusOptions.map(option => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={isFilterOptionSelected(statuses, option.value)}
                onSelect={keepOpen}
                onCheckedChange={() =>
                  onStatusesChange(
                    toggleFilterOptionSelection(statuses, option.value)
                  )
                }
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </FilterChip>
        ) : null}

        {enabledFilters.includes('assignee') ? (
          <FilterChip
            icon={FILTER_PRESENTATION.assignee.icon}
            label={FILTER_PRESENTATION.assignee.label}
            selectedNames={selectedNames(assignees, assigneeOptions)}
          >
            {assigneeOptions.map(option => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={isFilterOptionSelected(assignees, option.value)}
                onSelect={keepOpen}
                onCheckedChange={() =>
                  onAssigneesChange(
                    toggleFilterOptionSelection(assignees, option.value)
                  )
                }
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </FilterChip>
        ) : null}

        {enabledFilters.includes('priority') ? (
          <FilterChip
            icon={FILTER_PRESENTATION.priority.icon}
            label={FILTER_PRESENTATION.priority.label}
            selectedNames={selectedNames(priorities, priorityOptions)}
          >
            {priorityOptions.map(option => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={isFilterOptionSelected(priorities, option.value)}
                onSelect={keepOpen}
                onCheckedChange={() =>
                  onPrioritiesChange(
                    toggleFilterOptionSelection(priorities, option.value)
                  )
                }
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </FilterChip>
        ) : null}

        {enabledFilters.includes('project') ? (
          <FilterChip
            icon={FILTER_PRESENTATION.project.icon}
            label={FILTER_PRESENTATION.project.label}
            selectedNames={selectedNames(externalProjects, projectOptions)}
          >
            {projectOptions.map(option => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={isFilterOptionSelected(
                  externalProjects,
                  option.value
                )}
                onSelect={keepOpen}
                onCheckedChange={() =>
                  onExternalProjectsChange(
                    toggleFilterOptionSelection(
                      externalProjects,
                      option.value
                    )
                  )
                }
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </FilterChip>
        ) : null}

        {enabledFilters.includes('labels') ? (
          <FilterChip
            icon={FILTER_PRESENTATION.labels.icon}
            label={FILTER_PRESENTATION.labels.label}
            selectedNames={selectedNames(labels, labelOptions)}
          >
            {labelOptions.map(option => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={isFilterOptionSelected(labels, option.value)}
                onSelect={keepOpen}
                onCheckedChange={() =>
                  onLabelsChange(
                    toggleFilterOptionSelection(labels, option.value)
                  )
                }
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </FilterChip>
        ) : null}

          <TrackerSearchInput
            query={query}
            onQueryChange={onQueryChange}
            className="@md:max-w-72"
          />
          {filtered ? (
            <button
              type="button"
              onClick={onClear}
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:pointer-coarse:h-10"
            >
              <Icon name="X" className="size-3" />
              Clear filters
            </button>
          ) : null}
        </div>
        {showViewToggle ? (
          <TrackerViewToggle view={view} onViewChange={onViewChange} />
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({
  filtered,
  onClear
}: {
  filtered: boolean;
  onClear: () => void;
}) {
  return (
    <div className="tb-empty-state flex h-full flex-col items-center justify-center gap-3 rounded-lg p-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-muted-foreground">
        <Icon name={filtered ? 'Search' : 'ListTodo'} className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {filtered ? 'No work matches these filters' : 'No work items yet'}
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          {filtered
            ? 'Try a different state, assignee, or search query.'
            : 'Use Manage to choose this project’s external tracker, then refresh.'}
        </p>
      </div>
      {filtered ? (
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="px-3.5 pt-3">
      <Skeleton className="mb-3 h-4 w-28" />
      {Array.from({ length: 7 }, (_, index) => (
        <div
          key={index}
          className="flex h-[34px] items-center gap-2 border-b border-border-hairline"
        >
          <Skeleton className="size-3 rounded-full" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}

function ListMeasure({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-taskboard-list-measure
      className={cn('mx-auto w-full max-w-[56rem]', className)}
    >
      {children}
    </div>
  );
}

function WorkItemStatusMenu({
  item,
  variant,
  onMove
}: {
  item: WorkItem;
  variant: 'row' | 'detail';
  onMove: (item: WorkItem, option: WorkStatusOption) => Promise<void>;
}) {
  const rpc = useRpc<TaskboardRpcContract>();
  const [options, setOptions] = useState<WorkStatusOption[] | undefined>();
  const [loading, setLoading] = useState(false);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const identity = `${item.bbProjectId}:${item.source}:${item.locator}`;

  useEffect(() => {
    setOptions(undefined);
    setError(null);
  }, [identity, item.status]);

  const loadOptions = useCallback(async () => {
    if (loading || options !== undefined) return;
    setLoading(true);
    setError(null);
    try {
      const result = await rpc.call('statusOptions', {
        projectId: item.bbProjectId,
        source: item.source,
        locator: item.locator
      });
      setOptions(result.options);
    } catch (nextError) {
      setError(describeError(nextError));
    } finally {
      setLoading(false);
    }
  }, [item.bbProjectId, item.locator, item.source, loading, options, rpc]);

  const changeStatus = async (option: WorkStatusOption) => {
    const current =
      option.current ||
      (option.name === item.status &&
        option.stateCategory === item.stateCategory);
    if (current || pendingStatusId !== null) return;
    setPendingStatusId(option.id);
    try {
      await onMove(item, option);
      toast.success(`${item.key} moved to ${option.name}`);
    } catch (nextError) {
      toast.error(`Could not update ${item.key}`, {
        description: describeError(nextError)
      });
    } finally {
      setPendingStatusId(null);
    }
  };

  const trigger =
    variant === 'row' ? (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-5 rounded-full p-0"
        aria-label={`Change status for ${item.key}. Current status: ${item.status}`}
        disabled={pendingStatusId !== null}
      >
        <WorkStateGlyph category={item.stateCategory} />
      </Button>
    ) : (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="tb-status-pill h-7 gap-1.5 rounded-full px-2.5 text-xs"
        aria-label={`Change status for ${item.key}. Current status: ${item.status}`}
        data-state-category={item.stateCategory}
        data-status-tone={workflowStatusTone(
          item.status,
          item.stateCategory
        )}
        disabled={pendingStatusId !== null}
      >
        <WorkStateGlyph category={item.stateCategory} />
        {pendingStatusId === null ? item.status : 'Updating…'}
        <Icon name="ChevronDown" className="size-3 opacity-60" />
      </Button>
    );

  return (
    <DropdownMenu
      onOpenChange={open => {
        if (open) void loadOptions();
      }}
    >
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === 'row' ? 'start' : 'end'}
        className="min-w-48"
      >
        {loading && options === undefined ? (
          <DropdownMenuItem disabled>
            <Icon name="Loading" className="size-3.5 animate-spin" />
            Loading statuses…
          </DropdownMenuItem>
        ) : error ? (
          <DropdownMenuItem disabled className="max-w-64 text-destructive">
            {error}
          </DropdownMenuItem>
        ) : options?.length ? (
          options.map(option => {
            const current =
              option.current ||
              (option.name === item.status &&
                option.stateCategory === item.stateCategory);
            return (
              <DropdownMenuItem
                key={option.id}
                disabled={current || pendingStatusId !== null}
                onSelect={() => void changeStatus(option)}
              >
                <WorkStateGlyph category={option.stateCategory} />
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                {current ? <Icon name="Check" className="size-3.5" /> : null}
              </DropdownMenuItem>
            );
          })
        ) : (
          <DropdownMenuItem disabled>No status changes available</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkItemRow({
  item,
  project,
  showProject,
  onMove,
  onOpen
}: {
  item: WorkItem;
  project: TrackerProject | undefined;
  showProject: boolean;
  onMove: (item: WorkItem, option: WorkStatusOption) => Promise<void>;
  onOpen: () => void;
}) {
  const priority = visiblePriority(item.priority);
  const assignee = visibleAssignee(item.assignee);
  return (
    <div
      data-state-category={item.stateCategory}
      data-status-tone={workflowStatusTone(item.status, item.stateCategory)}
      className="tb-item-row group relative grid min-h-9 w-full items-center gap-x-2 border-b border-border-hairline px-2.5 py-1 text-left"
    >
      <button
        type="button"
        aria-label={`Open ${item.key}: ${item.title}.${priority ? ` Priority ${priority}.` : ''}${assignee ? ` Assigned to ${assignee}.` : ''}`}
        onClick={onOpen}
        className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      />
      <span className="relative z-10 flex items-center justify-center">
        <WorkItemStatusMenu item={item} variant="row" onMove={onMove} />
      </span>
      <span className="tb-key pointer-events-none relative z-[1] min-w-0 truncate text-xs font-medium tabular-nums">
        {item.key}
      </span>
      <span className="pointer-events-none relative z-[1] min-w-0 truncate text-[13px] font-medium text-foreground">
        {item.title}
      </span>
      <span className="tb-row-trailing tb-meta pointer-events-none relative z-[1] flex min-w-0 items-center gap-2 overflow-hidden text-xs">
        {priority ? <PriorityMark priority={priority} /> : null}
        {showProject && project ? (
          <span className="max-w-28 truncate" title={project.name}>
            {project.name}
          </span>
        ) : null}
        {assignee ? <AssigneeMark assignee={assignee} /> : null}
        <time className="tb-row-time ml-auto shrink-0 tabular-nums">
          {formatUpdatedAt(item.updatedAt)}
        </time>
      </span>
    </div>
  );
}

function ListStateGroups({
  items,
  statusOrder,
  projectsById,
  showProject,
  idPrefix,
  nested = false,
  collapsedGroups,
  searchActive,
  onToggleGroup,
  onMove,
  onOpen
}: {
  items: readonly WorkItem[];
  statusOrder: readonly string[];
  projectsById: ReadonlyMap<string, TrackerProject>;
  showProject: boolean;
  idPrefix: string;
  nested?: boolean;
  collapsedGroups: Readonly<Record<string, boolean>>;
  searchActive: boolean;
  onToggleGroup: (
    groupKey: string,
    category: WorkStateCategory
  ) => void;
  onMove: (item: WorkItem, option: WorkStatusOption) => Promise<void>;
  onOpen: (item: WorkItem) => void;
}) {
  return workflowStatusGroups(items, statusOrder).map(group => {
    const headingId = `${idPrefix}-state-${encodeURIComponent(group.key)}`;
    const contentId = `${headingId}-items`;
    const preferenceKey = `${idPrefix}:${group.key}`;
    const collapsed = isGroupCollapsed({
      overrides: collapsedGroups,
      groupKey: preferenceKey,
      category: group.category,
      searchActive
    });
    return (
      <section key={group.key} aria-labelledby={headingId}>
        <h3
          id={headingId}
          data-state-group-header={group.name}
          data-state-category={group.category}
          data-status-tone={workflowStatusTone(group.name, group.category)}
          className={cn(
            'tb-group-heading sticky z-10 h-8 border-b backdrop-blur-sm',
            nested ? 'top-9' : 'top-0'
          )}
        >
          <button
            type="button"
            aria-controls={contentId}
            aria-expanded={!collapsed}
            disabled={searchActive}
            title={searchActive ? 'Search keeps matching groups open' : undefined}
            className="flex h-full w-full items-center gap-2 px-2.5 text-left text-2xs font-semibold uppercase tracking-[0.12em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default"
            onClick={() => onToggleGroup(preferenceKey, group.category)}
          >
            <Icon
              name="ChevronDown"
              className={cn(
                'size-3 transition-transform',
                collapsed && '-rotate-90'
              )}
            />
            <WorkStateGlyph category={group.category} />
            <span className="truncate">{group.name}</span>
            <span className="tb-count-chip ml-auto rounded-full px-1.5 py-0.5 text-xs font-normal tabular-nums text-subtle-foreground">
              {group.items.length}
            </span>
          </button>
        </h3>
        <div id={contentId} hidden={collapsed}>
          {group.items.map(item => (
            <WorkItemRow
              key={`${item.bbProjectId}:${item.source}:${item.locator}`}
              item={item}
              project={projectsById.get(item.bbProjectId)}
              showProject={showProject}
              onMove={onMove}
              onOpen={() => onOpen(item)}
            />
          ))}
        </div>
      </section>
    );
  });
}

function kanbanItemId(item: WorkItem): string {
  return `${item.bbProjectId}:${item.source}:${item.locator}`;
}

function mergeDiscoveredStatuses(
  current: WorkStatusOption[],
  incoming: readonly WorkStatusOption[]
): WorkStatusOption[] {
  const merged = new Map(
    current.map(status => [
      workflowStatusLaneKey(status.name, status.stateCategory),
      status
    ])
  );
  let changed = false;
  for (const status of incoming) {
    const key = workflowStatusLaneKey(status.name, status.stateCategory);
    if (merged.has(key)) continue;
    merged.set(key, status);
    changed = true;
  }
  return changed ? [...merged.values()] : current;
}

type PriorityTone = 'low' | 'medium' | 'high' | 'urgent' | 'neutral';

function priorityTone(value: string): PriorityTone {
  const normalized = value.trim().toLocaleLowerCase();
  if (['urgent', 'critical', 'highest', 'blocker', 'p0'].includes(normalized)) {
    return 'urgent';
  }
  if (['high', 'major', 'p1'].includes(normalized)) return 'high';
  if (['medium', 'normal', 'moderate', 'p2'].includes(normalized)) {
    return 'medium';
  }
  if (['low', 'lowest', 'minor', 'trivial', 'p3', 'p4'].includes(normalized)) {
    return 'low';
  }
  return 'neutral';
}

function visiblePriority(priority: string | null): string | null {
  const value = priority?.trim();
  return value && !/^(no priority|none)$/i.test(value) ? value : null;
}

function visibleAssignee(assignee: string | null): string | null {
  const value = assignee?.trim();
  return value && !/^unassigned$/i.test(value) ? value : null;
}

function PriorityGlyph({ tone }: { tone: PriorityTone }) {
  if (tone === 'neutral') {
    return (
      <svg
        aria-hidden="true"
        className="size-4"
        data-priority-glyph="neutral"
        viewBox="0 0 16 16"
      >
        <circle cx="4" cy="8" r="1" fill="currentColor" opacity="0.72" />
        <circle cx="8" cy="8" r="1" fill="currentColor" opacity="0.72" />
        <circle cx="12" cy="8" r="1" fill="currentColor" opacity="0.72" />
      </svg>
    );
  }

  const activeBars =
    tone === 'low' ? 1 : tone === 'medium' ? 2 : tone === 'high' ? 3 : 4;
  const bars = [
    { x: 1.3, y: 10.5, height: 3 },
    { x: 4.65, y: 8, height: 5.5 },
    { x: 8, y: 5.5, height: 8 },
    { x: 11.35, y: 3, height: 10.5 }
  ];
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      data-priority-bars={activeBars}
      data-priority-glyph="bars"
      viewBox="0 0 16 16"
    >
      {bars.map((bar, index) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={bar.y}
          width="2"
          height={bar.height}
          rx="1"
          fill="currentColor"
          opacity={index < activeBars ? 0.82 : 0.16}
        />
      ))}
    </svg>
  );
}

function PriorityMark({ priority }: { priority: string }) {
  const tone = priorityTone(priority);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-hidden="true"
          className="tb-priority-mark shrink-0"
          data-priority-tone={tone}
        >
          <PriorityGlyph tone={tone} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">Priority: {priority}</TooltipContent>
    </Tooltip>
  );
}

function AssigneeMark({ assignee }: { assignee: string }) {
  const identity = assigneeAvatarIdentity(assignee);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={`Assigned to ${assignee}`}
          data-assignee-tone={identity.tone}
          className="tb-assignee-mark shrink-0"
        >
          <span aria-hidden="true">{identity.initials}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">Assigned to {assignee}</TooltipContent>
    </Tooltip>
  );
}

function KanbanCard({
  item,
  pickedUp,
  pending,
  moveDisabled,
  onOpen,
  onPrepare,
  onDragStart,
  onDragEnd,
  onKeyDown
}: {
  item: WorkItem;
  pickedUp: boolean;
  pending: boolean;
  moveDisabled: boolean;
  onOpen: () => void;
  onPrepare: () => void;
  onDragStart: (event: ReactDragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}) {
  const priority = visiblePriority(item.priority);
  const assignee = visibleAssignee(item.assignee);
  const labels = item.labels
    .map(label => label.trim())
    .filter(Boolean)
    .slice(0, 2);

  return (
    <button
      type="button"
      draggable={!pending && !moveDisabled}
      aria-grabbed={pickedUp}
      aria-busy={pending}
      aria-label={`${item.key}: ${item.title}. Status ${item.status}.${priority ? ` Priority ${priority}.` : ''}${assignee ? ` Assigned to ${assignee}.` : ''}${moveDisabled ? ' Workflow statuses are loading. Press Enter to open.' : ' Press Space to move, or Enter to open.'}`}
      data-state-category={item.stateCategory}
      data-status-tone={workflowStatusTone(item.status, item.stateCategory)}
      data-picked-up={pickedUp ? 'true' : 'false'}
      data-pending={pending ? 'true' : 'false'}
      data-move-disabled={moveDisabled ? 'true' : 'false'}
      onPointerDown={onPrepare}
      onFocus={onPrepare}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={onKeyDown}
      onClick={onOpen}
      className="tb-kanban-card group w-full rounded-md px-3 py-2.5 text-left transition-[border-color,background-color,opacity,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center gap-2 text-xs">
        <span className="tb-priority-slot flex size-4 items-center justify-center">
          {priority ? <PriorityMark priority={priority} /> : null}
        </span>
        <span className="tb-key min-w-0 truncate font-medium tabular-nums">
          {item.key}
        </span>
      </span>
      <span className="mt-1.5 flex items-start gap-1.5">
        <span className="mt-1 flex shrink-0">
          <WorkStateGlyph category={item.stateCategory} />
        </span>
        <span className="line-clamp-2 block text-sm font-medium leading-snug text-foreground">
          {item.title}
        </span>
      </span>
      {labels.length > 0 ? (
        <span className="mt-2 flex min-w-0 gap-1 overflow-hidden">
          {labels.map((label, index) => (
            <span
              key={`${label}-${index}`}
              className="tb-label-chip min-w-0 truncate rounded-full px-2 py-0.5 text-xs"
              title={label}
            >
              {label}
            </span>
          ))}
        </span>
      ) : null}
      <span className="tb-meta mt-2 flex min-w-0 items-center gap-2 text-xs">
        <time className="shrink-0 tabular-nums" dateTime={item.updatedAt}>
          Updated {formatUpdatedAt(item.updatedAt)}
        </time>
        {pending ? (
          <span className="ml-auto min-w-0 truncate">Updating…</span>
        ) : assignee ? (
          <span className="ml-auto flex shrink-0">
            <AssigneeMark assignee={assignee} />
          </span>
        ) : null}
      </span>
    </button>
  );
}

function KanbanBoard({
  items,
  workflowItems,
  statusOrder,
  onOpen,
  onMove
}: {
  items: readonly WorkItem[];
  workflowItems: readonly WorkItem[];
  statusOrder: readonly string[];
  onOpen: (item: WorkItem) => void;
  onMove: (item: WorkItem, option: WorkStatusOption) => Promise<void>;
}) {
  const rpc = useRpc<TaskboardRpcContract>();
  const optionsRef = useRef(
    new Map<string, Promise<readonly WorkStatusOption[]>>()
  );
  const draggedItemRef = useRef<WorkItem | null>(null);
  const suppressOpenRef = useRef<string | null>(null);
  const [discovered, setDiscovered] = useState<WorkStatusOption[]>([]);
  const [pickup, setPickup] = useState<{
    item: WorkItem;
    options: readonly WorkStatusOption[];
    targetLane: string | null;
    mode: 'pointer' | 'keyboard';
  } | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [workflowReady, setWorkflowReady] = useState(
    workflowItems.length === 0
  );
  const [announcement, setAnnouncement] = useState('');
  const [visibleMessage, setVisibleMessage] = useState<string | null>(null);
  const lanes = useMemo(
    () => workflowStatusLanes(items, discovered, statusOrder),
    [discovered, items, statusOrder]
  );
  const preloadItems = useMemo(() => {
    const representatives = new Map<string, WorkItem>();
    for (const item of workflowItems) {
      const scope = `${item.bbProjectId}:${item.source}`;
      if (!representatives.has(scope)) {
        representatives.set(scope, item);
      }
    }
    return [...representatives.values()];
  }, [workflowItems]);

  const loadOptions = useCallback(
    (item: WorkItem) => {
      const itemId = kanbanItemId(item);
      const existing = optionsRef.current.get(itemId);
      if (existing) return existing;
      const request = rpc
        .call('statusOptions', {
          projectId: item.bbProjectId,
          source: item.source,
          locator: item.locator
        })
        .then(result => result.options)
        .catch((error: unknown) => {
          optionsRef.current.delete(itemId);
          throw error;
        });
      optionsRef.current.set(itemId, request);
      return request;
    },
    [rpc]
  );

  useEffect(() => {
    if (preloadItems.length === 0) {
      setWorkflowReady(true);
      return;
    }
    let cancelled = false;
    setWorkflowReady(false);
    void Promise.all(
      preloadItems.map(item => loadOptions(item).catch(() => []))
    ).then(statusSets => {
      if (cancelled) return;
      setDiscovered(current =>
        mergeDiscoveredStatuses(current, statusSets.flat())
      );
      setWorkflowReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadOptions, preloadItems]);

  const beginPickup = useCallback(
    async (item: WorkItem, mode: 'pointer' | 'keyboard') => {
      const itemId = kanbanItemId(item);
      setPickup({ item, options: [], targetLane: null, mode });
      setChecking(itemId);
      setVisibleMessage(null);
      setAnnouncement(`Checking valid statuses for ${item.key}`);
      try {
        const options = await loadOptions(item);
        const targets = options.filter(option => !option.current);
        setDiscovered(current => mergeDiscoveredStatuses(current, options));
        if (targets.length === 0) {
          const message = `${item.key} has no available status moves.`;
          setPickup(null);
          setVisibleMessage(message);
          setAnnouncement(message);
          return;
        }
        const targetLane = workflowStatusLaneKey(
          targets[0]!.name,
          targets[0]!.stateCategory
        );
        setPickup(current =>
          current && kanbanItemId(current.item) === itemId
            ? {
                ...current,
                options,
                targetLane: current.targetLane ?? targetLane
              }
            : current
        );
        setAnnouncement(
          `${item.key} picked up. ${targets.length} status ${targets.length === 1 ? 'target' : 'targets'} available. ${targets[0]!.name} selected.`
        );
      } catch (error) {
        const message = describeError(error);
        setPickup(null);
        setVisibleMessage(message);
        setAnnouncement(`Could not move ${item.key}. ${message}`);
      } finally {
        setChecking(current => (current === itemId ? null : current));
      }
    },
    [loadOptions]
  );

  const optionForLane = useCallback(
    (laneKey: string) =>
      pickup?.options.find(
        option =>
          !option.current &&
          workflowStatusLaneKey(option.name, option.stateCategory) === laneKey
      ),
    [pickup]
  );

  const commitMove = useCallback(
    async (
      item: WorkItem,
      laneKey: string,
      knownOptions: readonly WorkStatusOption[] = []
    ) => {
      if (pending) return;
      const itemId = kanbanItemId(item);
      let option = knownOptions.find(
        candidate =>
          !candidate.current &&
          workflowStatusLaneKey(candidate.name, candidate.stateCategory) ===
          laneKey
      );
      if (!option) {
        try {
          const options = await loadOptions(item);
          option = options.find(
            candidate =>
              !candidate.current &&
              workflowStatusLaneKey(
                candidate.name,
                candidate.stateCategory
              ) === laneKey
          );
        } catch (error) {
          const message = describeError(error);
          setPickup(null);
          setVisibleMessage(message);
          setAnnouncement(`Could not move ${item.key}. ${message}`);
          return;
        }
      }
      if (!option) {
        const message = `${item.key} cannot move to that status.`;
        setPickup(null);
        setVisibleMessage(message);
        setAnnouncement(message);
        return;
      }
      setPending(itemId);
      setPickup(null);
      setVisibleMessage(null);
      setAnnouncement(`Moving ${item.key} to ${option.name}`);
      try {
        await onMove(item, option);
        optionsRef.current.delete(itemId);
        setAnnouncement(`${item.key} moved to ${option.name}`);
      } catch (error) {
        optionsRef.current.delete(itemId);
        const message = describeError(error);
        setVisibleMessage(`${item.key} stayed in ${item.status}. ${message}`);
        setAnnouncement(`${item.key} move failed. ${message}`);
      } finally {
        setPending(current => (current === itemId ? null : current));
      }
    },
    [loadOptions, onMove, pending]
  );

  const keyboardTargets =
    pickup?.options.filter(option => !option.current) ?? [];

  return (
    <div
      role="region"
      aria-label="Kanban board"
      className="tb-kanban-area h-full min-h-0 overflow-auto p-2"
    >
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </p>
      {visibleMessage ? (
        <div
          role="alert"
          className="tb-kanban-feedback sticky left-0 top-0 z-30 mb-2 w-fit max-w-lg rounded-md border px-2.5 py-1.5 text-xs text-destructive"
        >
          {visibleMessage}
        </div>
      ) : null}
      {!workflowReady ? (
        <div
          role="status"
          className="tb-kanban-feedback sticky left-0 top-0 z-30 mb-2 w-fit rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          Loading workflow statuses…
        </div>
      ) : null}
      {lanes.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No external statuses in the current results
        </div>
      ) : (
        <div
          dir="ltr"
          data-kanban-lanes="ordered"
          className="ml-0 mr-auto flex min-h-full min-w-max flex-row gap-2.5"
        >
          {lanes.map(lane => {
            const columnItems = items.filter(
              item =>
                workflowStatusLaneKey(item.status, item.stateCategory) ===
                lane.key
            );
            const option = optionForLane(lane.key);
            const dropState = pickup
              ? pickup.options.length === 0
                ? pickup.targetLane === lane.key
                  ? 'checking'
                  : 'invalid'
                : option
                  ? pickup.targetLane === lane.key
                    ? 'target'
                    : 'valid'
                  : 'invalid'
              : 'idle';
            const headingId = `kanban-${encodeURIComponent(lane.key)}`;
            return (
              <section
                key={lane.key}
                aria-labelledby={headingId}
                aria-dropeffect={
                  pickup && (pickup.options.length === 0 || option)
                    ? 'move'
                    : 'none'
                }
                data-drop-state={dropState}
                data-state-category={lane.category}
                data-status-tone={workflowStatusTone(
                  lane.name,
                  lane.category
                )}
                onDragOver={event => {
                  if (!pickup && !draggedItemRef.current) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setPickup(current =>
                    current ? { ...current, targetLane: lane.key } : current
                  );
                }}
                onDrop={event => {
                  event.preventDefault();
                  const item = draggedItemRef.current ?? pickup?.item;
                  draggedItemRef.current = null;
                  if (item) {
                    void commitMove(item, lane.key, pickup?.options);
                  }
                }}
                className="tb-kanban-column flex w-[264px] min-w-[264px] flex-col rounded-lg border border-transparent"
              >
                <div className="tb-kanban-column-header sticky top-0 z-10 flex h-8 items-center gap-2 px-1">
                  <WorkStateGlyph category={lane.category} />
                  <h3
                    id={headingId}
                    className="min-w-0 truncate text-xs font-semibold"
                  >
                    {lane.name}
                  </h3>
                  <span
                    aria-label={`${columnItems.length} ${columnItems.length === 1 ? 'item' : 'items'}`}
                    className="tb-lane-count ml-auto text-xs tabular-nums"
                  >
                    {columnItems.length}
                  </span>
                </div>
                <div className="min-h-20 flex-1 space-y-1.5 p-1.5 pt-1">
                  {columnItems.length > 0 ? (
                    columnItems.map(item => {
                      const itemId = kanbanItemId(item);
                      return (
                        <KanbanCard
                          key={itemId}
                          item={item}
                          pickedUp={
                            pickup
                              ? kanbanItemId(pickup.item) === itemId
                              : false
                          }
                          pending={pending === itemId}
                          moveDisabled={!workflowReady}
                          onPrepare={() => {
                            void loadOptions(item).catch(() => undefined);
                          }}
                          onDragStart={event => {
                            if (pending || checking || !workflowReady) {
                              event.preventDefault();
                              return;
                            }
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', itemId);
                            draggedItemRef.current = item;
                            suppressOpenRef.current = itemId;
                            void beginPickup(item, 'pointer');
                          }}
                          onDragEnd={() => {
                            draggedItemRef.current = null;
                            setPickup(current =>
                              current?.mode === 'pointer' ? null : current
                            );
                            window.setTimeout(() => {
                              if (suppressOpenRef.current === itemId) {
                                suppressOpenRef.current = null;
                              }
                            }, 0);
                          }}
                          onKeyDown={event => {
                            if (!workflowReady && event.key === ' ') {
                              event.preventDefault();
                              setAnnouncement(
                                'Workflow statuses are still loading'
                              );
                              return;
                            }
                            const isThisPickup =
                              pickup && kanbanItemId(pickup.item) === itemId;
                            if (!isThisPickup && event.key === ' ') {
                              event.preventDefault();
                              void beginPickup(item, 'keyboard');
                              return;
                            }
                            if (!isThisPickup) return;
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              setPickup(null);
                              setAnnouncement(`${item.key} move canceled`);
                              return;
                            }
                            if (
                              event.key === 'ArrowLeft' ||
                              event.key === 'ArrowRight'
                            ) {
                              event.preventDefault();
                              const currentIndex = keyboardTargets.findIndex(
                                target =>
                                  workflowStatusLaneKey(
                                    target.name,
                                    target.stateCategory
                                  ) === pickup.targetLane
                              );
                              const direction =
                                event.key === 'ArrowRight' ? 1 : -1;
                              const next =
                                keyboardTargets[
                                  (currentIndex +
                                    direction +
                                    keyboardTargets.length) %
                                    keyboardTargets.length
                                ];
                              if (!next) return;
                              const targetLane = workflowStatusLaneKey(
                                next.name,
                                next.stateCategory
                              );
                              setPickup(current =>
                                current ? { ...current, targetLane } : current
                              );
                              setAnnouncement(
                                `${next.name} selected for ${item.key}`
                              );
                              return;
                            }
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              if (pickup.targetLane) {
                                void commitMove(
                                  pickup.item,
                                  pickup.targetLane,
                                  pickup.options
                                );
                              }
                            }
                          }}
                          onOpen={() => {
                            if (suppressOpenRef.current === itemId) {
                              suppressOpenRef.current = null;
                              return;
                            }
                            if (!pickup) onOpen(item);
                          }}
                        />
                      );
                    })
                  ) : (
                    <p className="px-2 py-5 text-center text-xs text-muted-foreground">
                      {dropState === 'target' ? 'Drop to move here' : 'No work'}
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TrackerList({
  projectId,
  projects,
  refreshGeneration,
  surfaceMode,
  onOpen
}: {
  projectId: string | null;
  projects: readonly TrackerProject[] | undefined;
  refreshGeneration: number;
  surfaceMode: 'full' | 'constrained';
  onOpen: (item: WorkItem) => void;
}) {
  const rpc = useRpc<TaskboardRpcContract>();
  const preferenceScope: BrowsePreferenceScope =
    projectId === null ? ACROSS_PROJECTS_SCOPE : projectBrowseScope(projectId);
  const subscribePreferences = useCallback(
    (listener: () => void) =>
      browsePreferenceStore.subscribe(preferenceScope, listener),
    [preferenceScope]
  );
  const readPreferences = useCallback(
    () => browsePreferenceStore.get(preferenceScope),
    [preferenceScope]
  );
  const preferences = useSyncExternalStore(
    subscribePreferences,
    readPreferences,
    readPreferences
  );
  const updatePreferences = useCallback(
    (update: (current: BrowsePreferences) => BrowsePreferences) =>
      browsePreferenceStore.update(preferenceScope, update),
    [preferenceScope]
  );
  const {
    source,
    stateCategories,
    statuses,
    assignees,
    priorities,
    externalProjects,
    labels,
    collapsedGroups,
    query,
    view
  } = preferences;
  const [items, setItems] = useState<WorkItem[] | undefined>();
  const [boardSettings, setBoardSettings] = useState<ProjectBoardSettings>(() =>
    defaultProjectBoardSettings(projectId ?? 'proj_across_projects')
  );
  const [boardSettingsReady, setBoardSettingsReady] = useState(
    projectId === null
  );
  const presetState = useProjectFilterPresets(projectId);
  const [presetNameDraft, setPresetNameDraft] = useState<string | null>(null);
  const [presetSaveError, setPresetSaveError] = useState<string | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);
  const savingPresetRef = useRef(false);
  const presetSaveDescriptionId = useId();
  const presetSaveErrorId = useId();
  const [authoritativeProvider, setAuthoritativeProvider] =
    useState<WorkSource | null>(null);
  const [committedQuery, setCommittedQuery] = useState(() => query.trim());
  const [error, setError] = useState<string | null>(null);
  const requestRevisionRef = useRef(0);
  const stateFilterEnabled = boardSettings.enabledFilters.includes('state');

  useEffect(() => {
    if (projectId === null) {
      setBoardSettings(defaultProjectBoardSettings('proj_across_projects'));
      setBoardSettingsReady(true);
      return;
    }
    let cancelled = false;
    setBoardSettingsReady(false);
    void rpc
      .call('getProjectBoardSettings', { projectId })
      .then(result => {
        if (cancelled) return;
        setBoardSettings(result.settings);
        browsePreferenceStore.seed(preferenceScope, {
          view: result.settings.defaultView
        });
      })
      .catch(() => {
        if (cancelled) return;
        const defaults = defaultProjectBoardSettings(projectId);
        setBoardSettings(defaults);
        browsePreferenceStore.seed(preferenceScope, {
          view: defaults.defaultView
        });
      })
      .finally(() => {
        if (!cancelled) setBoardSettingsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [preferenceScope, projectId, rpc]);

  const loadItems = useCallback(async () => {
    if (!boardSettingsReady) return;
    const requestRevision = ++requestRevisionRef.current;
    if (projectId !== null) setAuthoritativeProvider(null);
    setError(null);
    try {
      const result = await rpc.call('listItems', {
        ...(projectId === null ? {} : { projectId }),
        ...(projectId === null && source !== ALL_SOURCES ? { source } : {}),
        ...(committedQuery.trim() ? { query: committedQuery.trim() } : {}),
        ...(stateFilterEnabled && stateCategories.length > 0
          ? { stateCategories }
          : {}),
        limit: 500
      });
      if (requestRevision !== requestRevisionRef.current) return;
      const provider = result.provider;
      if (projectId !== null && provider) {
        browsePreferenceStore.reconcileProvider(
          projectBrowseScope(projectId),
          provider,
          { view: boardSettings.defaultView }
        );
        setAuthoritativeProvider(provider);
      }
      setItems(result.items);
    } catch (nextError) {
      if (requestRevision !== requestRevisionRef.current) return;
      setError(describeError(nextError));
      setItems([]);
    }
  }, [
    rpc,
    projectId,
    source,
    committedQuery,
    stateCategories,
    stateFilterEnabled,
    boardSettings.defaultView,
    boardSettingsReady
  ]);

  useEffect(() => {
    void loadItems();
  }, [loadItems, refreshGeneration]);
  useEffect(() => {
    if (projectId !== null && source !== ALL_SOURCES) {
      updatePreferences(current => ({ ...current, source: ALL_SOURCES }));
    }
  }, [projectId, source, updatePreferences]);
  useEffect(() => {
    requestRevisionRef.current += 1;
    const timeout = window.setTimeout(
      () => setCommittedQuery(query.trim()),
      160
    );
    return () => window.clearTimeout(timeout);
  }, [query]);
  useEffect(
    () => () => {
      requestRevisionRef.current += 1;
    },
    []
  );
  useRealtime('taskboard:changed', payload => {
    const changedProject = changedProjectId(payload);
    if (
      projectId === null ||
      changedProject === null ||
      changedProject === projectId
    ) {
      void loadItems();
    }
  });
  useRefreshOnReconnect(() => void loadItems());

  const projectsById = useMemo(
    () => new Map((projects ?? []).map(project => [project.id, project])),
    [projects]
  );
  const availableAssignees = useMemo(
    () => assigneeFilterOptions(items ?? [], assignees),
    [assignees, items]
  );
  const availableStatuses = useMemo(
    () => statusFilterOptions(items ?? [], statuses, boardSettings.statusOrder),
    [boardSettings.statusOrder, items, statuses]
  );
  const availablePriorities = useMemo(
    () => priorityFilterOptions(items ?? [], priorities),
    [items, priorities]
  );
  const availableExternalProjects = useMemo(
    () => projectFilterOptions(items ?? [], externalProjects),
    [externalProjects, items]
  );
  const availableLabels = useMemo(
    () => labelFilterOptions(items ?? [], labels),
    [items, labels]
  );
  useEffect(() => {
    updatePreferences(current => {
      const nextStatuses = canonicalizeSelectedFilterOptions(
        current.statuses,
        availableStatuses
      );
      const nextAssignees = canonicalizeSelectedFilterOptions(
        current.assignees,
        availableAssignees
      );
      const nextPriorities = canonicalizeSelectedFilterOptions(
        current.priorities,
        availablePriorities
      );
      const nextExternalProjects = canonicalizeSelectedFilterOptions(
        current.externalProjects,
        availableExternalProjects
      );
      const nextLabels = canonicalizeSelectedFilterOptions(
        current.labels,
        availableLabels
      );
      if (
        sameStringValues(current.statuses, nextStatuses) &&
        sameStringValues(current.assignees, nextAssignees) &&
        sameStringValues(current.priorities, nextPriorities) &&
        sameStringValues(current.externalProjects, nextExternalProjects) &&
        sameStringValues(current.labels, nextLabels)
      ) {
        return current;
      }
      return {
        ...current,
        statuses: nextStatuses,
        assignees: nextAssignees,
        priorities: nextPriorities,
        externalProjects: nextExternalProjects,
        labels: nextLabels
      };
    });
  }, [
    availableAssignees,
    availableExternalProjects,
    availableLabels,
    availablePriorities,
    availableStatuses,
    updatePreferences
  ]);
  const visibleItems = useMemo(
    () =>
      sortWorkItemsByWorkflow(
        filterWorkItemsByAttributes(items ?? [], {
          statuses: boardSettings.enabledFilters.includes('status')
            ? statuses
            : [],
          assignees: boardSettings.enabledFilters.includes('assignee')
            ? assignees
            : [],
          priorities: boardSettings.enabledFilters.includes('priority')
            ? priorities
            : [],
          projects: boardSettings.enabledFilters.includes('project')
            ? externalProjects
            : [],
          labels: boardSettings.enabledFilters.includes('labels') ? labels : []
        }),
        boardSettings.statusOrder
      ),
    [
      assignees,
      boardSettings.enabledFilters,
      boardSettings.statusOrder,
      externalProjects,
      items,
      labels,
      priorities,
      statuses
    ]
  );
  const acrossProjectGroups = useMemo(
    () =>
      (projects ?? []).flatMap(project => {
        const projectItems = visibleItems.filter(
          item => item.bbProjectId === project.id
        );
        return projectItems.length > 0
          ? [{ project, items: projectItems }]
          : [];
      }),
    [projects, visibleItems]
  );
  const duplicateProjectNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of projects ?? []) {
      counts.set(project.name, (counts.get(project.name) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([name]) => name)
    );
  }, [projects]);
  const filtered =
    (projectId === null && source !== ALL_SOURCES) ||
    (stateFilterEnabled && stateCategories.length > 0) ||
    (boardSettings.enabledFilters.includes('status') && statuses.length > 0) ||
    (boardSettings.enabledFilters.includes('assignee') &&
      assignees.length > 0) ||
    (boardSettings.enabledFilters.includes('priority') &&
      priorities.length > 0) ||
    (boardSettings.enabledFilters.includes('project') &&
      externalProjects.length > 0) ||
    (boardSettings.enabledFilters.includes('labels') && labels.length > 0) ||
    committedQuery.trim() !== '';
  const clearFilters = () => {
    browsePreferenceStore.clearFilters(preferenceScope);
    setCommittedQuery('');
  };
  const toggleGroup = useCallback(
    (groupKey: string, category: WorkStateCategory) => {
      updatePreferences(current => ({
        ...current,
        collapsedGroups: toggleGroupCollapsedOverride(
          current.collapsedGroups,
          groupKey,
          category
        )
      }));
    },
    [updatePreferences]
  );
  const applyPreset = useCallback(
    (preset: FilterPreset) => {
      if (projectId === null || preset.projectId !== projectId) {
        toast.error('This preset belongs to a different project.');
        return;
      }
      if (authoritativeProvider === null) {
        toast.error('Wait for this project’s tracker to finish loading.');
        return;
      }
      if (preset.state.provider !== authoritativeProvider) {
        toast.error(
          'This preset was saved for a different tracker. Save a new preset for the current project connection.'
        );
        return;
      }
      browsePreferenceStore.set(preferenceScope, preset.state);
      toast.success(`Applied preset "${preset.name}"`);
    },
    [authoritativeProvider, preferenceScope, projectId]
  );
  const saveCurrentPreset = useCallback(
    async (name: string) => {
      if (projectId === null || savingPresetRef.current) return;
      if (
        authoritativeProvider === null ||
        preferences.provider !== authoritativeProvider
      ) {
        setPresetSaveError(
          'Wait for this project’s tracker to finish loading, then try again.'
        );
        return;
      }
      savingPresetRef.current = true;
      setSavingPreset(true);
      setPresetSaveError(null);
      try {
        const result = await rpc.call('saveFilterPreset', {
          projectId,
          name,
          state: preferences
        });
        presetState.setAuthoritative(result.presets);
        setPresetNameDraft(null);
        setPresetSaveError(null);
        toast.success(`Saved preset "${result.preset.name}"`);
      } catch (nextError) {
        const message = describeError(nextError);
        setPresetSaveError(message);
        toast.error(message);
      } finally {
        savingPresetRef.current = false;
        setSavingPreset(false);
      }
    },
    [authoritativeProvider, preferences, presetState, projectId, rpc]
  );
  const moveItemStatus = useCallback(
    async (item: WorkItem, option: WorkStatusOption) => {
      const matches = (candidate: WorkItem) =>
        candidate.bbProjectId === item.bbProjectId &&
        candidate.source === item.source &&
        candidate.locator === item.locator;
      setItems(current =>
        current?.map(candidate =>
          matches(candidate)
            ? {
                ...candidate,
                status: option.name,
                stateCategory: option.stateCategory
              }
            : candidate
        )
      );
      try {
        const result = await rpc.call('updateItemStatus', {
          projectId: item.bbProjectId,
          source: item.source,
          locator: item.locator,
          statusId: option.id
        });
        setItems(current =>
          current?.map(candidate =>
            matches(candidate) ? result.item : candidate
          )
        );
      } catch (error) {
        setItems(current =>
          current?.map(candidate => (matches(candidate) ? item : candidate))
        );
        throw error;
      }
    },
    [rpc]
  );

  const content = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="tb-frame flex h-full min-h-0 w-full flex-col overflow-hidden">
        <TrackerFilterBar
          presets={projectId === null ? null : presetState.presets}
          presetsError={presetState.error}
          presetsRefreshError={presetState.refreshError}
          presetsLoading={presetState.loading}
          presetActionsReady={authoritativeProvider !== null}
          onApplyPreset={applyPreset}
          onRetryPresets={() =>
            void presetState.reload({
              background: presetState.presets.length > 0
            })
          }
          onSaveCurrentPreset={() => {
            setPresetSaveError(null);
            setPresetNameDraft('');
          }}
          source={projectId === null ? source : ALL_SOURCES}
          enabledFilters={boardSettings.enabledFilters}
          stateCategories={stateCategories}
          statuses={statuses}
          statusOptions={availableStatuses}
          assignees={assignees}
          assigneeOptions={availableAssignees}
          priorities={priorities}
          priorityOptions={availablePriorities}
          externalProjects={externalProjects}
          projectOptions={availableExternalProjects}
          labels={labels}
          labelOptions={availableLabels}
          query={query}
          view={view}
          surfaceMode={surfaceMode}
          showSourceFilter={projectId === null}
          showViewToggle={projectId !== null}
          onSourceChange={nextSource =>
            updatePreferences(current => ({ ...current, source: nextSource }))
          }
          onStateCategoriesChange={nextStateCategories =>
            updatePreferences(current => ({
              ...current,
              stateCategories: nextStateCategories
            }))
          }
          onStatusesChange={nextStatuses =>
            updatePreferences(current => ({ ...current, statuses: nextStatuses }))
          }
          onAssigneesChange={nextAssignees =>
            updatePreferences(current => ({
              ...current,
              assignees: nextAssignees
            }))
          }
          onPrioritiesChange={nextPriorities =>
            updatePreferences(current => ({
              ...current,
              priorities: nextPriorities
            }))
          }
          onExternalProjectsChange={nextExternalProjects =>
            updatePreferences(current => ({
              ...current,
              externalProjects: nextExternalProjects
            }))
          }
          onLabelsChange={nextLabels =>
            updatePreferences(current => ({ ...current, labels: nextLabels }))
          }
          onQueryChange={nextQuery =>
            updatePreferences(current => ({ ...current, query: nextQuery }))
          }
          onViewChange={nextView =>
            updatePreferences(current => ({ ...current, view: nextView }))
          }
          onClear={clearFilters}
        />
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {items === undefined
            ? 'Loading work items'
            : error
              ? 'Work items could not be loaded'
              : visibleItems.length === 0
                ? filtered
                  ? 'No work items match the current filters'
                  : 'No work items available'
                : `${visibleItems.length} ${visibleItems.length === 1 ? 'work item' : 'work items'} shown`}
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto @container">
          {items === undefined || !boardSettingsReady ? (
            <ListMeasure>
              <LoadingRows />
            </ListMeasure>
          ) : error ? (
            <ListMeasure className="h-full">
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <Icon name="AlertCircle" className="size-5 text-destructive" />
                <p className="text-sm font-medium">Could not load work items</p>
                <p role="alert" className="max-w-md text-sm text-destructive">
                  {error}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setItems(undefined);
                    void loadItems();
                  }}
                >
                  Try again
                </Button>
              </div>
            </ListMeasure>
          ) : projectId !== null && view === 'kanban' ? (
            <KanbanBoard
              key={projectId}
              items={visibleItems}
              workflowItems={items}
              statusOrder={boardSettings.statusOrder}
              onOpen={onOpen}
              onMove={moveItemStatus}
            />
          ) : visibleItems.length === 0 ? (
            <ListMeasure className="h-full">
              <EmptyState filtered={filtered} onClear={clearFilters} />
            </ListMeasure>
          ) : projectId === null ? (
            <ListMeasure>
              {acrossProjectGroups.map(({ project, items: projectItems }) => (
                <section
                  key={project.id}
                  aria-labelledby={`project-${project.id}`}
                  className="border-b border-border last:border-b-0"
                >
                  <h2
                    id={`project-${project.id}`}
                    className="tb-project-strip sticky top-0 z-20 flex h-8 items-center gap-2 border-b px-2.5 text-xs font-semibold"
                  >
                    <Icon
                      name="Folder"
                      className="size-3.5 text-muted-foreground"
                    />
                    {project.name}
                    {duplicateProjectNames.has(project.name) ? (
                      <span className="truncate font-mono text-xs font-normal text-muted-foreground">
                        {project.id}
                      </span>
                    ) : null}
                  </h2>
                  <ListStateGroups
                    items={projectItems}
                    statusOrder={boardSettings.statusOrder}
                    projectsById={projectsById}
                    showProject={false}
                    idPrefix={project.id}
                    nested
                    collapsedGroups={collapsedGroups}
                    searchActive={committedQuery.trim() !== ''}
                    onToggleGroup={toggleGroup}
                    onMove={moveItemStatus}
                    onOpen={onOpen}
                  />
                </section>
              ))}
            </ListMeasure>
          ) : (
            <ListMeasure>
              <ListStateGroups
                items={visibleItems}
                statusOrder={boardSettings.statusOrder}
                projectsById={projectsById}
                showProject={false}
                idPrefix={projectId ?? 'selected-project'}
                collapsedGroups={collapsedGroups}
                searchActive={committedQuery.trim() !== ''}
                onToggleGroup={toggleGroup}
                onMove={moveItemStatus}
                onOpen={onOpen}
              />
            </ListMeasure>
          )}
        </div>
      </div>
    </div>
  );
  return (
    <TooltipProvider delayDuration={180}>
      {content}
      <Dialog
        open={presetNameDraft !== null}
        onOpenChange={open => {
          if (!open && !savingPreset) {
            setPresetNameDraft(null);
            setPresetSaveError(null);
          }
        }}
      >
        <DialogContent aria-busy={savingPreset}>
          <DialogHeader>
            <DialogTitle>Save filter preset</DialogTitle>
            <DialogDescription id={presetSaveDescriptionId}>
              Save the current filters, search, layout, and collapsed groups
              for this project.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={event => {
              event.preventDefault();
              const name = (presetNameDraft ?? '').trim();
              if (name) void saveCurrentPreset(name);
            }}
            className="flex flex-col gap-3"
          >
            <Input
              autoFocus
              value={presetNameDraft ?? ''}
              disabled={savingPreset}
              onChange={event => setPresetNameDraft(event.target.value)}
              placeholder="My work"
              maxLength={FILTER_PRESET_NAME_MAX_LENGTH}
              aria-label="Preset name"
              aria-invalid={presetSaveError !== null}
              aria-describedby={
                presetSaveError
                  ? `${presetSaveDescriptionId} ${presetSaveErrorId}`
                  : presetSaveDescriptionId
              }
            />
            {presetSaveError ? (
              <p
                id={presetSaveErrorId}
                role="alert"
                className="text-sm text-destructive"
              >
                {presetSaveError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={savingPreset}
                onClick={() => {
                  setPresetNameDraft(null);
                  setPresetSaveError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingPreset || !(presetNameDraft ?? '').trim()}
              >
                {savingPreset ? 'Saving…' : 'Save'}
              </Button>
            </div>
            {savingPreset ? (
              <p role="status" className="sr-only">
                Saving filter preset
              </p>
            ) : null}
          </form>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

function DetailMetadata({
  item,
  className
}: {
  item: WorkItemDetail;
  className?: string;
}) {
  const fields = [
    ['Source', sourceName(item.source)],
    ['Status', item.status],
    ['Priority', item.priority ?? 'None'],
    ['Assignee', item.assignee ?? 'Unassigned'],
    ['External project', item.project ?? 'None'],
    ['Updated', formatUpdatedAt(item.updatedAt)]
  ] as const;
  return (
    <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-3', className)}>
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="truncate text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TrackerDetail({
  route,
  refreshGeneration
}: {
  route: Extract<TrackerRoute, { kind: 'item' }>;
  refreshGeneration: number;
}) {
  const rpc = useRpc<TaskboardRpcContract>();
  const navigate = useBbNavigate();
  const [item, setItem] = useState<WorkItemDetail | null | undefined>();
  const [error, setError] = useState<string | null>(null);
  const requestRevisionRef = useRef(0);

  const load = useCallback(async () => {
    const requestRevision = ++requestRevisionRef.current;
    setError(null);
    try {
      const result = await rpc.call('getItem', {
        projectId: route.projectId,
        source: route.source,
        locator: route.locator
      });
      if (requestRevision !== requestRevisionRef.current) return;
      setItem(result.item);
    } catch (nextError) {
      if (requestRevision !== requestRevisionRef.current) return;
      setItem(null);
      setError(describeError(nextError));
    }
  }, [rpc, route.projectId, route.source, route.locator]);

  useEffect(() => {
    setItem(undefined);
    void load();
    return () => {
      requestRevisionRef.current += 1;
    };
  }, [load, refreshGeneration]);
  useRealtime('taskboard:changed', payload => {
    const changedProject = changedProjectId(payload);
    if (changedProject === null || changedProject === route.projectId) {
      void load();
    }
  });
  useRefreshOnReconnect(() => void load());

  const moveItemStatus = useCallback(
    async (_selectedItem: WorkItem, option: WorkStatusOption) => {
      if (!item) throw new Error('The work item is not loaded.');
      const previous = item;
      setItem({
        ...item,
        status: option.name,
        stateCategory: option.stateCategory
      });
      try {
        const result = await rpc.call('updateItemStatus', {
          projectId: route.projectId,
          source: route.source,
          locator: route.locator,
          statusId: option.id
        });
        setItem(current =>
          current
            ? { ...current, ...result.item, comments: current.comments }
            : current
        );
      } catch (nextError) {
        setItem(previous);
        throw nextError;
      }
    },
    [item, route.locator, route.projectId, route.source, rpc]
  );

  if (item === undefined) {
    return (
      <div className="space-y-4 p-4 md:p-5">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-52 w-full" />
      </div>
    );
  }

  if (item === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Icon name="AlertCircle" className="size-6 text-destructive" />
        <p className="text-sm font-medium">Could not load this work item</p>
        <p role="alert" className="max-w-md text-sm text-muted-foreground">
          {error}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setItem(undefined);
            void load();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const prompt = formatWorkItemHandoffPrompt(item);

  return (
    <div className="@container flex min-h-full flex-col">
      <div className="tb-detail-frame flex flex-1 items-stretch">
        <article className="mx-auto w-full min-w-0 max-w-[52rem] flex-1 px-5 pb-16 pt-7 @3xl:px-10 @3xl:pt-10">
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium tabular-nums">{item.key}</span>
            <WorkItemStatusMenu
              item={item}
              variant="detail"
              onMove={moveItemStatus}
            />
            <SourceMark source={item.source} />
          </div>
          <div className="flex flex-col gap-4 @lg:flex-row @lg:items-start">
            <h1 className="min-w-0 flex-1 text-2xl font-semibold leading-tight">
              {item.title}
            </h1>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={item.url} target="_blank" rel="noreferrer">
                  <Icon name="ExternalLink" className="size-3.5" />
                  Open
                </a>
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  navigate.toCompose({
                    initialPrompt: prompt,
                    focusPrompt: true
                  })
                }
              >
                <Icon name="AiContentGenerator01" className="size-3.5" />
                Send to agent
              </Button>
            </div>
          </div>

          <DetailMetadata
            item={item}
            className="tb-detail-meta mt-5 border-y py-4 @[45rem]:hidden"
          />

          {item.labels.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {item.labels.map(label => (
                <Badge key={label} variant="secondary">
                  {label}
                </Badge>
              ))}
            </div>
          ) : null}

          <section className="mt-7">
            <h2 className="mb-3 text-sm font-semibold">Description</h2>
            {item.description.trim() ? (
              <Markdown content={item.description} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No description provided.
              </p>
            )}
          </section>

          {item.comments.length > 0 ? (
            <section className="tb-comment-rail mt-8 border-t pt-5">
              <h2 className="mb-1 text-sm font-semibold">
                Comments <span className="text-muted-foreground">{item.comments.length}</span>
              </h2>
              <div className="ml-2">
                {item.comments.map((comment, index) => (
                  <article
                    key={`${comment.author}:${comment.createdAt}:${index}`}
                    className="tb-comment-entry relative py-4 pl-6"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {comment.author}
                      </span>
                      <time>{formatUpdatedAt(comment.createdAt)}</time>
                    </div>
                    <Markdown content={comment.body} />
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </article>

        <aside className="hidden w-56 shrink-0 border-l border-border-hairline py-10 pl-4 pr-6 @[45rem]:block">
          <DetailMetadata item={item} className="grid-cols-1" />
        </aside>
      </div>
    </div>
  );
}

function configFingerprint(config: ProjectConfigView): string {
  return JSON.stringify({
    source: config.source,
    linearTeamKey: config.linearTeamKey,
    jiraBaseUrl: config.jiraBaseUrl,
    jiraEmail: config.jiraEmail,
    jiraJql: config.jiraJql
  });
}

function secretMutation(value: string, remove: boolean): SecretMutation {
  if (value.trim()) return { operation: 'set', value: value.trim() };
  return remove ? { operation: 'clear' } : { operation: 'keep' };
}

function CredentialStatus({
  configured,
  hasDraft,
  remove
}: {
  configured: boolean;
  hasDraft: boolean;
  remove: boolean;
}) {
  const label = remove
    ? 'Removal queued'
    : hasDraft
      ? configured
        ? 'Replacement ready'
        : 'Credential ready'
      : configured
        ? 'Configured'
        : 'Not configured';
  return (
    <span
      className={cn(
        'tb-status-pill inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        configured && !remove
          ? 'border-success/30 bg-success/10 text-success'
          : 'text-muted-foreground'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          configured && !remove ? 'bg-success' : 'bg-muted-foreground/60'
        )}
      />
      {label}
    </span>
  );
}

function ProjectConfigForm({
  initialConfig,
  onSave,
  onSavingChange
}: {
  initialConfig: ProjectConfigView;
  onSave: (mutation: ProjectConfigMutation) => Promise<ProjectConfigView>;
  onSavingChange: (saving: boolean) => void;
}) {
  const [baseline, setBaseline] = useState(initialConfig);
  const [config, setConfig] = useState(initialConfig);
  const [linearDraft, setLinearDraft] = useState('');
  const [jiraDraft, setJiraDraft] = useState('');
  const [removeLinear, setRemoveLinear] = useState(false);
  const [removeJira, setRemoveJira] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBaseline(initialConfig);
    setConfig(initialConfig);
    setLinearDraft('');
    setJiraDraft('');
    setRemoveLinear(false);
    setRemoveJira(false);
    setSaving(false);
    setSaved(false);
    setError(null);
  }, [initialConfig]);
  useEffect(
    () => () => {
      onSavingChange(false);
    },
    [onSavingChange]
  );

  const dirty =
    configFingerprint(config) !== configFingerprint(baseline) ||
    linearDraft.trim() !== '' ||
    jiraDraft.trim() !== '' ||
    removeLinear ||
    removeJira;
  const save = async () => {
    if (saving || !dirty) return;
    setSaved(false);
    setError(null);

    const linearCredential = secretMutation(linearDraft, removeLinear);
    const jiraCredential = secretMutation(jiraDraft, removeJira);
    const linearWillBeConfigured =
      linearCredential.operation === 'set' ||
      (baseline.linearCredentialConfigured &&
        linearCredential.operation === 'keep');
    const jiraWillBeConfigured =
      jiraCredential.operation === 'set' ||
      (baseline.jiraCredentialConfigured &&
        jiraCredential.operation === 'keep');

    if (config.source === 'linear') {
      if (!config.linearTeamKey.trim()) {
        setError('Add a Linear team key for this project.');
        return;
      }
      if (!linearWillBeConfigured && linearCredential.operation !== 'clear') {
        setError('Add a Linear API key for this project.');
        return;
      }
    }
    const parsedUrl = jiraBaseUrlSchema.safeParse(config.jiraBaseUrl.trim());
    if (!parsedUrl.success) {
      setError('Jira URL must be an HTTPS atlassian.net origin.');
      return;
    }
    const jiraBaseUrl = parsedUrl.data;
    const jiraIdentityChanged =
      jiraBaseUrl !== baseline.jiraBaseUrl ||
      config.jiraEmail.trim() !== baseline.jiraEmail;
    if (config.source === 'jira') {
      if (!config.jiraEmail.trim()) {
        setError('Add the Jira account email for this project.');
        return;
      }
      if (!config.jiraJql.trim()) {
        setError('Add a Jira JQL query for this project.');
        return;
      }
      if (!jiraWillBeConfigured && jiraCredential.operation !== 'clear') {
        setError('Add a Jira API token for this project.');
        return;
      }
    }
    if (
      jiraIdentityChanged &&
      baseline.jiraCredentialConfigured &&
      jiraCredential.operation === 'keep'
    ) {
      setError(
        'Changing the Jira site or email requires a replacement token or explicit credential removal.'
      );
      return;
    }

    setSaving(true);
    onSavingChange(true);
    try {
      const result = await onSave({
        projectId: config.projectId,
        source: config.source,
        linearTeamKey: config.linearTeamKey.trim(),
        jiraBaseUrl,
        jiraEmail: config.jiraEmail.trim(),
        jiraJql: config.jiraJql.trim(),
        linearCredential,
        jiraCredential
      });
      setBaseline(result);
      setConfig(result);
      setLinearDraft('');
      setJiraDraft('');
      setRemoveLinear(false);
      setRemoveJira(false);
      setSaved(true);
    } catch (nextError) {
      setError(describeError(nextError));
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  };

  const cardClass = 'tb-settings-card rounded-lg border p-4 @lg:p-5';
  return (
    <form
      className="space-y-3"
      onSubmit={event => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={saving} className="space-y-3">
        <legend className="text-sm font-semibold">External tracker</legend>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Choose the one system this BB project uses for external work.
        </p>
        <div
          className="grid gap-2 @lg:grid-cols-3"
          role="radiogroup"
          aria-label="External tracker"
        >
          {TRACKER_OPTIONS.map(option => {
            const selected = config.source === option.source;
            return (
              <label
                key={option.source}
                data-selected={selected ? 'true' : 'false'}
                data-source={option.source}
                className="tb-source-option flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3"
              >
                <input
                  type="radio"
                  name="external-tracker"
                  value={option.source}
                  checked={selected}
                  className="sr-only"
                  onChange={() => {
                    setConfig(current => ({
                      ...current,
                      source: option.source
                    }));
                    setLinearDraft('');
                    setJiraDraft('');
                    setRemoveLinear(false);
                    setRemoveJira(false);
                    setSaved(false);
                    setError(null);
                  }}
                />
                <span className="tb-source-option-icon flex size-8 shrink-0 items-center justify-center rounded-md border">
                  <SourceGlyph source={option.source} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {sourceName(option.source)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="tb-source-option-dot ml-auto size-2 shrink-0 rounded-full"
                />
              </label>
            );
          })}
        </div>
      </fieldset>

      {config.source === 'github' ? (
        <section className={cardClass} aria-labelledby="github-connector-title">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-md border border-border bg-secondary">
                  <SourceGlyph source="github" />
                </span>
                <h3
                  id="github-connector-title"
                  className="text-sm font-semibold"
                >
                  GitHub
                </h3>
              </div>
              <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                Uses this BB project&apos;s repository mapping and the official
                GitHub connection. Taskboard never stores a GitHub token.
              </p>
              <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                {config.githubRepos.length > 0
                  ? 'Mapped repositories for this BB project'
                  : 'No GitHub repositories are currently mapped to this BB project.'}
              </p>
              {config.githubRepos.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {config.githubRepos.map(repo => (
                    <span
                      key={repo}
                      data-source="github"
                      className="tb-repository-chip rounded-full px-2 py-0.5 font-mono text-xs"
                    >
                      {repo}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {config.source === 'linear' ? (
        <section className={cardClass} aria-labelledby="linear-connector-title">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-md border border-border bg-secondary">
                  <SourceGlyph source="linear" />
                </span>
                <h3
                  id="linear-connector-title"
                  className="text-sm font-semibold"
                >
                  Linear
                </h3>
                <CredentialStatus
                  configured={baseline.linearCredentialConfigured}
                  hasDraft={linearDraft.trim() !== ''}
                  remove={removeLinear}
                />
              </div>
              <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                This API key belongs only to this BB project. A team key is
                required so the project cannot silently mix work from other
                teams.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 @lg:grid-cols-2">
            <label className="space-y-1.5 text-xs font-medium">
              Linear API key{' '}
              <span className="font-normal text-muted-foreground">
                (write-only)
              </span>
              <Input
                type="password"
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Linear API key"
                value={linearDraft}
                placeholder={
                  baseline.linearCredentialConfigured
                    ? 'Enter to replace current key'
                    : 'Enter project API key'
                }
                className="tb-field"
                disabled={saving || removeLinear}
                onChange={event => {
                  setLinearDraft(event.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium">
              Linear team key{' '}
              <span className="font-normal text-muted-foreground">
                (required)
              </span>
              <Input
                aria-label="Linear team key"
                value={config.linearTeamKey}
                placeholder="ENG"
                className="tb-field tb-field-mono"
                disabled={saving}
                onChange={event => {
                  setConfig({ ...config, linearTeamKey: event.target.value });
                  setSaved(false);
                }}
              />
            </label>
          </div>
          {baseline.linearCredentialConfigured ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-3 text-destructive hover:text-destructive"
              disabled={saving}
              onClick={() => {
                const next = !removeLinear;
                setRemoveLinear(next);
                setLinearDraft('');
                setSaved(false);
              }}
            >
              <Icon
                name={removeLinear ? 'RotateCcw' : 'Trash2'}
                className="size-3.5"
              />
              {removeLinear
                ? 'Keep Linear credential'
                : 'Remove Linear credential'}
            </Button>
          ) : null}
        </section>
      ) : null}

      {config.source === 'jira' ? (
        <section className={cardClass} aria-labelledby="jira-connector-title">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-md border border-border bg-secondary">
                  <SourceGlyph source="jira" />
                </span>
                <h3 id="jira-connector-title" className="text-sm font-semibold">
                  Jira
                </h3>
                <CredentialStatus
                  configured={baseline.jiraCredentialConfigured}
                  hasDraft={jiraDraft.trim() !== ''}
                  remove={removeJira}
                />
              </div>
              <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                Jira accepts HTTPS atlassian.net sites only. Changing the site
                or account email requires replacing or removing the token.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 @lg:grid-cols-2">
            <label className="space-y-1.5 text-xs font-medium">
              Jira site
              <Input
                aria-label="Jira site"
                value={config.jiraBaseUrl}
                placeholder="https://workspace.atlassian.net"
                className="tb-field tb-field-mono"
                disabled={saving}
                onChange={event => {
                  setConfig({ ...config, jiraBaseUrl: event.target.value });
                  setSaved(false);
                }}
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium">
              Jira account email
              <Input
                type="email"
                aria-label="Jira account email"
                value={config.jiraEmail}
                placeholder="you@example.com"
                className="tb-field"
                disabled={saving}
                onChange={event => {
                  setConfig({ ...config, jiraEmail: event.target.value });
                  setSaved(false);
                }}
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium @lg:col-span-2">
              Jira API token{' '}
              <span className="font-normal text-muted-foreground">
                (write-only)
              </span>
              <Input
                type="password"
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Jira API token"
                value={jiraDraft}
                placeholder={
                  baseline.jiraCredentialConfigured
                    ? 'Enter to replace current token'
                    : 'Enter project API token'
                }
                className="tb-field"
                disabled={saving || removeJira}
                onChange={event => {
                  setJiraDraft(event.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium @lg:col-span-2">
              Jira JQL
              <Textarea
                aria-label="Jira JQL"
                value={config.jiraJql}
                placeholder='project = "BB" AND statusCategory != Done'
                className="tb-field min-h-24 font-mono text-xs"
                disabled={saving}
                onChange={event => {
                  setConfig({ ...config, jiraJql: event.target.value });
                  setSaved(false);
                }}
              />
            </label>
          </div>
          {baseline.jiraCredentialConfigured ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-3 text-destructive hover:text-destructive"
              disabled={saving}
              onClick={() => {
                const next = !removeJira;
                setRemoveJira(next);
                setJiraDraft('');
                setSaved(false);
              }}
            >
              <Icon
                name={removeJira ? 'RotateCcw' : 'Trash2'}
                className="size-3.5"
              />
              {removeJira ? 'Keep Jira credential' : 'Remove Jira credential'}
            </Button>
          ) : null}
        </section>
      ) : null}

      <div className="tb-save-bar sticky bottom-0 flex flex-wrap items-center justify-end gap-3 rounded-lg border px-4 py-3 backdrop-blur-sm">
        {error ? (
          <p role="alert" className="mr-auto max-w-xl text-sm text-destructive">
            {error}
          </p>
        ) : saved ? (
          <span role="status" className="mr-auto text-sm text-success">
            Project connection saved
          </span>
        ) : dirty ? (
          <span className="mr-auto text-xs text-muted-foreground">
            Unsaved project changes
          </span>
        ) : null}
        {error ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => void save()}
          >
            Retry save
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save project connection'}
        </Button>
      </div>
    </form>
  );
}

function boardSettingsFingerprint(settings: ProjectBoardSettings): string {
  return JSON.stringify({
    defaultView: settings.defaultView,
    enabledFilters: settings.enabledFilters,
    statusOrder: settings.statusOrder
  });
}

function ProjectBoardSettingsForm({
  initialSettings,
  onSave,
  onSavingChange
}: {
  initialSettings: ProjectBoardSettings;
  onSave: (settings: ProjectBoardSettings) => Promise<ProjectBoardSettings>;
  onSavingChange: (saving: boolean) => void;
}) {
  const [baseline, setBaseline] = useState(initialSettings);
  const [settings, setSettings] = useState(initialSettings);
  const [statusOrderText, setStatusOrderText] = useState(
    initialSettings.statusOrder.join('\n')
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBaseline(initialSettings);
    setSettings(initialSettings);
    setStatusOrderText(initialSettings.statusOrder.join('\n'));
    setSaving(false);
    setSaved(false);
    setError(null);
  }, [initialSettings]);
  useEffect(
    () => () => {
      onSavingChange(false);
    },
    [onSavingChange]
  );

  const statusOrder = statusOrderText
    .split('\n')
    .map(status => status.trim())
    .filter(Boolean);
  const candidate = { ...settings, statusOrder };
  const dirty =
    boardSettingsFingerprint(candidate) !== boardSettingsFingerprint(baseline);

  const save = async () => {
    if (saving || !dirty) return;
    setSaved(false);
    setError(null);
    const parsed = projectBoardSettingsSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? 'Check the board settings and retry.'
      );
      return;
    }

    setSaving(true);
    onSavingChange(true);
    try {
      const result = await onSave(parsed.data);
      setBaseline(result);
      setSettings(result);
      setStatusOrderText(result.statusOrder.join('\n'));
      setSaved(true);
    } catch (nextError) {
      setError(describeError(nextError));
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  };

  return (
    <form
      className="tb-settings-card space-y-5 rounded-lg border p-4 @lg:p-5"
      onSubmit={event => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Board preferences</h3>
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Choose the filters shown for this project, its default layout, and
          the workflow order shared by List and Kanban.
        </p>
      </div>

      <fieldset disabled={saving} className="space-y-2">
        <legend className="text-xs font-medium">Default layout</legend>
        <div className="grid gap-2 @sm:grid-cols-2">
          {(['list', 'kanban'] as const).map(view => (
            <label
              key={view}
              data-selected={settings.defaultView === view ? 'true' : 'false'}
              className="tb-source-option flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3"
            >
              <input
                type="radio"
                name="default-board-layout"
                value={view}
                checked={settings.defaultView === view}
                className="sr-only"
                onChange={() => {
                  setSettings(current => ({ ...current, defaultView: view }));
                  setSaved(false);
                }}
              />
              <Icon
                name={view === 'list' ? 'ListView' : 'Columns2'}
                className="size-4 text-muted-foreground"
              />
              <span className="text-sm font-medium">
                {view === 'list' ? 'List' : 'Kanban'}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={saving} className="space-y-2">
        <legend className="text-xs font-medium">Visible filters</legend>
        <div className="grid gap-2 @lg:grid-cols-2">
          {BOARD_FILTER_OPTIONS.map(option => (
            <label
              key={option.field}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-3"
            >
              <input
                type="checkbox"
                checked={settings.enabledFilters.includes(option.field)}
                className="mt-0.5 size-4 accent-primary"
                onChange={event => {
                  setSettings(current => ({
                    ...current,
                    enabledFilters: toggled(
                      current.enabledFilters,
                      option.field,
                      event.target.checked
                    )
                  }));
                  setSaved(false);
                }}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon
                    name={option.icon}
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span>{option.label}</span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1.5 text-xs font-medium">
        Workflow status order
        <Textarea
          aria-label="Workflow status order"
          value={statusOrderText}
          disabled={saving}
          className="tb-field min-h-40 font-mono text-xs"
          onChange={event => {
            setStatusOrderText(event.target.value);
            setSaved(false);
          }}
        />
        <span className="block font-normal leading-relaxed text-muted-foreground">
          Enter one exact status name per line. Provider-specific statuses not
          listed here stay near their broad workflow group.
        </span>
      </label>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        {error ? (
          <p role="alert" className="mr-auto max-w-xl text-sm text-destructive">
            {error}
          </p>
        ) : saved ? (
          <span role="status" className="mr-auto text-sm text-success">
            Board preferences saved
          </span>
        ) : dirty ? (
          <span className="mr-auto text-xs text-muted-foreground">
            Unsaved board changes
          </span>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => {
            const defaults = defaultProjectBoardSettings(settings.projectId);
            setSettings(defaults);
            setStatusOrderText(defaults.statusOrder.join('\n'));
            setSaved(false);
            setError(null);
          }}
        >
          Reset defaults
        </Button>
        <Button type="submit" size="sm" disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save board preferences'}
        </Button>
      </div>
    </form>
  );
}

function FilterPresetsForm({ projectId }: { projectId: string }) {
  const rpc = useRpc<TaskboardRpcContract>();
  const presetState = useProjectFilterPresets(projectId);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [mutating, setMutating] = useState(false);
  const [mutationFeedback, setMutationFeedback] = useState<{
    kind: 'error' | 'status';
    message: string;
    presetId?: string;
  } | null>(null);
  const mutationInFlightRef = useRef(false);
  const authoritativeNamesRef = useRef(new Map<string, string>());
  const presetNameInputRefs = useRef(new Map<string, HTMLInputElement>());
  const presetActionButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mutationFeedbackId = useId();

  const restorePresetFocus = (
    presetId: string,
    action?: 'move-up' | 'move-down' | 'delete'
  ) => {
    window.requestAnimationFrame(() => {
      const actionButton = action
        ? presetActionButtonRefs.current.get(`${presetId}:${action}`)
        : undefined;
      if (actionButton && !actionButton.disabled) {
        actionButton.focus();
        return;
      }
      presetNameInputRefs.current.get(presetId)?.focus();
    });
  };

  useEffect(() => {
    const previousNames = authoritativeNamesRef.current;
    const nextNames = new Map(
      presetState.presets.map(preset => [preset.id, preset.name])
    );
    setNameDrafts(current =>
      Object.fromEntries(
        presetState.presets.map(preset => {
          const previousName = previousNames.get(preset.id);
          const currentDraft = current[preset.id];
          const dirty =
            previousName !== undefined &&
            currentDraft !== undefined &&
            currentDraft !== previousName;
          return [preset.id, dirty ? currentDraft : preset.name];
        })
      )
    );
    authoritativeNamesRef.current = nextNames;
  }, [presetState.presets]);

  const beginMutation = () => {
    if (mutationInFlightRef.current) return false;
    mutationInFlightRef.current = true;
    setMutating(true);
    setMutationFeedback(null);
    return true;
  };
  const finishMutation = () => {
    mutationInFlightRef.current = false;
    setMutating(false);
  };
  const reportMutationError = (
    nextError: unknown,
    options: { presetId?: string; action: string }
  ) => {
    const message = describeError(nextError);
    setMutationFeedback({
      kind: 'error',
      message: `${options.action}: ${message}`,
      ...(options.presetId ? { presetId: options.presetId } : {})
    });
    toast.error(message);
  };

  const renamePreset = async (preset: FilterPreset) => {
    const name = (nameDrafts[preset.id] ?? preset.name).trim();
    if (name === preset.name) {
      setNameDrafts(current => ({ ...current, [preset.id]: preset.name }));
      return;
    }
    if (!name) {
      setMutationFeedback({
        kind: 'error',
        presetId: preset.id,
        message: `Rename "${preset.name}": preset names cannot be empty.`
      });
      return;
    }
    if (!beginMutation()) return;
    try {
      const result = await rpc.call('saveFilterPreset', {
        projectId,
        id: preset.id,
        name,
        state: preset.state
      });
      presetState.setAuthoritative(result.presets);
      setMutationFeedback({
        kind: 'status',
        message: `Renamed preset to "${result.preset.name}".`
      });
      restorePresetFocus(preset.id);
    } catch (nextError) {
      reportMutationError(nextError, {
        presetId: preset.id,
        action: `Could not rename "${preset.name}"`
      });
      restorePresetFocus(preset.id);
    } finally {
      finishMutation();
    }
  };

  const removePreset = async (preset: FilterPreset) => {
    if (mutationInFlightRef.current) return;
    if (!window.confirm(`Delete the preset "${preset.name}"?`)) return;
    if (!beginMutation()) return;
    const deletedIndex = presetState.presets.findIndex(
      candidate => candidate.id === preset.id
    );
    try {
      const result = await rpc.call('deleteFilterPreset', {
        projectId,
        id: preset.id
      });
      presetState.setAuthoritative(result.presets);
      setMutationFeedback({
        kind: 'status',
        message: `Deleted preset "${preset.name}".`
      });
      const focusTarget =
        result.presets[
          Math.min(Math.max(deletedIndex, 0), result.presets.length - 1)
        ];
      window.requestAnimationFrame(() => {
        const input = focusTarget
          ? presetNameInputRefs.current.get(focusTarget.id)
          : undefined;
        (input ?? headingRef.current)?.focus();
      });
    } catch (nextError) {
      reportMutationError(nextError, {
        action: `Could not delete "${preset.name}"`
      });
      restorePresetFocus(preset.id, 'delete');
    } finally {
      finishMutation();
    }
  };

  const movePreset = async (preset: FilterPreset, delta: number) => {
    if (mutationInFlightRef.current) return;
    const ids = presetState.presets.map(candidate => candidate.id);
    const from = ids.indexOf(preset.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length || !beginMutation()) return;
    const reordered = [...ids];
    const [moved] = reordered.splice(from, 1);
    if (!moved) {
      finishMutation();
      return;
    }
    reordered.splice(to, 0, moved);
    try {
      const result = await rpc.call('reorderFilterPresets', {
        projectId,
        ids: reordered
      });
      presetState.setAuthoritative(result.presets);
      setMutationFeedback({
        kind: 'status',
        message: `Moved preset "${preset.name}" ${delta < 0 ? 'up' : 'down'}.`
      });
      restorePresetFocus(preset.id, delta < 0 ? 'move-up' : 'move-down');
    } catch (nextError) {
      reportMutationError(nextError, {
        action: `Could not move "${preset.name}"`
      });
      restorePresetFocus(preset.id, delta < 0 ? 'move-up' : 'move-down');
    } finally {
      finishMutation();
    }
  };

  return (
    <div className="tb-settings-card space-y-3 rounded-lg border p-4 @lg:p-5">
      <div className="space-y-1">
        <h3 ref={headingRef} tabIndex={-1} className="text-sm font-semibold">
          Filter presets
        </h3>
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Rename, reorder, or delete this project&apos;s saved views.
        </p>
      </div>
      {presetState.loading ? (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="space-y-2"
        >
          <span className="sr-only">Loading filter presets</span>
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-4/5" />
        </div>
      ) : presetState.error ? (
        <div className="rounded-md border border-destructive/30 p-3">
          <p role="alert" className="text-xs text-destructive">
            Could not load presets: {presetState.error}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void presetState.reload()}
          >
            Try again
          </Button>
        </div>
      ) : presetState.presets.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Save a preset from the Presets menu on this project&apos;s board.
        </p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2">
          {presetState.presets.map((preset, index) => (
            <li
              key={preset.id}
              className="flex min-w-0 flex-col gap-1.5 @sm:flex-row @sm:items-center @sm:gap-2"
            >
              <Input
                ref={element => {
                  if (element) {
                    presetNameInputRefs.current.set(preset.id, element);
                  } else {
                    presetNameInputRefs.current.delete(preset.id);
                  }
                }}
                value={nameDrafts[preset.id] ?? preset.name}
                maxLength={FILTER_PRESET_NAME_MAX_LENGTH}
                disabled={mutating}
                aria-label={`Preset name for ${preset.name}`}
                aria-invalid={
                  mutationFeedback?.kind === 'error' &&
                  mutationFeedback.presetId === preset.id
                }
                aria-describedby={
                  mutationFeedback?.kind === 'error' &&
                  mutationFeedback.presetId === preset.id
                    ? mutationFeedbackId
                    : undefined
                }
                className="h-8 min-w-0 w-full text-xs max-md:pointer-coarse:h-10 @sm:flex-1"
                onChange={event => {
                  const name = event.target.value;
                  setNameDrafts(current => ({
                    ...current,
                    [preset.id]: name
                  }));
                  if (
                    mutationFeedback?.kind === 'error' &&
                    mutationFeedback.presetId === preset.id
                  ) {
                    setMutationFeedback(null);
                  }
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void renamePreset(preset);
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setNameDrafts(current => ({
                      ...current,
                      [preset.id]: preset.name
                    }));
                    if (mutationFeedback?.presetId === preset.id) {
                      setMutationFeedback(null);
                    }
                  }
                }}
              />
              <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-1 @sm:w-auto @sm:shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 max-md:pointer-coarse:h-10 max-md:pointer-coarse:w-10"
                  disabled={
                    mutating ||
                    (nameDrafts[preset.id] ?? preset.name) === preset.name
                  }
                  aria-label={`Save name for ${preset.name}`}
                  onClick={() => void renamePreset(preset)}
                >
                  <Icon name="Check" className="size-3" />
                </Button>
                <Button
                  ref={element => {
                    const key = `${preset.id}:move-up`;
                    if (element) {
                      presetActionButtonRefs.current.set(key, element);
                    } else {
                      presetActionButtonRefs.current.delete(key);
                    }
                  }}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 max-md:pointer-coarse:h-10 max-md:pointer-coarse:w-10"
                  disabled={mutating || index === 0}
                  aria-label={`Move ${preset.name} up`}
                  onClick={() => void movePreset(preset, -1)}
                >
                  <Icon name="ChevronUp" className="size-3" />
                </Button>
                <Button
                  ref={element => {
                    const key = `${preset.id}:move-down`;
                    if (element) {
                      presetActionButtonRefs.current.set(key, element);
                    } else {
                      presetActionButtonRefs.current.delete(key);
                    }
                  }}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 max-md:pointer-coarse:h-10 max-md:pointer-coarse:w-10"
                  disabled={
                    mutating || index === presetState.presets.length - 1
                  }
                  aria-label={`Move ${preset.name} down`}
                  onClick={() => void movePreset(preset, 1)}
                >
                  <Icon name="ChevronDown" className="size-3" />
                </Button>
                <Button
                  ref={element => {
                    const key = `${preset.id}:delete`;
                    if (element) {
                      presetActionButtonRefs.current.set(key, element);
                    } else {
                      presetActionButtonRefs.current.delete(key);
                    }
                  }}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 max-md:pointer-coarse:h-10 max-md:pointer-coarse:w-10"
                  disabled={mutating}
                  aria-label={`Delete ${preset.name}`}
                  onClick={() => void removePreset(preset)}
                >
                  <Icon name="Trash2" className="size-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {presetState.refreshError && !presetState.error ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
          <p role="alert" className="min-w-0 flex-1 text-xs text-muted-foreground">
            Could not refresh presets. Keeping your loaded presets and edits.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-md:pointer-coarse:h-10"
            onClick={() => void presetState.reload({ background: true })}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {mutationFeedback?.kind === 'error' ? (
        <p
          id={mutationFeedbackId}
          role="alert"
          className="text-xs text-destructive"
        >
          {mutationFeedback.message}
        </p>
      ) : mutating ? (
        <p role="status" className="text-xs text-muted-foreground">
          Updating presets…
        </p>
      ) : mutationFeedback?.kind === 'status' ? (
        <p role="status" className="text-xs text-muted-foreground">
          {mutationFeedback.message}
        </p>
      ) : null}
    </div>
  );
}

function ManageView({
  projectId,
  projects,
  isLoadingProjects,
  onProjectChange
}: {
  projectId: string | null;
  projects: readonly TrackerProject[] | undefined;
  isLoadingProjects: boolean;
  onProjectChange: (projectId: string) => void;
}) {
  const rpc = useRpc<TaskboardRpcContract>();
  const [config, setConfig] = useState<ProjectConfigView | null>(null);
  const [boardSettings, setBoardSettings] =
    useState<ProjectBoardSettings | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingBoardSettings, setSavingBoardSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);

  useEffect(() => {
    setConfig(null);
    setBoardSettings(null);
    setError(null);
    if (!projectId) return;
    let cancelled = false;
    setLoadingConfig(true);
    void Promise.all([
      rpc.call('getProjectConfig', { projectId }),
      rpc.call('getProjectBoardSettings', { projectId })
    ])
      .then(([configResult, settingsResult]) => {
        if (cancelled) return;
        setConfig(configResult.config);
        setBoardSettings(settingsResult.settings);
      })
      .catch((nextError: unknown) => {
        if (!cancelled) setError(describeError(nextError));
      })
      .finally(() => {
        if (!cancelled) setLoadingConfig(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadRevision, projectId, rpc]);

  return (
    <div className="h-full overflow-y-auto p-3 @container">
      <div className="mx-auto w-full max-w-4xl space-y-4 pb-8">
        <header className="tb-manage-hero flex flex-col gap-3 rounded-lg border px-4 py-4 @lg:flex-row @lg:items-end @lg:justify-between @lg:px-5">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Project settings
            </p>
            <h2 className="text-lg font-semibold">Project setup</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Configure this project&apos;s external tracker, visible filters,
              default layout, and workflow order. Secret values are write-only
              and never loaded back here.
            </p>
          </div>
          {projects && projects.length > 0 ? (
            <Select
              value={projectId ?? undefined}
              disabled={savingConfig || savingBoardSettings}
              onValueChange={onProjectChange}
            >
              <SelectTrigger
                aria-label="BB project"
                className="tb-field h-9 w-64 max-w-full"
              >
                <SelectValue placeholder="Choose a BB project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map(project => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </header>

        {isLoadingProjects || projects === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : projects.length === 0 || projectId === null ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <Icon name="Folder" className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">No BB projects found</p>
            <p className="text-sm text-muted-foreground">
              Create a BB project before configuring its external tracker.
            </p>
          </div>
        ) : loadingConfig ||
          (config !== null && config.projectId !== projectId) ||
          (boardSettings !== null && boardSettings.projectId !== projectId) ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : config && boardSettings ? (
          <>
            <ProjectConfigForm
              key={`connection:${config.projectId}`}
              initialConfig={config}
              onSavingChange={setSavingConfig}
              onSave={async mutation => {
                const result = await rpc.call('saveProjectConfig', mutation);
                return result.config;
              }}
            />
            <ProjectBoardSettingsForm
              key={`board:${boardSettings.projectId}`}
              initialSettings={boardSettings}
              onSavingChange={setSavingBoardSettings}
              onSave={async settings => {
                const result = await rpc.call(
                  'saveProjectBoardSettings',
                  settings
                );
                setBoardSettings(result.settings);
                return result.settings;
              }}
            />
            <FilterPresetsForm
              key={`presets:${boardSettings.projectId}`}
              projectId={boardSettings.projectId}
            />
          </>
        ) : (
          <div className="rounded-xl border border-destructive/30 bg-card p-5">
            <p role="alert" className="text-sm text-destructive">
              {error ?? 'Could not load this project connection.'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setLoadRevision(revision => revision + 1)}
            >
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskboardPanel({ subPath }: PluginNavPanelProps) {
  const route = parseTrackerRoute(subPath);
  const rpc = useRpc<TaskboardRpcContract>();
  const navigate = useBbNavigate();
  const {
    projectId: contextProjectId,
    threadId: contextThreadId
  } = useBbContext();
  const [sourceProjectContext] = useState(loadSourceProjectContext);
  const selectionContextProjectId = contextThreadId
    ? contextProjectId
    : (sourceProjectContext?.projectId ?? contextProjectId);
  const selectionContextThreadId =
    contextThreadId ?? sourceProjectContext?.threadId ?? null;
  const rootRef = useRef<HTMLDivElement>(null);
  const [projects, setProjects] = useState<TrackerProject[] | undefined>();
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] =
    useState(loadSidebarCollapsed);
  const [narrow, setNarrow] = useState(false);
  const [narrowOverride, setNarrowOverride] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const projectsRequestRevisionRef = useRef(0);
  const handledContextSelectionRef = useRef<string | null>(null);
  const lastBrowseRouteRef = useRef<Extract<
    TrackerRoute,
    { kind: 'all' | 'project' }
  > | null>(null);
  const contextTargetProjectId = useMemo(
    () => availableContextProjectId(projects, selectionContextProjectId),
    [projects, selectionContextProjectId]
  );
  const preferredProjectId = useMemo(() => {
    if (!projects || projects.length === 0) return null;
    if (contextTargetProjectId) return contextTargetProjectId;
    const lastProjectId = loadLastProjectId();
    if (
      lastProjectId &&
      projects.some(project => project.id === lastProjectId)
    ) {
      return lastProjectId;
    }
    return projects[0]?.id ?? null;
  }, [contextTargetProjectId, projects]);

  const loadProjects = useCallback(async () => {
    const requestRevision = ++projectsRequestRevisionRef.current;
    setProjectsError(null);
    try {
      const result = await rpc.call('listProjects', null);
      if (requestRevision !== projectsRequestRevisionRef.current) return null;
      setProjects(result.projects);
      return result.projects;
    } catch (nextError) {
      if (requestRevision !== projectsRequestRevisionRef.current) return null;
      setProjects([]);
      setProjectsError(describeError(nextError));
      return null;
    }
  }, [rpc]);
  useEffect(() => {
    void loadProjects();
    return () => {
      projectsRequestRevisionRef.current += 1;
    };
  }, [loadProjects]);
  useRefreshOnReconnect(() => void loadProjects());

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const width = root.clientWidth;
      setNarrow(width > 0 && width < SIDEBAR_AUTO_COLLAPSE_WIDTH);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setNarrowOverride(null);
  }, [narrow]);
  useEffect(() => {
    if (route.kind === 'all' || route.kind === 'project') {
      lastBrowseRouteRef.current = route;
      if (route.kind === 'project') storeLastProjectId(route.projectId);
    }
  }, [subPath]);
  useEffect(() => {
    if (projects === undefined || !shouldApplyContextProject(route)) return;
    const token = contextSelectionToken(
      selectionContextThreadId,
      selectionContextProjectId,
      contextTargetProjectId
    );
    if (handledContextSelectionRef.current === token) return;
    handledContextSelectionRef.current = token;
    if (contextTargetProjectId === null) return;

    storeLastProjectId(contextTargetProjectId);

    const nextRoute: TrackerRoute =
      route.kind === 'manage'
        ? { kind: 'manage', projectId: contextTargetProjectId }
        : { kind: 'project', projectId: contextTargetProjectId };
    navigate.toPluginPanel(PANEL_PATH, {
      subPath: routeToSubPath(nextRoute),
      replace: true
    });
  }, [
    contextTargetProjectId,
    navigate,
    projects,
    selectionContextProjectId,
    selectionContextThreadId,
    subPath
  ]);
  useEffect(() => {
    if (
      route.kind !== 'root' ||
      contextTargetProjectId !== null ||
      preferredProjectId === null
    ) {
      return;
    }
    storeLastProjectId(preferredProjectId);
    navigate.toPluginPanel(PANEL_PATH, {
      subPath: routeToSubPath({
        kind: 'project',
        projectId: preferredProjectId
      }),
      replace: true
    });
  }, [
    contextTargetProjectId,
    navigate,
    preferredProjectId,
    route.kind
  ]);
  useEffect(() => {
    if (
      route.kind !== 'manage' ||
      route.projectId !== null ||
      contextTargetProjectId !== null ||
      preferredProjectId === null
    ) {
      return;
    }
    navigate.toPluginPanel(PANEL_PATH, {
      subPath: routeToSubPath({
        kind: 'manage',
        projectId: preferredProjectId
      }),
      replace: true
    });
  }, [
    contextTargetProjectId,
    navigate,
    preferredProjectId,
    route.kind,
    subPath
  ]);

  const effectiveSidebarCollapsed = narrow
    ? (narrowOverride ?? true)
    : sidebarCollapsed;
  const sidebarOverlay = narrow && !effectiveSidebarCollapsed;

  const toggleSidebar = () => {
    const next = !effectiveSidebarCollapsed;
    if (narrow) setNarrowOverride(next);
    setSidebarCollapsed(next);
    storeSidebarCollapsed(next);
  };
  const go = (nextRoute: TrackerRoute) => {
    if (sidebarOverlay) setNarrowOverride(null);
    navigate.toPluginPanel(PANEL_PATH, { subPath: routeToSubPath(nextRoute) });
  };
  const backFromItem = () => {
    if (route.kind !== 'item') return;
    go(
      lastBrowseRouteRef.current ?? {
        kind: 'project',
        projectId: route.projectId
      }
    );
  };
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const latestProjects = await loadProjects();
      const projectIds =
        route.kind === 'project' || route.kind === 'item'
          ? [route.projectId]
          : route.kind === 'root' && preferredProjectId
            ? [preferredProjectId]
            : (latestProjects ?? projects ?? []).map(project => project.id);
      await Promise.all(
        projectIds.map(projectId => rpc.call('refresh', { projectId }))
      );
      setRefreshGeneration(generation => generation + 1);
    } catch (nextError) {
      setRefreshError(describeError(nextError));
    } finally {
      setRefreshing(false);
    }
  };

  const sidebar = (
    <TrackerSidebar
      route={route}
      projects={projects}
      isLoading={projects === undefined}
      preferredProjectId={preferredProjectId}
      overlay={sidebarOverlay}
      onNavigate={go}
    />
  );

  let outlet: ReactNode;
  if (route.kind === 'root' && preferredProjectId === null) {
    outlet =
      projects === undefined ? (
        <div className="h-full bg-surface-recessed-solid p-3">
          <div className="mx-auto h-full max-w-[100rem] rounded-xl border border-border bg-card p-4">
            <LoadingRows />
          </div>
        </div>
      ) : (
        <EmptyState filtered={false} onClear={() => undefined} />
      );
  } else if (route.kind === 'manage') {
    outlet = (
      <ManageView
        projectId={route.projectId ?? preferredProjectId}
        projects={projects}
        isLoadingProjects={projects === undefined}
        onProjectChange={projectId => go({ kind: 'manage', projectId })}
      />
    );
  } else if (route.kind === 'item') {
    outlet = (
      <TrackerDetail route={route} refreshGeneration={refreshGeneration} />
    );
  } else {
    const projectId =
      route.kind === 'project'
        ? route.projectId
        : route.kind === 'root'
          ? preferredProjectId
          : null;
    outlet = (
      <TrackerList
        key={projectId ?? 'all'}
        projectId={projectId}
        projects={projects}
        refreshGeneration={refreshGeneration}
        surfaceMode={narrow ? 'constrained' : 'full'}
        onOpen={item =>
          go({
            kind: 'item',
            projectId: item.bbProjectId,
            source: item.source,
            locator: item.locator
          })
        }
      />
    );
  }

  return (
    <div
      ref={rootRef}
      className="tb-linear relative flex h-full min-h-0 flex-row-reverse text-foreground"
    >
      {!effectiveSidebarCollapsed ? (
        sidebarOverlay ? (
          <SidebarDrawer onClose={toggleSidebar}>{sidebar}</SidebarDrawer>
        ) : (
          sidebar
        )
      ) : null}
      <main className="@container flex min-w-0 flex-1 flex-col">
        <TrackerTopbar
          route={route}
          projects={projects}
          sidebarCollapsed={effectiveSidebarCollapsed}
          refreshing={refreshing}
          refreshDisabled={
            route.kind === 'manage' ||
            (route.kind === 'all' && projects === undefined)
          }
          onNavigate={go}
          onBack={backFromItem}
          onRefresh={() => void refresh()}
          onToggleSidebar={toggleSidebar}
        />
        {projectsError ? (
          <p
            role="alert"
            className="shrink-0 border-b border-border-hairline px-3.5 py-1.5 text-xs text-destructive"
          >
            {projectsError}
          </p>
        ) : null}
        {refreshError ? (
          <p
            role="alert"
            className="shrink-0 border-b border-border-hairline px-3.5 py-1.5 text-xs text-destructive"
          >
            {refreshError}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-auto">{outlet}</div>
      </main>
    </div>
  );
}

function TaskboardRightPanel({
  projectId
}: {
  projectId: string | null | undefined;
}) {
  const rpc = useRpc<TaskboardRpcContract>();
  const navigate = useBbNavigate();
  const [itemRoute, setItemRoute] = useState<Extract<
    TrackerRoute,
    { kind: 'item' }
  > | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const [pinned, setPinned] = useState(loadRightPanelPinned);

  useEffect(() => {
    setItemRoute(null);
    setRefreshError(null);
  }, [projectId]);
  useEffect(() => {
    const syncPinned = () => setPinned(loadRightPanelPinned());
    const syncStoredPin = (event: StorageEvent) => {
      if (event.key === RIGHT_PANEL_PINNED_STORAGE_KEY) syncPinned();
    };
    window.addEventListener(RIGHT_PANEL_PIN_EVENT, syncPinned);
    window.addEventListener('storage', syncStoredPin);
    return () => {
      window.removeEventListener(RIGHT_PANEL_PIN_EVENT, syncPinned);
      window.removeEventListener('storage', syncStoredPin);
    };
  }, []);

  const refresh = async () => {
    if (!projectId || refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await rpc.call('refresh', { projectId });
      setRefreshGeneration(generation => generation + 1);
    } catch (nextError) {
      setRefreshError(describeError(nextError));
    } finally {
      setRefreshing(false);
    }
  };

  const activeItemRoute =
    projectId && itemRoute?.projectId === projectId ? itemRoute : null;
  const fullRoute: TrackerRoute =
    activeItemRoute ??
    (projectId
      ? { kind: 'project', projectId }
      : { kind: 'root' });

  return (
    <TooltipProvider delayDuration={250}>
      <div
        data-taskboard-right-panel
        className="tb-linear flex h-full min-h-0 flex-col text-foreground"
      >
        <header className="tb-topbar flex h-11 shrink-0 items-center gap-2 border-b px-2.5">
          {activeItemRoute ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Back to Taskboard issues"
              onClick={() => setItemRoute(null)}
            >
              <Icon name="ChevronLeft" className="size-4" />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">
              {activeItemRoute ? activeItemRoute.locator : 'Taskboard'}
            </p>
            <p className="truncate text-2xs text-muted-foreground">
              {projectId === undefined
                ? 'Loading thread project…'
                : projectId
                ? pinned
                  ? 'Pinned across chats'
                  : 'Open beside this chat'
                : 'Choose a BB project'}
            </p>
          </div>
          {!activeItemRoute ? (
            <DirectCreateIssueAction
              projectId={projectId ?? null}
              variant="icon"
            />
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={
                  pinned
                    ? 'Unpin Taskboard from the right panel'
                    : 'Keep Taskboard pinned across chats'
                }
                aria-pressed={pinned}
                onClick={() => storeRightPanelPinned(!pinned)}
              >
                <Icon
                  name={pinned ? 'Pin' : 'PinOff'}
                  className="size-3.5"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {pinned ? 'Stop reopening across chats' : 'Keep open across chats'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Refresh Taskboard"
                disabled={!projectId || refreshing}
                onClick={() => void refresh()}
              >
                <Icon
                  name="RotateCcw"
                  className={cn('size-3.5', refreshing && 'animate-spin')}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh Taskboard</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Open full Taskboard"
                onClick={() =>
                  navigate.toPluginPanel(PANEL_PATH, {
                    subPath: routeToSubPath(fullRoute)
                  })
                }
              >
                <Icon name="Maximize2" className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open full Taskboard</TooltipContent>
          </Tooltip>
        </header>
        {refreshError ? (
          <p
            role="alert"
            className="shrink-0 border-b border-border-hairline px-3 py-1.5 text-xs text-destructive"
          >
            {refreshError}
          </p>
        ) : null}
        <div
          className={cn(
            'min-h-0 flex-1',
            activeItemRoute ? 'overflow-y-auto' : 'overflow-hidden'
          )}
        >
          {projectId === undefined ? (
            <LoadingRows />
          ) : projectId === null ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <Icon name="Folder" className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">Choose a project</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Select a BB project in the composer to load its Taskboard here.
              </p>
            </div>
          ) : activeItemRoute ? (
            <TrackerDetail
              route={activeItemRoute}
              refreshGeneration={refreshGeneration}
            />
          ) : (
            <TrackerList
              key={projectId}
              projectId={projectId}
              projects={undefined}
              refreshGeneration={refreshGeneration}
              surfaceMode="constrained"
              onOpen={item =>
                setItemRoute({
                  kind: 'item',
                  projectId: item.bbProjectId,
                  source: item.source,
                  locator: item.locator
                })
              }
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function TaskboardThreadPanel({ threadId }: PluginThreadPanelProps) {
  const rpc = useRpc<TaskboardRpcContract>();
  const { projectId: contextProjectId, threadId: contextThreadId } =
    useBbContext();
  const fallbackProjectId =
    contextThreadId === threadId ? contextProjectId : null;
  const [projectId, setProjectId] = useState<string | null | undefined>();

  useEffect(() => {
    let cancelled = false;
    setProjectId(undefined);
    void rpc
      .call('threadProject', { threadId })
      .then(result => {
        if (!cancelled) setProjectId(result.projectId);
      })
      .catch(nextError => {
        if (cancelled) return;
        setProjectId(fallbackProjectId);
        toast.error('Could not resolve this thread’s Taskboard project.', {
          description: describeError(nextError)
        });
      });
    return () => {
      cancelled = true;
    };
  }, [fallbackProjectId, rpc, threadId]);

  return <TaskboardRightPanel projectId={projectId} />;
}

function TaskboardNewThreadPanel({ projectId }: PluginNewThreadPanelProps) {
  return <TaskboardRightPanel projectId={projectId} />;
}

function TaskboardThreadHeaderAction({
  threadId
}: PluginThreadHeaderActionProps) {
  const { openThreadPanel } = useBbNavigate();
  const autoOpenedThreadRef = useRef<string | null>(null);
  const openTaskboard = useCallback(
    (showError: boolean) => {
      const opened = openThreadPanel({
        actionId: THREAD_PANEL_ACTION_ID,
        title: 'Taskboard'
      });
      if (!opened && showError) {
        toast.error('Taskboard cannot open beside this thread.');
      }
      return opened;
    },
    [openThreadPanel]
  );

  useEffect(() => {
    if (
      !loadRightPanelPinned() ||
      autoOpenedThreadRef.current === threadId
    ) {
      return;
    }
    autoOpenedThreadRef.current = threadId;
    const timeout = window.setTimeout(() => openTaskboard(false), 0);
    return () => window.clearTimeout(timeout);
  }, [openTaskboard, threadId]);

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Pin Taskboard on the right"
            onClick={() => {
              storeRightPanelPinned(true);
              openTaskboard(true);
            }}
          >
            <Icon name="Ticket" className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Pin Taskboard on the right</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ProjectCredentialsInteractionForm({
  interaction,
  submit,
  cancel
}: PluginPendingInteractionProps) {
  const parsed = useMemo(
    () =>
      projectCredentialsInteractionPayloadSchema.safeParse(interaction.payload),
    [interaction.payload]
  );
  const [linearDraft, setLinearDraft] = useState('');
  const [jiraDraft, setJiraDraft] = useState('');
  const [removeLinear, setRemoveLinear] = useState(false);
  const [removeJira, setRemoveJira] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const interactionIdRef = useRef(interaction.id);
  interactionIdRef.current = interaction.id;

  useEffect(() => {
    setLinearDraft('');
    setJiraDraft('');
    setRemoveLinear(false);
    setRemoveJira(false);
    setBusy(false);
    setError(null);
  }, [interaction.id]);

  if (!parsed.success) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-muted-foreground">
          This project credential request is invalid.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void cancel().catch(() => undefined)}
        >
          Cancel
        </Button>
      </div>
    );
  }
  const payload = parsed.data;
  const hasChanges =
    linearDraft.trim() !== '' ||
    jiraDraft.trim() !== '' ||
    removeLinear ||
    removeJira;
  const submitCredentials = async () => {
    const submittedInteractionId = interaction.id;
    const response: ProjectCredentialsInteractionResponse = {
      linearCredential: secretMutation(linearDraft, removeLinear),
      jiraCredential: secretMutation(jiraDraft, removeJira)
    };
    const validated =
      projectCredentialsInteractionResponseSchema.safeParse(response);
    if (!validated.success || !hasChanges) {
      setError('Enter or remove at least one project credential.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await submit(validated.data);
      if (interactionIdRef.current !== submittedInteractionId) return;
      setLinearDraft('');
      setJiraDraft('');
      setRemoveLinear(false);
      setRemoveJira(false);
    } catch {
      // The host renders submission failures outside the plugin form.
    } finally {
      if (interactionIdRef.current === submittedInteractionId) setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={event => {
        event.preventDefault();
        void submitCredentials();
      }}
    >
      <div className="space-y-1">
        <p className="text-sm font-semibold">{payload.projectName}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Credentials entered here are write-only and isolated to this BB
          project. Existing values are never loaded into the form.
        </p>
      </div>

      <dl className="grid gap-2 rounded-lg border border-border bg-surface-recessed p-3 text-xs sm:grid-cols-3">
        {[
          ['Linear team', payload.linearTeamKey || 'Not configured'],
          ['Jira site', payload.jiraBaseUrl || 'Not configured'],
          ['Jira account', payload.jiraEmail || 'Not configured']
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 space-y-0.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate font-medium text-foreground" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor={`linear-${interaction.id}`}
              className="text-xs font-semibold"
            >
              Linear API key
            </label>
            <CredentialStatus
              configured={payload.linearCredentialConfigured}
              hasDraft={linearDraft.trim() !== ''}
              remove={removeLinear}
            />
          </div>
          <Input
            id={`linear-${interaction.id}`}
            type="password"
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={linearDraft}
            placeholder={
              payload.linearCredentialConfigured
                ? 'Enter to replace current key'
                : 'Enter project API key'
            }
            disabled={busy || removeLinear}
            onChange={event => {
              setLinearDraft(event.target.value);
              setError(null);
            }}
          />
          {payload.linearCredentialConfigured ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => {
                setRemoveLinear(value => !value);
                setLinearDraft('');
                setError(null);
              }}
            >
              {removeLinear
                ? 'Keep Linear credential'
                : 'Remove Linear credential'}
            </Button>
          ) : null}
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor={`jira-${interaction.id}`}
              className="text-xs font-semibold"
            >
              Jira API token
            </label>
            <CredentialStatus
              configured={payload.jiraCredentialConfigured}
              hasDraft={jiraDraft.trim() !== ''}
              remove={removeJira}
            />
          </div>
          <Input
            id={`jira-${interaction.id}`}
            type="password"
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={jiraDraft}
            placeholder={
              payload.jiraCredentialConfigured
                ? 'Enter to replace current token'
                : 'Enter project API token'
            }
            disabled={busy || removeJira}
            onChange={event => {
              setJiraDraft(event.target.value);
              setError(null);
            }}
          />
          {payload.jiraCredentialConfigured ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => {
                setRemoveJira(value => !value);
                setJiraDraft('');
                setError(null);
              }}
            >
              {removeJira ? 'Keep Jira credential' : 'Remove Jira credential'}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 border-t border-border-hairline pt-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void cancel().catch(() => undefined)}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy || !hasChanges}>
          {busy ? 'Saving…' : 'Save credentials'}
        </Button>
      </div>
    </form>
  );
}

function ProjectCredentialsInteraction(props: PluginPendingInteractionProps) {
  return (
    <ProjectCredentialsInteractionForm key={props.interaction.id} {...props} />
  );
}

function TaskboardSettingsInfo() {
  const navigate = useBbNavigate();
  const { projectId } = useBbContext();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Each BB project has its own tracker connection, filter set, default
        layout, and workflow status order.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          navigate.toPluginPanel(PANEL_PATH, {
            subPath: projectId
              ? routeToSubPath({ kind: 'manage', projectId })
              : 'manage'
          })
        }
      >
        <Icon name="Settings" className="size-4" />
        Open Taskboard project settings
      </Button>
    </div>
  );
}

export default definePluginApp(app => {
  app.composer.customize({
    id: 'create-taskboard-issue',
    scopes: ['thread', 'new-thread'],
    actions: [
      { id: 'create-issue', component: ComposerCreateIssueAction }
    ]
  });
  app.slots.threadPanelAction({
    id: THREAD_PANEL_ACTION_ID,
    title: 'Taskboard',
    icon: 'Target',
    component: TaskboardThreadPanel,
    layout: 'flush'
  });
  app.slots.experimental_newThreadPanelAction({
    id: 'taskboard-new-thread-panel',
    title: 'Taskboard',
    icon: 'Target',
    component: TaskboardNewThreadPanel,
    layout: 'flush'
  });
  app.slots.experimental_threadHeaderAction({
    id: 'open-taskboard-panel',
    title: 'Taskboard',
    component: TaskboardThreadHeaderAction
  });
  app.slots.navPanel({
    id: 'taskboard',
    title: 'Taskboard',
    icon: 'Target',
    path: PANEL_PATH,
    component: TaskboardPanel,
    headerContent: ManageHeaderAction
  });
  app.slots.settingsSection({
    id: 'connections',
    title: 'Project settings',
    description: 'Configure each project’s tracker and board experience.',
    component: TaskboardSettingsInfo
  });
  app.slots.pendingInteraction({
    id: 'taskboard-credentials',
    component: ProjectCredentialsInteraction
  });
});
