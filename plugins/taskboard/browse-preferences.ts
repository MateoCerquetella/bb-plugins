import { z } from 'zod';
import type { TrackerView } from './board-settings.js';
import type {
  WorkSource,
  WorkStateCategory
} from './contract.js';

export const BROWSE_PREFERENCES_VERSION = 1 as const;
export const CREATE_ASSIGNEE_DEFAULT_VERSION = 1 as const;
export const ACROSS_PROJECTS_SCOPE = 'across-projects' as const;
export const MAX_BROWSE_QUERY_LENGTH = 500;

const BROWSE_STORAGE_PREFIX = 'bb-taskboard:browse-preferences:';
const CREATE_ASSIGNEE_STORAGE_PREFIX =
  'bb-taskboard:create-assignee-default:';
const ALL_SOURCES = 'all' as const;
const MAX_FILTER_VALUES = 100;
const MAX_COLLAPSE_OVERRIDES = 100;

const trackerViewPreferenceSchema = z.enum(['list', 'kanban']);
const workSourcePreferenceSchema = z.enum(['linear', 'github', 'jira', 'gitlab']);
const workStateCategoryPreferenceSchema = z.enum([
  'backlog',
  'todo',
  'in_progress',
  'done',
  'canceled'
]);
const boundedValueSchema = z.string().trim().min(1).max(500);
const sourceFilterSchema = z.union([
  z.literal(ALL_SOURCES),
  workSourcePreferenceSchema
]);
const uniqueValuesSchema = z
  .array(boundedValueSchema)
  .max(MAX_FILTER_VALUES)
  .transform(values => [...new Set(values)]);
const collapseOverridesSchema = z
  .record(boundedValueSchema, z.boolean())
  .superRefine((overrides, context) => {
    if (Object.keys(overrides).length > MAX_COLLAPSE_OVERRIDES) {
      context.addIssue({
        code: 'custom',
        message: `At most ${MAX_COLLAPSE_OVERRIDES} collapse overrides are allowed`
      });
    }
  });

export const browsePreferencesV1Schema = z
  .object({
    version: z.literal(BROWSE_PREFERENCES_VERSION),
    provider: workSourcePreferenceSchema.nullable(),
    source: sourceFilterSchema,
    view: trackerViewPreferenceSchema,
    query: z.string().max(MAX_BROWSE_QUERY_LENGTH).default(''),
    stateCategories: z
      .array(workStateCategoryPreferenceSchema)
      .max(5)
      .transform(values => [...new Set(values)]),
    statuses: uniqueValuesSchema,
    assignees: uniqueValuesSchema,
    priorities: uniqueValuesSchema,
    externalProjects: uniqueValuesSchema,
    labels: uniqueValuesSchema,
    collapsedGroups: collapseOverridesSchema
  })
  .strict();

export type BrowsePreferences = z.infer<typeof browsePreferencesV1Schema>;
export type SourceFilter = z.infer<typeof sourceFilterSchema>;
export type ProjectBrowseScope = `project:${string}`;
export type BrowsePreferenceScope =
  | typeof ACROSS_PROJECTS_SCOPE
  | ProjectBrowseScope;

export interface BrowsePreferenceSeed {
  provider?: WorkSource | null;
  source?: SourceFilter;
  view?: TrackerView;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BrowsePreferenceStoreOptions {
  storage?: PreferenceStorage | null;
  subscribeToStorage?: (
    listener: (key: string | null) => void
  ) => () => void;
}

export interface BrowsePreferenceStore {
  get(
    scope: BrowsePreferenceScope,
    seed?: BrowsePreferenceSeed
  ): BrowsePreferences;
  seed(
    scope: BrowsePreferenceScope,
    seed: BrowsePreferenceSeed
  ): BrowsePreferences;
  set(
    scope: BrowsePreferenceScope,
    preferences: BrowsePreferences
  ): BrowsePreferences;
  update(
    scope: BrowsePreferenceScope,
    update: (preferences: BrowsePreferences) => BrowsePreferences,
    seed?: BrowsePreferenceSeed
  ): BrowsePreferences;
  clearFilters(
    scope: BrowsePreferenceScope,
    seed?: BrowsePreferenceSeed
  ): BrowsePreferences;
  reconcileProvider(
    scope: ProjectBrowseScope,
    provider: WorkSource,
    seed?: BrowsePreferenceSeed
  ): BrowsePreferences;
  reset(
    scope: BrowsePreferenceScope,
    seed?: BrowsePreferenceSeed
  ): BrowsePreferences;
  subscribe(scope: BrowsePreferenceScope, listener: () => void): () => void;
  dispose(): void;
}

interface CachedPreferences {
  preferences: BrowsePreferences;
  origin: 'default' | 'stored' | 'updated';
}

const browsePreferenceScopeSchema = z.union([
  z.literal(ACROSS_PROJECTS_SCOPE),
  z.string().trim().min(9).max(520).refine(value => {
    return value.startsWith('project:') && value.length > 'project:'.length;
  })
]);

export function projectBrowseScope(projectId: string): ProjectBrowseScope {
  const normalizedProjectId = boundedValueSchema.parse(projectId);
  return `project:${normalizedProjectId}`;
}

export function browsePreferenceStorageKey(
  scope: BrowsePreferenceScope
): string {
  const parsedScope = parseBrowseScope(scope);
  return `${BROWSE_STORAGE_PREFIX}${encodeURIComponent(parsedScope)}`;
}

export function defaultBrowsePreferences(
  seed: BrowsePreferenceSeed = {}
): BrowsePreferences {
  return browsePreferencesV1Schema.parse({
    version: BROWSE_PREFERENCES_VERSION,
    provider: seed.provider ?? null,
    source: seed.source ?? ALL_SOURCES,
    view: seed.view ?? 'list',
    query: '',
    stateCategories: [],
    statuses: [],
    assignees: [],
    priorities: [],
    externalProjects: [],
    labels: [],
    collapsedGroups: {}
  });
}

export function parseBrowsePreferences(
  value: unknown,
  fallback: BrowsePreferences = defaultBrowsePreferences()
): BrowsePreferences {
  const parsed = browsePreferencesV1Schema.safeParse(value);
  return parsed.success
    ? parsed.data
    : cloneBrowsePreferences(validatedFallback(fallback));
}

export function parseBrowsePreferencesJson(
  serialized: string | null,
  fallback: BrowsePreferences = defaultBrowsePreferences()
): BrowsePreferences {
  if (serialized === null) {
    return cloneBrowsePreferences(validatedFallback(fallback));
  }
  try {
    return parseBrowsePreferences(JSON.parse(serialized), fallback);
  } catch {
    return cloneBrowsePreferences(validatedFallback(fallback));
  }
}

export function clearBrowseFilters(
  preferences: BrowsePreferences
): BrowsePreferences {
  const current = browsePreferencesV1Schema.parse(preferences);
  return {
    ...current,
    source: ALL_SOURCES,
    query: '',
    stateCategories: [],
    statuses: [],
    assignees: [],
    priorities: [],
    externalProjects: [],
    labels: []
  };
}

export function reconcileBrowseProvider(
  preferences: BrowsePreferences,
  provider: WorkSource
): BrowsePreferences {
  const current = browsePreferencesV1Schema.parse(preferences);
  const nextProvider = workSourcePreferenceSchema.parse(provider);
  if (current.provider === nextProvider) return current;
  return defaultBrowsePreferences({
    provider: nextProvider,
    view: current.view
  });
}

export function isTerminalStateCategory(
  category: WorkStateCategory
): boolean {
  return category === 'done' || category === 'canceled';
}

export function defaultGroupCollapsed(
  category: WorkStateCategory
): boolean {
  return isTerminalStateCategory(category);
}

export function isGroupCollapsed({
  overrides,
  groupKey,
  category,
  searchActive = false,
  hasSearchMatch = true
}: {
  overrides: Readonly<Record<string, boolean>>;
  groupKey: string;
  category: WorkStateCategory;
  searchActive?: boolean;
  hasSearchMatch?: boolean;
}): boolean {
  if (searchActive && hasSearchMatch) return false;
  return overrides[groupKey] ?? defaultGroupCollapsed(category);
}

export function setGroupCollapsedOverride(
  overrides: Readonly<Record<string, boolean>>,
  groupKey: string,
  category: WorkStateCategory,
  collapsed: boolean
): Record<string, boolean> {
  const parsedKey = boundedValueSchema.parse(groupKey);
  workStateCategoryPreferenceSchema.parse(category);
  const next = { ...overrides };
  if (collapsed === defaultGroupCollapsed(category)) {
    delete next[parsedKey];
  } else {
    next[parsedKey] = collapsed;
  }
  return collapseOverridesSchema.parse(next);
}

export function toggleGroupCollapsedOverride(
  overrides: Readonly<Record<string, boolean>>,
  groupKey: string,
  category: WorkStateCategory
): Record<string, boolean> {
  return setGroupCollapsedOverride(
    overrides,
    groupKey,
    category,
    !isGroupCollapsed({ overrides, groupKey, category })
  );
}

export function createBrowsePreferenceStore(
  options: BrowsePreferenceStoreOptions = {}
): BrowsePreferenceStore {
  const storage = options.storage ?? null;
  const cache = new Map<BrowsePreferenceScope, CachedPreferences>();
  const listeners = new Map<BrowsePreferenceScope, Set<() => void>>();
  let disposed = false;

  const notify = (scope: BrowsePreferenceScope) => {
    for (const listener of listeners.get(scope) ?? []) listener();
  };

  const read = (
    scope: BrowsePreferenceScope,
    seed: BrowsePreferenceSeed = {}
  ): CachedPreferences => {
    const parsedScope = parseBrowseScope(scope);
    const cached = cache.get(parsedScope);
    if (cached) return cached;
    const fallback = defaultBrowsePreferences(seed);
    const serialized = safeStorageGet(storage, browsePreferenceStorageKey(parsedScope));
    const stored = parseStoredBrowsePreferences(serialized);
    const entry: CachedPreferences = stored
      ? { preferences: stored, origin: 'stored' }
      : { preferences: fallback, origin: 'default' };
    cache.set(parsedScope, entry);
    return entry;
  };

  const set = (
    scope: BrowsePreferenceScope,
    preferences: BrowsePreferences
  ): BrowsePreferences => {
    const parsedScope = parseBrowseScope(scope);
    const next = browsePreferencesV1Schema.parse(preferences);
    const current = cache.get(parsedScope)?.preferences;
    if (current && browsePreferencesEqual(current, next)) return current;
    cache.set(parsedScope, { preferences: next, origin: 'updated' });
    safeStorageSet(
      storage,
      browsePreferenceStorageKey(parsedScope),
      JSON.stringify(next)
    );
    notify(parsedScope);
    return next;
  };

  const unsubscribeFromStorage = options.subscribeToStorage?.(key => {
    if (disposed) return;
    if (key === null) {
      const affectedScopes = new Set([
        ...cache.keys(),
        ...listeners.keys()
      ]);
      cache.clear();
      for (const scope of affectedScopes) notify(scope);
      return;
    }
    const scope = browseScopeFromStorageKey(key);
    if (!scope) return;
    cache.delete(scope);
    notify(scope);
  });

  return {
    get(scope, seed = {}) {
      return read(scope, seed).preferences;
    },
    seed(scope, seed) {
      const parsedScope = parseBrowseScope(scope);
      const current = read(parsedScope, seed);
      if (current.origin !== 'default') return current.preferences;
      const next = defaultBrowsePreferences(seed);
      if (browsePreferencesEqual(current.preferences, next)) {
        return current.preferences;
      }
      cache.set(parsedScope, { preferences: next, origin: 'default' });
      notify(parsedScope);
      return next;
    },
    set,
    update(scope, update, seed = {}) {
      return set(scope, update(read(scope, seed).preferences));
    },
    clearFilters(scope, seed = {}) {
      return set(scope, clearBrowseFilters(read(scope, seed).preferences));
    },
    reconcileProvider(scope, provider, seed = {}) {
      const current = read(scope, seed).preferences;
      const next = reconcileBrowseProvider(current, provider);
      return next === current ? current : set(scope, next);
    },
    reset(scope, seed = {}) {
      const parsedScope = parseBrowseScope(scope);
      const next = defaultBrowsePreferences(seed);
      cache.set(parsedScope, { preferences: next, origin: 'default' });
      safeStorageRemove(storage, browsePreferenceStorageKey(parsedScope));
      notify(parsedScope);
      return next;
    },
    subscribe(scope, listener) {
      const parsedScope = parseBrowseScope(scope);
      const scopedListeners = listeners.get(parsedScope) ?? new Set();
      scopedListeners.add(listener);
      listeners.set(parsedScope, scopedListeners);
      return () => {
        scopedListeners.delete(listener);
        if (scopedListeners.size === 0) listeners.delete(parsedScope);
      };
    },
    dispose() {
      disposed = true;
      unsubscribeFromStorage?.();
      listeners.clear();
      cache.clear();
    }
  };
}

export const createAssigneeScopeSchema = z
  .object({
    projectId: z.string().trim().min(1).max(500),
    provider: workSourcePreferenceSchema,
    destinationId: boundedValueSchema,
    issueType: z.string().trim().min(1).max(100).nullable()
  })
  .strict();

export type CreateAssigneeScope = z.infer<typeof createAssigneeScopeSchema>;

export const createAssigneeDefaultV1Schema = z
  .object({
    version: z.literal(CREATE_ASSIGNEE_DEFAULT_VERSION),
    assigneeId: boundedValueSchema
  })
  .strict();

export type CreateAssigneeDefault = z.infer<
  typeof createAssigneeDefaultV1Schema
>;

export function createAssigneeScope(
  projectId: string,
  provider: WorkSource,
  destinationId: string,
  issueType: string | null
): CreateAssigneeScope {
  const normalizedDestination =
    provider === 'jira'
      ? destinationId.trim().toUpperCase()
      : destinationId.trim();
  return createAssigneeScopeSchema.parse({
    projectId,
    provider,
    destinationId: normalizedDestination,
    issueType
  });
}

export function createAssigneeStorageKey(
  scope: CreateAssigneeScope
): string {
  const parsed = createAssigneeScopeSchema.parse(scope);
  return `${CREATE_ASSIGNEE_STORAGE_PREFIX}${encodeURIComponent(
    JSON.stringify([
      parsed.projectId,
      parsed.provider,
      parsed.destinationId,
      parsed.issueType
    ])
  )}`;
}

export function readRememberedCreateAssignee(
  scope: CreateAssigneeScope,
  storage: PreferenceStorage | null = defaultBrowserStorage
): string | null {
  const serialized = safeStorageGet(storage, createAssigneeStorageKey(scope));
  if (serialized === null) return null;
  try {
    const parsed = createAssigneeDefaultV1Schema.safeParse(
      JSON.parse(serialized)
    );
    return parsed.success ? parsed.data.assigneeId : null;
  } catch {
    return null;
  }
}

export function rememberCreateAssignee(
  scope: CreateAssigneeScope,
  assigneeId: string | null,
  storage: PreferenceStorage | null = defaultBrowserStorage
): void {
  const key = createAssigneeStorageKey(scope);
  if (assigneeId === null) {
    safeStorageRemove(storage, key);
    return;
  }
  const record = createAssigneeDefaultV1Schema.parse({
    version: CREATE_ASSIGNEE_DEFAULT_VERSION,
    assigneeId
  });
  safeStorageSet(storage, key, JSON.stringify(record));
}

export async function rememberCreateAssigneeAfterSuccess<
  T extends {
    assigneeConfirmation:
      | { confirmed: true; id: string | null }
      | { confirmed: false };
  }
>(
  creation: Promise<T>,
  scope: CreateAssigneeScope,
  assigneeId: string | null,
  storage: PreferenceStorage | null = defaultBrowserStorage
): Promise<T> {
  const result = await creation;
  if (
    result.assigneeConfirmation.confirmed &&
    result.assigneeConfirmation.id === assigneeId
  ) {
    rememberCreateAssignee(scope, assigneeId, storage);
  }
  return result;
}

export function validateRememberedCreateAssignee(
  assigneeId: string | null,
  assigneeOptions: readonly (string | { id: string })[]
): string | null {
  const parsedId = boundedValueSchema.safeParse(assigneeId);
  if (!parsedId.success) return null;
  return assigneeOptions.some(option => {
    const optionId = typeof option === 'string' ? option : option.id;
    return optionId === parsedId.data;
  })
    ? parsedId.data
    : null;
}

export function restoreRememberedCreateAssignee(
  scope: CreateAssigneeScope,
  assigneeOptions: readonly (string | { id: string })[],
  storage: PreferenceStorage | null = defaultBrowserStorage
): string | null {
  return validateRememberedCreateAssignee(
    readRememberedCreateAssignee(scope, storage),
    assigneeOptions
  );
}

function parseBrowseScope(scope: string): BrowsePreferenceScope {
  const parsed = browsePreferenceScopeSchema.parse(scope);
  return parsed as BrowsePreferenceScope;
}

function browseScopeFromStorageKey(
  storageKey: string
): BrowsePreferenceScope | null {
  if (!storageKey.startsWith(BROWSE_STORAGE_PREFIX)) return null;
  try {
    const scope = decodeURIComponent(storageKey.slice(BROWSE_STORAGE_PREFIX.length));
    const parsed = browsePreferenceScopeSchema.safeParse(scope);
    return parsed.success ? (parsed.data as BrowsePreferenceScope) : null;
  } catch {
    return null;
  }
}

function parseStoredBrowsePreferences(
  serialized: string | null
): BrowsePreferences | null {
  if (serialized === null) return null;
  try {
    const parsed = browsePreferencesV1Schema.safeParse(JSON.parse(serialized));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function validatedFallback(fallback: BrowsePreferences): BrowsePreferences {
  const parsed = browsePreferencesV1Schema.safeParse(fallback);
  return parsed.success ? parsed.data : defaultBrowsePreferences();
}

function cloneBrowsePreferences(
  preferences: BrowsePreferences
): BrowsePreferences {
  return {
    ...preferences,
    query: preferences.query,
    stateCategories: [...preferences.stateCategories],
    statuses: [...preferences.statuses],
    assignees: [...preferences.assignees],
    priorities: [...preferences.priorities],
    externalProjects: [...preferences.externalProjects],
    labels: [...preferences.labels],
    collapsedGroups: { ...preferences.collapsedGroups }
  };
}

function browsePreferencesEqual(
  left: BrowsePreferences,
  right: BrowsePreferences
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function safeStorageGet(
  storage: PreferenceStorage | null,
  key: string
): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeStorageSet(
  storage: PreferenceStorage | null,
  key: string,
  value: string
): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Browser preferences are best-effort in sandboxed or quota-limited hosts.
  }
}

function safeStorageRemove(
  storage: PreferenceStorage | null,
  key: string
): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Browser preferences are best-effort in sandboxed or quota-limited hosts.
  }
}

function resolveBrowserStorage(): PreferenceStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function browserStorageSubscription(
  listener: (key: string | null) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handleStorage = (event: StorageEvent) => listener(event.key);
  window.addEventListener('storage', handleStorage);
  return () => window.removeEventListener('storage', handleStorage);
}

const defaultBrowserStorage = resolveBrowserStorage();

export const browsePreferenceStore = createBrowsePreferenceStore({
  storage: defaultBrowserStorage,
  subscribeToStorage: browserStorageSubscription
});
