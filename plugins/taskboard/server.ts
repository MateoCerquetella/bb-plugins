import type { BbPluginApi, PluginRpcHandlers } from '@get-bb/plugin-sdk';
import {
  ACROSS_PROJECTS_SCOPE_ID,
  bbProjectIdSchema,
  formatWorkItemContext,
  issueDraftRecordSchema,
  projectConfigMutationSchema,
  projectCredentialsInteractionResponseSchema,
  projectSourceConfigSchema,
  sourceName,
  workSourceSchema,
  workStatusOptionSchema,
  taskboardRpcContract,
  type CreateIssueContext,
  type CreateIssueInput,
  type IssueDraftRecord,
  type ProjectConfigMutation,
  type ProjectConfigView,
  type ProjectSourceConfig,
  type RunningIssueDraft,
  type SecretMutation,
  type TrackerProject,
  type WorkItem,
  type WorkItemDetail,
  type WorkSource,
  type WorkStatusOption,
  type WorkSourceStatus
} from './contract.js';
import {
  buildIssueDraftPrompt,
  parseIssueDraftOutput,
  type ParsedIssueDraft
} from './issue-draft.js';
import { assertExpectedIssueSource } from './create-issue.js';
import {
  createProjectCredentialVault,
  type CredentialSource
} from './credentials.js';
import {
  createGithubAdapter,
  githubReposForProject,
  githubStatusOutputSchema,
  loadGithubStatus
} from './sources/github.js';
import { createJiraAdapter } from './sources/jira.js';
import { jiraProjectKeysFromJql } from './sources/jira-scope.js';
import { createLinearAdapter } from './sources/linear.js';
import {
  withoutComments,
  type ExternalWorkItem,
  type ExternalWorkItemDetail,
  type WorkSourceAdapter
} from './sources/types.js';
import { createWorkItemStore } from './store.js';

const SOURCES: readonly WorkSource[] = ['linear', 'github', 'jira'];
const CREDENTIAL_SOURCES: readonly CredentialSource[] = ['linear', 'jira'];
const SYNC_INTERVAL_MS = 5 * 60_000;
const ISSUE_DRAFT_TTL_MS = 24 * 60 * 60_000;
const ISSUE_DRAFT_REQUEST_PREFIX = 'issue-draft:request:';
const ISSUE_DRAFT_THREAD_PREFIX = 'issue-draft:thread:';
const ISSUE_DRAFT_CANCELLATION_PREFIX = 'issue-draft:cancellation:';
const ISSUE_DRAFT_RECONCILIATION_RETRY_MS = 50;
const KEEP_SECRET = { operation: 'keep' } as const;
const DEFAULT_PROJECT_CONFIG = {
  source: 'github',
  linearTeamKey: '',
  jiraBaseUrl: '',
  jiraEmail: '',
  jiraJql:
    'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC'
} satisfies Omit<ProjectSourceConfig, 'projectId'>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function issueDraftRequestKey(requestId: string): string {
  return `${ISSUE_DRAFT_REQUEST_PREFIX}${requestId}`;
}

function issueDraftThreadKey(threadId: string): string {
  return `${ISSUE_DRAFT_THREAD_PREFIX}${threadId}`;
}

function issueDraftCancellationKey(requestId: string): string {
  return `${ISSUE_DRAFT_CANCELLATION_PREFIX}${requestId}`;
}

function scopedItem(projectId: string, item: ExternalWorkItem): WorkItem {
  return { bbProjectId: projectId, ...item };
}

function scopedItemDetail(
  projectId: string,
  item: ExternalWorkItemDetail
): WorkItemDetail {
  return { bbProjectId: projectId, ...item };
}

function mentionId(item: WorkItem): string {
  return `${item.bbProjectId}:${item.source}:${item.locator}`;
}

function parseMentionId(value: string): {
  projectId: string;
  source: WorkSource;
  locator: string;
} {
  const firstSeparator = value.indexOf(':');
  const secondSeparator = value.indexOf(':', firstSeparator + 1);
  const projectId = value.slice(0, firstSeparator);
  const source = value.slice(firstSeparator + 1, secondSeparator);
  const locator = value.slice(secondSeparator + 1);
  const parsedProjectId = bbProjectIdSchema.safeParse(projectId);
  const parsedSource = workSourceSchema.safeParse(source);
  if (
    !parsedProjectId.success ||
    !parsedSource.success ||
    !locator ||
    firstSeparator < 0 ||
    secondSeparator < 0
  ) {
    throw new Error('Invalid Taskboard mention');
  }
  return {
    projectId: parsedProjectId.data,
    source: parsedSource.data,
    locator
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}

interface ParsedCliArguments {
  positionals: string[];
  projectId: string | undefined;
  source: string | undefined;
  query: string | undefined;
  linearTeam: string | undefined;
  jiraUrl: string | undefined;
  jiraEmail: string | undefined;
  jiraJql: string | undefined;
  statusId: string | undefined;
  json: boolean;
  cached: boolean;
}

const CLI_OPTIONS_BY_COMMAND = new Map<string, ReadonlySet<string>>([
  ['status', new Set(['--project', '--json'])],
  ['list', new Set(['--project', '--source', '--query', '--cached', '--json'])],
  ['show', new Set(['--project', '--json'])],
  ['refresh', new Set(['--project', '--json'])],
  ['transitions', new Set(['--project', '--json'])],
  ['move', new Set(['--project', '--status', '--json'])],
  [
    'config',
    new Set([
      '--project',
      '--source',
      '--linear-team',
      '--jira-url',
      '--jira-email',
      '--jira-jql',
      '--json'
    ])
  ],
  ['credentials', new Set(['--project', '--json'])]
]);

function parseCliArguments(
  command: string,
  argv: string[]
): ParsedCliArguments {
  const allowedOptions = CLI_OPTIONS_BY_COMMAND.get(command);
  if (!allowedOptions) throw new Error('Unknown bb taskboard command');

  const positionals: string[] = [];
  const seenOptions = new Set<string>();
  let projectId: string | undefined;
  let source: string | undefined;
  let query: string | undefined;
  let linearTeam: string | undefined;
  let jiraUrl: string | undefined;
  let jiraEmail: string | undefined;
  let jiraJql: string | undefined;
  let statusId: string | undefined;
  let json = false;
  let cached = false;

  const valueAfter = (flag: string, index: number): string => {
    const value = argv[index + 1];
    if (
      value === undefined ||
      value.startsWith('--') ||
      (value.length === 0 &&
        !['--linear-team', '--jira-url', '--jira-email'].includes(flag))
    ) {
      throw new Error(`${flag} requires a value`);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith('--')) {
      positionals.push(argument);
      continue;
    }
    if (!allowedOptions.has(argument)) {
      throw new Error('Unsupported bb taskboard option');
    }
    if (seenOptions.has(argument)) {
      throw new Error(`${argument} may only be provided once`);
    }
    seenOptions.add(argument);
    if (argument === '--project') {
      projectId = valueAfter(argument, index);
      index += 1;
    } else if (argument === '--source') {
      source = valueAfter(argument, index);
      index += 1;
    } else if (argument === '--query') {
      query = valueAfter(argument, index);
      index += 1;
    } else if (argument === '--linear-team') {
      linearTeam = valueAfter(argument, index);
      index += 1;
    } else if (argument === '--jira-url') {
      jiraUrl = valueAfter(argument, index);
      index += 1;
    } else if (argument === '--jira-email') {
      jiraEmail = valueAfter(argument, index);
      index += 1;
    } else if (argument === '--jira-jql') {
      jiraJql = valueAfter(argument, index);
      index += 1;
    } else if (argument === '--status') {
      statusId = valueAfter(argument, index);
      index += 1;
    } else if (argument === '--json') {
      json = true;
    } else if (argument === '--cached') {
      cached = true;
    }
  }

  return {
    positionals,
    projectId,
    source,
    query,
    linearTeam,
    jiraUrl,
    jiraEmail,
    jiraJql,
    statusId,
    json,
    cached
  };
}

function formatProjectConfig(config: ProjectConfigView): string {
  return [
    `Project\t${config.projectId}`,
    `Source\t${sourceName(config.source)}`,
    `GitHub repos\t${config.githubRepos.join(', ') || 'none mapped'}`,
    `Linear team\t${config.linearTeamKey || 'not configured'}`,
    `Linear credential\t${config.linearCredentialConfigured ? 'configured' : 'not configured'}`,
    `Jira URL\t${config.jiraBaseUrl || 'not configured'}`,
    `Jira email\t${config.jiraEmail || 'not configured'}`,
    `Jira credential\t${config.jiraCredentialConfigured ? 'configured' : 'not configured'}`,
    `Jira JQL\t${config.jiraJql}`
  ].join('\n');
}

function formatCredentialStatus(config: ProjectConfigView): string {
  return [
    `Project\t${config.projectId}`,
    `Linear credential\t${config.linearCredentialConfigured ? 'configured' : 'not configured'}`,
    `Jira credential\t${config.jiraCredentialConfigured ? 'configured' : 'not configured'}`
  ].join('\n');
}

function credentialStatus(config: ProjectConfigView) {
  return {
    projectId: config.projectId,
    linearCredentialConfigured: config.linearCredentialConfigured,
    jiraCredentialConfigured: config.jiraCredentialConfigured
  };
}

function refreshedItemCount(
  statuses: WorkSourceStatus[],
  source: WorkSource | undefined
): number {
  return statuses
    .filter(entry => source === undefined || entry.source === source)
    .reduce((total, entry) => total + entry.itemCount, 0);
}

function parseGithubRepoFromRemote(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const sshMatch =
    /^git@github\.com:(?<repo>[^/\s]+\/[^/\s]+?)(?:\.git)?$/iu.exec(trimmed);
  if (sshMatch?.groups?.repo) return sshMatch.groups.repo;
  try {
    const url = new URL(trimmed);
    if (url.hostname !== 'github.com') return null;
    const path = url.pathname
      .replace(/^\/+|\/+$/gu, '')
      .replace(/\.git$/iu, '');
    return /^[^/\s]+\/[^/\s]+$/u.test(path) ? path : null;
  } catch {
    return null;
  }
}

export default async function plugin(bb: BbPluginApi) {
  const store = createWorkItemStore(bb);
  const credentials = createProjectCredentialVault(bb);
  const issueDraftStarts = new Map<
    string,
    Promise<{ requestId: string; helperThreadId: string }>
  >();
  const issueDraftReconciliations = new Map<string, Promise<void>>();

  async function liveProjects() {
    return bb.sdk.projects.list({ includePersonal: true });
  }

  async function listProjects(): Promise<TrackerProject[]> {
    const projects = await liveProjects();
    return projects
      .map(project => ({ id: project.id, name: project.name }))
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
      );
  }

  async function projectById(projectId: string): Promise<TrackerProject> {
    const projects = await listProjects();
    const project = projects.find(entry => entry.id === projectId);
    if (!project) throw new Error('BB project was not found');
    return project;
  }

  async function readIssueDraftRecord(
    requestId: string
  ): Promise<IssueDraftRecord | null> {
    const value = await bb.storage.kv.get<unknown>(
      issueDraftRequestKey(requestId)
    );
    if (value === undefined) return null;
    const parsed = issueDraftRecordSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    bb.log.warn(`Discarding invalid Taskboard issue draft ${requestId}`);
    await bb.storage.kv.delete(issueDraftRequestKey(requestId));
    return null;
  }

  async function writeIssueDraftRecord(
    record: IssueDraftRecord
  ): Promise<void> {
    await bb.storage.kv.set(issueDraftRequestKey(record.requestId), record);
  }

  async function issueDraftCancellationRequested(
    requestId: string
  ): Promise<boolean> {
    return (
      (await bb.storage.kv.get(issueDraftCancellationKey(requestId))) !==
      undefined
    );
  }

  async function clearIssueDraftRequest(
    requestId: string,
    helperThreadId: string
  ): Promise<void> {
    await bb.storage.kv.delete(issueDraftRequestKey(requestId));
    await bb.storage.kv.delete(issueDraftThreadKey(helperThreadId));
  }

  async function releaseIssueDraftHelper(threadId: string): Promise<void> {
    try {
      await bb.sdk.threads.archive({ threadId });
    } catch (error) {
      bb.log.warn(
        `Could not archive Taskboard issue-draft helper ${threadId}: ${errorMessage(error)}`
      );
    }
    try {
      await bb.sdk.threads.stop({ threadId });
    } catch (error) {
      bb.log.warn(
        `Could not stop Taskboard issue-draft helper ${threadId}: ${errorMessage(error)}`
      );
    }
  }

  async function finishIssueDraft(
    threadId: string,
    result: ParsedIssueDraft | { error: string }
  ): Promise<void> {
    const requestId = await bb.storage.kv.get<string>(
      issueDraftThreadKey(threadId)
    );
    if (requestId === undefined) return;
    const current = await readIssueDraftRecord(requestId);
    if (current === null || current.status !== 'running') return;

    const completedAt = Date.now();
    const next: IssueDraftRecord =
      'error' in result
        ? { ...current, status: 'failed', error: result.error, completedAt }
        : {
            ...current,
            status: 'complete',
            title: result.title,
            description: result.description,
            completedAt
          };

    if (await issueDraftCancellationRequested(requestId)) return;
    await writeIssueDraftRecord(next);
    if (await issueDraftCancellationRequested(requestId)) {
      await clearIssueDraftRequest(requestId, threadId);
      await releaseIssueDraftHelper(threadId);
      return;
    }
    await bb.storage.kv.delete(issueDraftThreadKey(threadId));
    bb.realtime.publish('taskboard:issue-draft-changed', { requestId });
    await releaseIssueDraftHelper(threadId);
  }

  async function finishIssueDraftFromOutput(
    threadId: string,
    assistantText: string | null
  ): Promise<void> {
    const draft = parseIssueDraftOutput(assistantText ?? '');
    await finishIssueDraft(
      threadId,
      draft ?? {
        error:
          'The drafting model did not return a usable title and description.'
      }
    );
  }

  async function reconcileIssueDraftOnce(threadId: string): Promise<void> {
    const thread = await bb.sdk.threads.get({ threadId });
    if (thread.status === 'idle') {
      const { output } = await bb.sdk.threads.output({ threadId });
      await finishIssueDraftFromOutput(threadId, output);
    } else if (thread.status === 'error') {
      await finishIssueDraft(threadId, {
        error: 'The drafting model failed before returning a ticket.'
      });
    }
  }

  function reconcileIssueDraft(threadId: string): Promise<void> {
    const pending = issueDraftReconciliations.get(threadId);
    if (pending) return pending;
    const request = (async () => {
      try {
        await reconcileIssueDraftOnce(threadId);
      } catch {
        await new Promise(resolve =>
          setTimeout(resolve, ISSUE_DRAFT_RECONCILIATION_RETRY_MS)
        );
        await reconcileIssueDraftOnce(threadId);
      }
    })().finally(() => {
      if (issueDraftReconciliations.get(threadId) === request) {
        issueDraftReconciliations.delete(threadId);
      }
    });
    issueDraftReconciliations.set(threadId, request);
    return request;
  }

  async function startIssueDraftWorker(input: {
    requestId: string;
    projectId: string;
    prompt: string;
  }): Promise<{ requestId: string; helperThreadId: string }> {
    let helperThreadId: string | null = null;
    try {
      if (await issueDraftCancellationRequested(input.requestId)) {
        throw new Error('Issue drafting was cancelled.');
      }
      const existing = await readIssueDraftRecord(input.requestId);
      if (existing !== null) {
        return {
          requestId: existing.requestId,
          helperThreadId: existing.helperThreadId
        };
      }

      const project = await projectById(input.projectId);
      const source = projectConfig(input.projectId, true).source;
      const helper = await bb.sdk.threads.spawn({
        projectId: input.projectId,
        environment: { type: 'project-default' },
        prompt: buildIssueDraftPrompt({
          prompt: input.prompt,
          projectName: project.name,
          source
        }),
        permissionMode: 'auto',
        visibility: 'hidden',
        title: 'Draft Taskboard issue'
      });
      helperThreadId = helper.id;
      if (await issueDraftCancellationRequested(input.requestId)) {
        await releaseIssueDraftHelper(helperThreadId);
        helperThreadId = null;
        throw new Error('Issue drafting was cancelled.');
      }

      const record: RunningIssueDraft = {
        requestId: input.requestId,
        helperThreadId,
        status: 'running',
        createdAt: Date.now()
      };
      await writeIssueDraftRecord(record);
      await bb.storage.kv.set(
        issueDraftThreadKey(helperThreadId),
        input.requestId
      );
      if (await issueDraftCancellationRequested(input.requestId)) {
        await clearIssueDraftRequest(input.requestId, helperThreadId);
        await releaseIssueDraftHelper(helperThreadId);
        helperThreadId = null;
        throw new Error('Issue drafting was cancelled.');
      }
      await reconcileIssueDraft(helperThreadId);
      return { requestId: input.requestId, helperThreadId };
    } catch (error) {
      if (helperThreadId !== null) {
        try {
          await clearIssueDraftRequest(input.requestId, helperThreadId);
        } catch (cleanupError) {
          bb.log.warn(
            `Could not clear failed Taskboard issue draft ${input.requestId}: ${errorMessage(cleanupError)}`
          );
        }
        await releaseIssueDraftHelper(helperThreadId);
      }
      throw error;
    } finally {
      await bb.storage.kv.delete(issueDraftCancellationKey(input.requestId));
    }
  }

  function startIssueDraft(input: {
    requestId: string;
    projectId: string;
    prompt: string;
  }): Promise<{ requestId: string; helperThreadId: string }> {
    const pending = issueDraftStarts.get(input.requestId);
    if (pending) return pending;
    const request = startIssueDraftWorker(input).finally(() => {
      if (issueDraftStarts.get(input.requestId) === request) {
        issueDraftStarts.delete(input.requestId);
      }
    });
    issueDraftStarts.set(input.requestId, request);
    return request;
  }

  async function assertProjectExists(projectId: string): Promise<void> {
    await projectById(projectId);
  }

  async function assertFilterScopeExists(scopeId: string): Promise<void> {
    if (scopeId === ACROSS_PROJECTS_SCOPE_ID) return;
    await assertProjectExists(scopeId);
  }

  async function fallbackGithubRepos(projectId: string): Promise<string[]> {
    const project = (await liveProjects()).find(
      entry => entry.id === projectId
    );
    const repo = parseGithubRepoFromRemote(
      typeof project === 'object' &&
        project !== null &&
        'gitRemoteUrl' in project &&
        typeof project.gitRemoteUrl === 'string'
        ? project.gitRemoteUrl
        : null
    );
    return repo ? [repo] : [];
  }

  function projectConfig(
    projectId: string,
    ensure: boolean
  ): ProjectSourceConfig {
    return ensure
      ? store.ensureProjectConfig(projectId, DEFAULT_PROJECT_CONFIG)
      : store.projectConfig(projectId, DEFAULT_PROJECT_CONFIG);
  }

  function syncKey(projectId: string, source: WorkSource): string {
    return `${projectId}:${source}`;
  }

  const sourceRevisions = new Map<string, number>();
  type SourceRevisionSnapshot = Record<WorkSource, number>;
  interface ExpectedProjectMutationState {
    config: ProjectSourceConfig;
    revisions: SourceRevisionSnapshot;
  }

  function currentRevision(projectId: string, source: WorkSource): number {
    return sourceRevisions.get(syncKey(projectId, source)) ?? 0;
  }

  function revisionSnapshot(projectId: string): SourceRevisionSnapshot {
    return {
      linear: currentRevision(projectId, 'linear'),
      github: currentRevision(projectId, 'github'),
      jira: currentRevision(projectId, 'jira')
    };
  }

  function sameRevisions(
    projectId: string,
    expected: SourceRevisionSnapshot
  ): boolean {
    return SOURCES.every(
      source => currentRevision(projectId, source) === expected[source]
    );
  }

  function advanceSourceRevision(
    projectId: string,
    source: WorkSource
  ): number {
    const next = currentRevision(projectId, source) + 1;
    sourceRevisions.set(syncKey(projectId, source), next);
    return next;
  }

  function invalidateSource(projectId: string, source: WorkSource): void {
    advanceSourceRevision(projectId, source);
    store.clearSource(projectId, source);
  }

  const mutationTails = new Map<string, Promise<void>>();
  let activeConfigMutations = 0;
  let migrationBarrier: Promise<void> | null = null;
  let releaseMigrationBarrier: (() => void) | null = null;
  const configIdleWaiters = new Set<() => void>();

  async function withConfigMutation<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    for (;;) {
      const barrier = migrationBarrier;
      if (!barrier) {
        activeConfigMutations += 1;
        break;
      }
      await barrier;
    }
    try {
      return await operation();
    } finally {
      activeConfigMutations -= 1;
      if (activeConfigMutations === 0) {
        for (const resolve of configIdleWaiters) resolve();
        configIdleWaiters.clear();
      }
    }
  }

  async function withExclusiveMigration<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    while (migrationBarrier) await migrationBarrier;
    migrationBarrier = new Promise<void>(resolve => {
      releaseMigrationBarrier = resolve;
    });
    if (activeConfigMutations > 0) {
      await new Promise<void>(resolve => configIdleWaiters.add(resolve));
    }
    try {
      return await operation();
    } finally {
      const release = releaseMigrationBarrier;
      releaseMigrationBarrier = null;
      migrationBarrier = null;
      release?.();
    }
  }

  function enqueueMutation<T>(
    projectId: string,
    sources: readonly WorkSource[],
    operation: () => Promise<T>
  ): Promise<T> {
    const keys = [
      ...new Set(sources.map(source => syncKey(projectId, source)))
    ].sort();
    const previous = Promise.all(
      keys.map(key => mutationTails.get(key) ?? Promise.resolve())
    );
    const result = previous.then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined
    );
    for (const key of keys) mutationTails.set(key, tail);
    void tail.finally(() => {
      for (const key of keys) {
        if (mutationTails.get(key) === tail) mutationTails.delete(key);
      }
    });
    return result;
  }

  async function waitForMutations(
    projectId: string,
    sources: readonly WorkSource[]
  ): Promise<void> {
    await Promise.all(
      sources.map(
        source =>
          mutationTails.get(syncKey(projectId, source)) ?? Promise.resolve()
      )
    );
  }

  async function buildProjectConfigView(
    config: ProjectSourceConfig
  ): Promise<ProjectConfigView> {
    const [linearCredentialConfigured, jiraCredentialConfigured, githubRepos] =
      await Promise.all([
        credentials.configured(config.projectId, 'linear'),
        credentials.configured(config.projectId, 'jira'),
        bb.sdk.plugins
          .callRpc({
            pluginId: 'github',
            method: 'status',
            input: null,
            outputSchema: githubStatusOutputSchema
          })
          .then(status => githubReposForProject(status, config.projectId))
          .catch(() => fallbackGithubRepos(config.projectId))
      ]);
    return {
      ...config,
      githubRepos,
      linearCredentialConfigured,
      jiraCredentialConfigured
    };
  }

  async function readConsistentProjectConfigView(
    projectId: string,
    ensure = false
  ): Promise<{
    config: ProjectConfigView;
    revisions: SourceRevisionSnapshot;
  }> {
    for (;;) {
      await waitForMutations(projectId, SOURCES);
      const before = revisionSnapshot(projectId);
      const config = await buildProjectConfigView(
        projectConfig(projectId, ensure)
      );
      const after = revisionSnapshot(projectId);
      if (SOURCES.every(source => before[source] === after[source])) {
        return { config, revisions: after };
      }
    }
  }

  async function readProjectConfigView(
    projectId: string,
    ensure = false
  ): Promise<ProjectConfigView> {
    return (await readConsistentProjectConfigView(projectId, ensure)).config;
  }

  async function getCreateIssueContext(
    projectId: string
  ): Promise<CreateIssueContext> {
    const [project, config, currentAdapters] = await Promise.all([
      projectById(projectId),
      readProjectConfigView(projectId, true),
      adapters(projectId, true)
    ]);
    const adapter = currentAdapters.get(config.source);
    if (!adapter) throw new Error(`Missing ${config.source} adapter`);

    const destinationLabel =
      config.source === 'github'
        ? 'Repository'
        : config.source === 'linear'
          ? 'Team'
          : 'Project key';
    let githubMessage: string | null = null;
    let githubRepos = config.githubRepos;
    if (config.source === 'github') {
      try {
        const status = await loadGithubStatus(bb);
        githubRepos = githubReposForProject(status, projectId);
        if (!status.ghOk) {
          githubMessage = status.ghError ?? 'GitHub is not authenticated.';
        }
      } catch {
        githubRepos = [];
        githubMessage =
          'Install and enable BB’s official GitHub plugin before creating GitHub issues.';
      }
    }
    const destinationIds =
      config.source === 'github'
        ? githubRepos
        : config.source === 'linear'
          ? config.linearTeamKey
            ? [config.linearTeamKey]
            : []
          : jiraProjectKeysFromJql(config.jiraJql);
    const destinations = destinationIds.map(id => ({ id, label: id }));
    const missingDestinationMessage =
      config.source === 'github' && destinations.length === 0
        ? 'Map at least one GitHub repository to this BB project.'
        : config.source === 'linear' && destinations.length === 0
          ? 'Choose a Linear team key for this BB project in Manage.'
          : null;
    const configurationMessage =
      githubMessage ??
      (adapter.configured() ? null : adapter.configurationMessage());

    return {
      projectId,
      projectName: project.name,
      source: config.source,
      available:
        configurationMessage === null && missingDestinationMessage === null,
      message: configurationMessage ?? missingDestinationMessage,
      destinationLabel,
      destinations,
      defaultDestinationId: destinations[0]?.id ?? null,
      allowsCustomDestination: config.source === 'jira',
      defaultIssueType: config.source === 'jira' ? 'Task' : null
    };
  }

  function readCredentialFormSnapshot(projectId: string) {
    return readConsistentProjectConfigView(projectId);
  }

  async function adapters(
    projectId: string,
    ensureConfig = false
  ): Promise<Map<WorkSource, WorkSourceAdapter>> {
    for (;;) {
      await waitForMutations(projectId, SOURCES);
      const before = revisionSnapshot(projectId);
      const config = projectConfig(projectId, ensureConfig);
      const credential =
        config.source === 'linear' || config.source === 'jira'
          ? await credentials.read(projectId, config.source)
          : undefined;
      const after = revisionSnapshot(projectId);
      if (!SOURCES.every(source => before[source] === after[source])) continue;
      const adapter =
        config.source === 'linear'
          ? createLinearAdapter({
              enabled: true,
              apiKey: credential,
              teamKey: config.linearTeamKey
            })
          : config.source === 'jira'
            ? createJiraAdapter({
                enabled: true,
                baseUrl: config.jiraBaseUrl,
                email: config.jiraEmail,
                apiToken: credential,
                jql: config.jiraJql
              })
            : createGithubAdapter(bb, true, projectId);
      return new Map([[config.source, adapter]]);
    }
  }

  async function statuses(
    projectId: string,
    currentAdapters?: Map<WorkSource, WorkSourceAdapter>
  ): Promise<WorkSourceStatus[]> {
    const availableAdapters = currentAdapters ?? (await adapters(projectId));
    const [entry] = availableAdapters.entries();
    if (!entry) throw new Error('Missing selected source adapter');
    const [source, adapter] = entry;
    const sync = store.syncState(projectId, source);
    const configured = adapter.configured();
    return [
      {
        source,
        configured,
        available:
          configured && sync.error === null && sync.lastSyncedAt !== null,
        message: configured ? sync.error : adapter.configurationMessage(),
        lastSyncedAt: sync.lastSyncedAt,
        itemCount: sync.itemCount
      }
    ];
  }

  function assertSelectedSource(
    projectId: string,
    source: WorkSource,
    config = projectConfig(projectId, false)
  ): void {
    if (config.source !== source) {
      throw new Error(
        `${sourceName(source)} is not the selected tracker for this BB project`
      );
    }
  }

  async function assertSelectedSourceAfterMutations(
    projectId: string,
    source: WorkSource
  ): Promise<void> {
    await waitForMutations(projectId, SOURCES);
    assertSelectedSource(projectId, source);
  }

  async function syncOne(
    projectId: string,
    source: WorkSource,
    currentAdapters: Map<WorkSource, WorkSourceAdapter>,
    revision: number,
    forceRefresh: boolean
  ): Promise<void> {
    const adapter = currentAdapters.get(source);
    if (!adapter) throw new Error(`Missing ${source} adapter`);
    if (!adapter.configured()) {
      if (currentRevision(projectId, source) === revision) {
        store.setSourceError(
          projectId,
          source,
          adapter.configurationMessage() ??
            `${sourceName(source)} is not configured`
        );
      }
      return;
    }
    try {
      const items = (await adapter.list({ refresh: forceRefresh })).map(item =>
        scopedItem(projectId, item)
      );
      if (currentRevision(projectId, source) !== revision) return;
      store.replaceSource(projectId, source, items, new Date().toISOString());
    } catch (error) {
      const message = errorMessage(error);
      if (currentRevision(projectId, source) !== revision) return;
      store.setSourceError(projectId, source, message);
      bb.log.warn(
        `${sourceName(source)} sync failed for ${projectId}: ${message}`
      );
    }
  }

  const activeSyncs = new Map<
    string,
    { revision: number; forceRefresh: boolean; promise: Promise<void> }
  >();
  function syncSource(
    projectId: string,
    source: WorkSource,
    currentAdapters: Map<WorkSource, WorkSourceAdapter>,
    revision: number,
    forceRefresh: boolean
  ): Promise<void> {
    const key = syncKey(projectId, source);
    if (currentRevision(projectId, source) !== revision) {
      return Promise.resolve();
    }
    const active = activeSyncs.get(key);
    if (
      active?.revision === revision &&
      (active.forceRefresh || !forceRefresh)
    ) {
      return active.promise;
    }
    const run = () =>
      syncOne(projectId, source, currentAdapters, revision, forceRefresh);
    const pending =
      active?.revision === revision
        ? active.promise.then(() => {
            if (currentRevision(projectId, source) !== revision) return;
            return run();
          })
        : run();
    const promise = pending.finally(() => {
      if (activeSyncs.get(key)?.promise === promise) activeSyncs.delete(key);
    });
    activeSyncs.set(key, { revision, forceRefresh, promise });
    return promise;
  }

  async function syncAll(
    projectId: string,
    source: WorkSource | undefined,
    forceRefresh: boolean
  ): Promise<WorkSourceStatus[]> {
    let selected: WorkSource;
    let revision: number;
    let currentAdapters: Map<WorkSource, WorkSourceAdapter>;
    for (;;) {
      const config = projectConfig(projectId, true);
      if (source) assertSelectedSource(projectId, source, config);
      selected = config.source;
      revision = currentRevision(projectId, selected);
      currentAdapters = await adapters(projectId, true);
      if (currentAdapters.has(selected)) break;
      if (source) assertSelectedSource(projectId, source);
    }
    await syncSource(
      projectId,
      selected,
      currentAdapters,
      revision,
      forceRefresh
    );
    const nextStatuses = await statuses(projectId);
    bb.realtime.publish('taskboard:changed', {
      projectId,
      source: source ?? null
    });
    return nextStatuses;
  }

  function scheduleSources(
    projectId: string,
    sources: readonly WorkSource[]
  ): void {
    void Promise.all(
      sources.map(source => syncAll(projectId, source, false))
    ).catch((error: unknown) => {
      bb.log.warn(
        `Taskboard sync failed for ${projectId}: ${errorMessage(error)}`
      );
    });
  }

  function changedSources(
    previous: ProjectSourceConfig,
    next: ProjectConfigMutation
  ): WorkSource[] {
    if (previous.source !== next.source) return [...SOURCES];
    const changed = new Set<WorkSource>();
    if (
      previous.linearTeamKey !== next.linearTeamKey ||
      next.linearCredential.operation !== 'keep'
    ) {
      changed.add('linear');
    }
    if (
      previous.jiraBaseUrl !== next.jiraBaseUrl ||
      previous.jiraEmail !== next.jiraEmail ||
      previous.jiraJql !== next.jiraJql ||
      next.jiraCredential.operation !== 'keep'
    ) {
      changed.add('jira');
    }
    return [...changed];
  }

  async function restoreCredential(
    projectId: string,
    source: CredentialSource,
    previous: string | undefined
  ): Promise<void> {
    const mutation: SecretMutation = previous
      ? { operation: 'set', value: previous }
      : { operation: 'clear' };
    await credentials.mutate(projectId, source, mutation);
  }

  function sameProjectConfig(
    left: ProjectSourceConfig,
    right: ProjectSourceConfig
  ): boolean {
    return (
      left.projectId === right.projectId &&
      left.source === right.source &&
      left.linearTeamKey === right.linearTeamKey &&
      left.jiraBaseUrl === right.jiraBaseUrl &&
      left.jiraEmail === right.jiraEmail &&
      left.jiraJql === right.jiraJql
    );
  }

  async function persistProjectConfig(
    rawInput: ProjectConfigMutation,
    expectedState?: ExpectedProjectMutationState
  ): Promise<ProjectConfigView> {
    const input = projectConfigMutationSchema.parse(rawInput);
    const affectedSourceSet = new Set<WorkSource>();
    const savedConfig = await withConfigMutation(() =>
      // Register every source tail synchronously once the config gate is held.
      // New adapter snapshots wait here; an already-running snapshot is
      // rejected by the revision bump inside the queued operation.
      enqueueMutation(input.projectId, SOURCES, async () => {
        const previous = store.projectConfig(
          input.projectId,
          DEFAULT_PROJECT_CONFIG
        );
        if (
          expectedState &&
          (!sameProjectConfig(previous, expectedState.config) ||
            !sameRevisions(input.projectId, expectedState.revisions))
        ) {
          throw new Error(
            'Project connector state changed while the credential form was open; reopen it and confirm the current settings'
          );
        }
        for (const source of changedSources(previous, input)) {
          affectedSourceSet.add(source);
        }
        if (affectedSourceSet.size === 0) {
          await assertProjectExists(input.projectId);
          return previous;
        }
        const jiraIdentityChanged =
          previous.jiraBaseUrl !== input.jiraBaseUrl ||
          previous.jiraEmail !== input.jiraEmail;
        let projectValidated = false;
        if (jiraIdentityChanged && input.jiraCredential.operation === 'keep') {
          await assertProjectExists(input.projectId);
          projectValidated = true;
          if (await credentials.configured(input.projectId, 'jira')) {
            throw new Error(
              'Changing the Jira URL or email requires a replacement token or explicit token removal'
            );
          }
        }
        // After the rejection-only keep-token preflight, invalidate before
        // any mutation I/O. Tails block new snapshots and the revision rejects
        // already-running ones.
        for (const source of affectedSourceSet) {
          invalidateSource(input.projectId, source);
        }
        if (!projectValidated) await assertProjectExists(input.projectId);
        const needsPreviousLinearCredential =
          input.linearCredential.operation !== 'keep';
        const needsPreviousJiraCredential =
          input.jiraCredential.operation !== 'keep';
        const [previousLinearCredential, previousJiraCredential] =
          await Promise.all([
            needsPreviousLinearCredential
              ? credentials.read(input.projectId, 'linear')
              : Promise.resolve(undefined),
            needsPreviousJiraCredential
              ? credentials.read(input.projectId, 'jira')
              : Promise.resolve(undefined)
          ]);
        const config = projectSourceConfigSchema.parse({
          projectId: input.projectId,
          source: input.source,
          linearTeamKey: input.linearTeamKey,
          jiraBaseUrl: input.jiraBaseUrl,
          jiraEmail: input.jiraEmail,
          jiraJql: input.jiraJql
        });

        if (jiraIdentityChanged) {
          let linearMutated = false;
          try {
            if (input.linearCredential.operation !== 'keep') {
              await credentials.mutate(
                input.projectId,
                'linear',
                input.linearCredential
              );
              linearMutated = true;
            }
            // Remove the old destination binding before persisting the new one.
            // A failure from this point leaves Jira without a token, never with a
            // token paired to the wrong origin or account.
            await credentials.mutate(input.projectId, 'jira', {
              operation: 'clear'
            });
          } catch (error) {
            if (linearMutated) {
              await restoreCredential(
                input.projectId,
                'linear',
                previousLinearCredential
              );
            }
            throw error;
          }

          let savedConfig: ProjectSourceConfig;
          try {
            savedConfig = store.saveProjectConfig(config);
          } catch (error) {
            const restorationResults = await Promise.allSettled([
              linearMutated
                ? restoreCredential(
                    input.projectId,
                    'linear',
                    previousLinearCredential
                  )
                : Promise.resolve(),
              restoreCredential(input.projectId, 'jira', previousJiraCredential)
            ]);
            if (
              restorationResults.some(result => result.status === 'rejected')
            ) {
              throw new Error(
                'Connector save failed and the previous credential state could not be fully restored'
              );
            }
            throw error;
          }
          if (input.jiraCredential.operation === 'set') {
            try {
              await credentials.mutate(
                input.projectId,
                'jira',
                input.jiraCredential
              );
            } catch {
              let configRolledBack = false;
              try {
                store.saveProjectConfig(previous);
                configRolledBack = true;
              } catch {
                // The new destination stays tokenless when its config cannot
                // be rolled back; restoring the old token would misbind it.
              }
              const restorationResults = await Promise.allSettled([
                linearMutated
                  ? restoreCredential(
                      input.projectId,
                      'linear',
                      previousLinearCredential
                    )
                  : Promise.resolve(),
                configRolledBack
                  ? restoreCredential(
                      input.projectId,
                      'jira',
                      previousJiraCredential
                    )
                  : Promise.resolve()
              ]);
              bb.realtime.publish('taskboard:changed', {
                projectId: input.projectId,
                source: null
              });
              if (
                restorationResults.some(result => result.status === 'rejected')
              ) {
                throw new Error(
                  'Jira credential save failed and the previous credential state could not be fully restored'
                );
              }
              throw new Error(
                configRolledBack
                  ? 'Jira credential could not be saved; the previous Jira bundle was restored'
                  : 'Jira credential could not be saved; Jira was left unconfigured'
              );
            }
          }
          return savedConfig;
        }

        let linearMutated = false;
        let jiraMutated = false;
        try {
          if (input.linearCredential.operation !== 'keep') {
            await credentials.mutate(
              input.projectId,
              'linear',
              input.linearCredential
            );
            linearMutated = true;
          }
          if (input.jiraCredential.operation !== 'keep') {
            await credentials.mutate(
              input.projectId,
              'jira',
              input.jiraCredential
            );
            jiraMutated = true;
          }
          const savedConfig = store.saveProjectConfig(config);
          return savedConfig;
        } catch (error) {
          const restorationResults = await Promise.allSettled([
            linearMutated
              ? restoreCredential(
                  input.projectId,
                  'linear',
                  previousLinearCredential
                )
              : Promise.resolve(),
            jiraMutated
              ? restoreCredential(
                  input.projectId,
                  'jira',
                  previousJiraCredential
                )
              : Promise.resolve()
          ]);
          if (restorationResults.some(result => result.status === 'rejected')) {
            throw new Error(
              'Credential save failed and the previous credential state could not be fully restored'
            );
          }
          throw error;
        }
      })
    );

    bb.realtime.publish('taskboard:changed', {
      projectId: savedConfig.projectId,
      source: null
    });
    if (affectedSourceSet.has(savedConfig.source)) {
      scheduleSources(savedConfig.projectId, [savedConfig.source]);
    }
    return buildProjectConfigView(savedConfig);
  }

  async function getLiveItem(
    projectId: string,
    source: WorkSource,
    locator: string
  ): Promise<WorkItemDetail> {
    assertSelectedSource(projectId, source);
    await waitForMutations(projectId, [source]);
    assertSelectedSource(projectId, source);
    if (!store.get(projectId, source, locator)) {
      throw new Error(
        `${sourceName(source)} item is not cached for this BB project; refresh the project tracker first`
      );
    }
    const revision = currentRevision(projectId, source);
    const adapter = (await adapters(projectId)).get(source);
    if (!adapter) {
      assertSelectedSource(projectId, source);
      throw new Error(`Missing ${source} adapter`);
    }
    if (currentRevision(projectId, source) !== revision) {
      throw new Error(
        `${sourceName(source)} settings changed while loading the item; reopen it`
      );
    }
    if (!adapter.configured()) {
      throw new Error(
        adapter.configurationMessage() ??
          `${sourceName(source)} is not configured`
      );
    }
    let externalItem: ExternalWorkItemDetail;
    try {
      externalItem = await adapter.get(locator);
    } catch {
      throw new Error(
        `${sourceName(source)} could not load the requested item`
      );
    }
    if (currentRevision(projectId, source) !== revision) {
      throw new Error(
        `${sourceName(source)} settings changed while loading the item; reopen it`
      );
    }
    return scopedItemDetail(projectId, externalItem);
  }

  async function liveStatusOptions(
    projectId: string,
    source: WorkSource,
    locator: string
  ): Promise<WorkStatusOption[]> {
    assertSelectedSource(projectId, source);
    await waitForMutations(projectId, [source]);
    assertSelectedSource(projectId, source);
    if (!store.get(projectId, source, locator)) {
      throw new Error(
        `${sourceName(source)} item is not cached for this BB project; refresh the project tracker first`
      );
    }
    const revision = currentRevision(projectId, source);
    const adapter = (await adapters(projectId)).get(source);
    if (!adapter) {
      assertSelectedSource(projectId, source);
      throw new Error(`Missing ${source} adapter`);
    }
    if (currentRevision(projectId, source) !== revision) {
      throw new Error(
        `${sourceName(source)} settings changed while loading statuses; try again`
      );
    }
    if (!adapter.configured()) {
      throw new Error(
        adapter.configurationMessage() ??
          `${sourceName(source)} is not configured`
      );
    }
    let options: WorkStatusOption[];
    try {
      options = workStatusOptionSchema
        .array()
        .parse(await adapter.statusOptions(locator));
    } catch (error) {
      const message = errorMessage(error);
      throw new Error(
        message.includes('outside the configured scope')
          ? message
          : `${sourceName(source)} could not load valid statuses for this item`
      );
    }
    if (currentRevision(projectId, source) !== revision) {
      throw new Error(
        `${sourceName(source)} settings changed while loading statuses; try again`
      );
    }
    if (new Set(options.map(option => option.id)).size !== options.length) {
      throw new Error(`${sourceName(source)} returned duplicate status ids`);
    }
    if (!options.some(option => option.current)) {
      throw new Error(
        `${sourceName(source)} did not return the current status`
      );
    }
    return options;
  }

  async function updateItemStatus(
    projectId: string,
    source: WorkSource,
    locator: string,
    statusId: string
  ): Promise<WorkItem> {
    assertSelectedSource(projectId, source);
    await waitForMutations(projectId, [source]);
    assertSelectedSource(projectId, source);
    const cached = store.get(projectId, source, locator);
    if (!cached) {
      throw new Error(
        `${sourceName(source)} item is not cached for this BB project; refresh the project tracker first`
      );
    }
    const revision = currentRevision(projectId, source);
    const adapter = (await adapters(projectId)).get(source);
    if (!adapter) {
      assertSelectedSource(projectId, source);
      throw new Error(`Missing ${source} adapter`);
    }
    if (!adapter.configured()) {
      throw new Error(
        adapter.configurationMessage() ??
          `${sourceName(source)} is not configured`
      );
    }
    const mutation = enqueueMutation(projectId, [source], async () => {
      if (currentRevision(projectId, source) !== revision) {
        throw new Error(
          `${sourceName(source)} settings changed before the status update; try again`
        );
      }
      if (!store.get(projectId, source, locator)) {
        throw new Error(
          `${sourceName(source)} item is no longer cached for this BB project`
        );
      }
      advanceSourceRevision(projectId, source);
      let externalItem: ExternalWorkItemDetail;
      try {
        externalItem = await adapter.updateStatus(locator, statusId);
      } catch (error) {
        const message = errorMessage(error);
        throw new Error(
          message.includes('not available') ||
            message.includes('outside the configured scope')
            ? message
            : `${sourceName(source)} could not update this item status`
        );
      }
      if (externalItem.source !== source || externalItem.locator !== locator) {
        throw new Error(
          `${sourceName(source)} returned an invalid status update result`
        );
      }
      const item = scopedItem(projectId, withoutComments(externalItem));
      store.upsert(item);
      bb.realtime.publish('taskboard:changed', { projectId, source });
      return item;
    });
    void mutation
      .then(
        () => syncAll(projectId, source, false),
        () => syncAll(projectId, source, false)
      )
      .catch((error: unknown) => {
        bb.log.warn(
          `${sourceName(source)} reconciliation failed for ${projectId}: ${errorMessage(error)}`
        );
      });
    return mutation;
  }

  async function createWorkItem(input: CreateIssueInput): Promise<WorkItem> {
    await waitForMutations(input.projectId, SOURCES);
    const config = projectConfig(input.projectId, true);
    const source = assertExpectedIssueSource(
      input.expectedSource,
      config.source
    );
    const revision = currentRevision(input.projectId, source);
    const adapter = (await adapters(input.projectId, true)).get(source);
    if (!adapter) throw new Error(`Missing ${source} adapter`);
    if (!adapter.configured()) {
      throw new Error(
        adapter.configurationMessage() ?? `${sourceName(source)} is not configured`
      );
    }

    const mutation = enqueueMutation(input.projectId, [source], async () => {
      if (currentRevision(input.projectId, source) !== revision) {
        throw new Error(
          `${sourceName(source)} settings changed before the issue was created; try again`
        );
      }
      advanceSourceRevision(input.projectId, source);
      let externalItem: ExternalWorkItemDetail;
      try {
        externalItem = await adapter.create({
          title: input.title,
          description: input.description,
          destinationId: input.destinationId,
          issueType: input.issueType
        });
      } catch (error) {
        throw new Error(
          `${sourceName(source)} could not create the issue. ${errorMessage(error)}`
        );
      }
      if (externalItem.source !== source || !externalItem.locator) {
        throw new Error(
          `${sourceName(source)} returned an invalid new issue`
        );
      }
      const item = scopedItem(input.projectId, withoutComments(externalItem));
      store.upsert(item);
      bb.realtime.publish('taskboard:changed', {
        projectId: input.projectId,
        source
      });
      return item;
    });
    void mutation
      .then(
        () => syncAll(input.projectId, source, false),
        () => syncAll(input.projectId, source, false)
      )
      .catch((error: unknown) => {
        bb.log.warn(
          `${sourceName(source)} reconciliation failed for ${input.projectId}: ${errorMessage(error)}`
        );
      });
    return mutation;
  }

  const handlers: PluginRpcHandlers<typeof taskboardRpcContract> = {
    async listProjects() {
      return { projects: await listProjects() };
    },
    async threadProject(input) {
      const thread = await bb.sdk.threads.get({ threadId: input.threadId });
      await assertProjectExists(thread.projectId);
      return { projectId: thread.projectId };
    },
    async status(input) {
      await assertProjectExists(input.projectId);
      return { sources: await statuses(input.projectId) };
    },
    async listItems(input) {
      if (input.projectId) {
        await assertProjectExists(input.projectId);
        if (input.source) {
          await assertSelectedSourceAfterMutations(
            input.projectId,
            input.source
          );
        }
        return { items: store.list(input) };
      }
      const projects = await listProjects();
      return {
        items: store.list({
          ...input,
          projectIds: projects.map(project => project.id)
        })
      };
    },
    async refresh(input) {
      await assertProjectExists(input.projectId);
      const nextStatuses = await syncAll(input.projectId, input.source, true);
      return {
        sources: nextStatuses,
        itemCount: refreshedItemCount(nextStatuses, input.source)
      };
    },
    async getItem(input) {
      await assertProjectExists(input.projectId);
      return {
        item: await getLiveItem(input.projectId, input.source, input.locator)
      };
    },
    async statusOptions(input) {
      await assertProjectExists(input.projectId);
      return {
        options: await liveStatusOptions(
          input.projectId,
          input.source,
          input.locator
        )
      };
    },
    async updateItemStatus(input) {
      await assertProjectExists(input.projectId);
      return {
        item: await updateItemStatus(
          input.projectId,
          input.source,
          input.locator,
          input.statusId
        )
      };
    },
    async getCreateIssueContext(input) {
      await assertProjectExists(input.projectId);
      return { context: await getCreateIssueContext(input.projectId) };
    },
    async startIssueDraft(input) {
      await assertProjectExists(input.projectId);
      return startIssueDraft(input);
    },
    async getIssueDraft(input) {
      const draft = await readIssueDraftRecord(input.requestId);
      if (draft?.status === 'running') {
        try {
          await reconcileIssueDraft(draft.helperThreadId);
        } catch (error) {
          bb.log.warn(
            `Could not reconcile Taskboard issue draft ${input.requestId}: ${errorMessage(error)}`
          );
        }
      }
      return { draft: await readIssueDraftRecord(input.requestId) };
    },
    async cancelIssueDraft(input) {
      await bb.storage.kv.set(issueDraftCancellationKey(input.requestId), {
        createdAt: Date.now()
      });
      const draft = await readIssueDraftRecord(input.requestId);
      if (draft !== null) {
        await clearIssueDraftRequest(
          input.requestId,
          draft.helperThreadId
        );
        if (draft.status === 'running') {
          await releaseIssueDraftHelper(draft.helperThreadId);
        }
      }
      bb.realtime.publish('taskboard:issue-draft-changed', {
        requestId: input.requestId
      });
      return { cancelled: true as const };
    },
    async createIssue(input) {
      await assertProjectExists(input.projectId);
      const item = await createWorkItem(input);
      return {
        item,
        mention: {
          provider: 'external-work-item',
          id: mentionId(item),
          label: item.key
        }
      };
    },
    async getProjectConfig(input) {
      await assertProjectExists(input.projectId);
      return { config: await readProjectConfigView(input.projectId) };
    },
    async saveProjectConfig(input) {
      return { config: await persistProjectConfig(input) };
    },
    async getProjectBoardSettings(input) {
      await assertProjectExists(input.projectId);
      return { settings: store.projectBoardSettings(input.projectId) };
    },
    async saveProjectBoardSettings(input) {
      await assertProjectExists(input.projectId);
      const settings = store.saveProjectBoardSettings(input);
      bb.realtime.publish('taskboard:changed', {
        projectId: settings.projectId,
        source: null
      });
      return { settings };
    },
    async getBoardFilterState(input) {
      await assertFilterScopeExists(input.projectId);
      return { state: store.boardFilterState(input.projectId) };
    },
    async saveBoardFilterState(input) {
      await assertFilterScopeExists(input.projectId);
      return {
        state: store.saveBoardFilterState(input.projectId, input.state)
      };
    }
  };
  bb.rpc.register(taskboardRpcContract, handlers);

  bb.events.on('thread.idle', ({ thread, lastAssistantText }) =>
    finishIssueDraftFromOutput(thread.id, lastAssistantText)
  );
  bb.events.on('thread.failed', ({ thread, error }) =>
    finishIssueDraft(thread.id, {
      error: error?.trim() || 'The drafting model failed.'
    })
  );

  const issueDraftCleanupNow = Date.now();
  for (const key of await bb.storage.kv.list(ISSUE_DRAFT_REQUEST_PREFIX)) {
    const requestId = key.slice(ISSUE_DRAFT_REQUEST_PREFIX.length);
    const draft = await readIssueDraftRecord(requestId);
    if (draft === null) continue;
    if (issueDraftCleanupNow - draft.createdAt > ISSUE_DRAFT_TTL_MS) {
      await clearIssueDraftRequest(requestId, draft.helperThreadId);
      if (draft.status === 'running') {
        await releaseIssueDraftHelper(draft.helperThreadId);
      }
    } else if (draft.status === 'running') {
      try {
        await reconcileIssueDraft(draft.helperThreadId);
      } catch (error) {
        bb.log.warn(
          `Could not restore Taskboard issue draft ${requestId}: ${errorMessage(error)}`
        );
      }
    }
  }
  for (const key of await bb.storage.kv.list(
    ISSUE_DRAFT_CANCELLATION_PREFIX
  )) {
    const value = await bb.storage.kv.get<unknown>(key);
    const createdAt =
      typeof value === 'object' &&
      value !== null &&
      'createdAt' in value &&
      typeof value.createdAt === 'number'
        ? value.createdAt
        : null;
    if (
      createdAt === null ||
      issueDraftCleanupNow - createdAt > ISSUE_DRAFT_TTL_MS
    ) {
      await bb.storage.kv.delete(key);
    }
  }

  bb.ui.registerMentionProvider({
    id: 'external-work-item',
    label: 'Taskboard',
    triggers: ['@', '#'],
    async search({ query, projectId }) {
      const trimmed = query.trim();
      if (!projectId || trimmed.length < 2) return [];
      try {
        await assertProjectExists(projectId);
      } catch {
        return [];
      }
      return store.list({ projectId, query: trimmed, limit: 10 }).map(item => ({
        id: mentionId(item),
        title: `${item.key} ${item.title}`,
        subtitle: `${sourceName(item.source)} · ${item.status}${item.assignee ? ` · ${item.assignee}` : ''}`
      }));
    },
    async resolve(itemId) {
      const { projectId, source, locator } = parseMentionId(itemId);
      await assertProjectExists(projectId);
      assertSelectedSource(projectId, source);
      const item = store.get(projectId, source, locator);
      if (!item) throw new Error('Taskboard item is no longer available');
      return { context: formatWorkItemContext(item) };
    }
  });

  bb.cli.register({
    name: 'taskboard',
    summary: 'Browse project-scoped Linear, GitHub, and Jira issues',
    commands: [
      {
        name: 'status',
        summary: 'Show connector status for a BB project',
        usage: 'bb taskboard status [--project <proj_id>] [--json]'
      },
      {
        name: 'list',
        summary: 'List cached project work, refreshing first by default',
        usage:
          'bb taskboard list [--project <proj_id>] [--source linear|github|jira] [--query <text>] [--cached] [--json]'
      },
      {
        name: 'show',
        summary: 'Fetch one external issue in a BB project',
        usage:
          'bb taskboard show <linear|github|jira> <locator> [--project <proj_id>] [--json]'
      },
      {
        name: 'transitions',
        summary: 'List valid status targets for one external issue',
        usage:
          'bb taskboard transitions <linear|github|jira> <locator> [--project <proj_id>] [--json]'
      },
      {
        name: 'move',
        summary: 'Move one external issue to an exact listed status id',
        usage:
          'bb taskboard move <linear|github|jira> <locator> --status <id> [--project <proj_id>] [--json]'
      },
      {
        name: 'refresh',
        summary: "Refresh a BB project's external issue caches",
        usage:
          'bb taskboard refresh [linear|github|jira] [--project <proj_id>] [--json]'
      },
      {
        name: 'config',
        summary: 'Show or update nonsecret project connector configuration',
        usage:
          'bb taskboard config [--project <proj_id>] [--source linear|github|jira] [--linear-team <key>] [--jira-url <url>] [--jira-email <email>] [--jira-jql <text>] [--json]'
      },
      {
        name: 'credentials',
        summary: 'Open a secure form for project connector credentials',
        usage: 'bb taskboard credentials [--project <proj_id>] [--json]'
      }
    ],
    async run(argv, ctx) {
      try {
        const firstArgument = argv[0];
        const hasExplicitCommand = Boolean(
          firstArgument && !firstArgument.startsWith('--')
        );
        const command = hasExplicitCommand ? firstArgument! : 'status';
        const args = parseCliArguments(
          command,
          hasExplicitCommand ? argv.slice(1) : argv
        );
        const requireProject = async (): Promise<TrackerProject> => {
          const parsedProject = bbProjectIdSchema.safeParse(
            args.projectId ?? ctx.projectId
          );
          if (!parsedProject.success) {
            throw new Error(
              'Choose a BB project with --project <proj_id> or run this command from a project thread'
            );
          }
          return projectById(parsedProject.data);
        };

        if (command === 'status') {
          if (args.positionals.length > 0) {
            throw new Error(
              'Usage: bb taskboard status [--project <proj_id>] [--json]'
            );
          }
          const project = await requireProject();
          const result = {
            projectId: project.id,
            sources: await statuses(project.id)
          };
          return {
            exitCode: 0,
            stdout: args.json
              ? JSON.stringify(result, null, 2)
              : result.sources
                  .map(
                    entry =>
                      `${sourceName(entry.source)}\t${entry.available ? 'ready' : entry.configured ? 'unavailable' : 'not configured'}\t${entry.message ?? ''}`
                  )
                  .join('\n')
          };
        }
        if (command === 'refresh') {
          if (args.positionals.length > 1) {
            throw new Error(
              'Usage: bb taskboard refresh [linear|github|jira] [--project <proj_id>] [--json]'
            );
          }
          const project = await requireProject();
          const sourceValue = args.positionals[0];
          const parsedSource = sourceValue
            ? workSourceSchema.safeParse(sourceValue)
            : null;
          if (parsedSource && !parsedSource.success) {
            throw new Error('Source must be linear, github, or jira');
          }
          const source = parsedSource?.data;
          const sources = await syncAll(project.id, source, true);
          const result = {
            projectId: project.id,
            sources,
            itemCount: refreshedItemCount(sources, source)
          };
          const failures = source
            ? sources.filter(
                entry => entry.source === source && !entry.available
              )
            : sources.filter(entry => entry.configured && !entry.available);
          if (failures.length > 0) {
            return {
              exitCode: 1,
              stderr: `${failures
                .map(
                  entry =>
                    `${sourceName(entry.source)} refresh failed: ${entry.message ?? 'connector unavailable'}`
                )
                .join('\n')}\n`
            };
          }
          return {
            exitCode: 0,
            stdout: args.json
              ? JSON.stringify(result, null, 2)
              : `Refreshed ${result.itemCount} work items for ${project.id}.`
          };
        }
        if (command === 'list') {
          if (args.positionals.length > 0) {
            throw new Error(
              'Usage: bb taskboard list [--project <proj_id>] [--source linear|github|jira] [--query <text>] [--cached] [--json]'
            );
          }
          const sourceValue = args.source;
          const parsedSource = sourceValue
            ? workSourceSchema.safeParse(sourceValue)
            : null;
          if (parsedSource && !parsedSource.success) {
            throw new Error('Source must be linear, github, or jira');
          }
          const source = parsedSource?.data;
          const project = await requireProject();
          if (source) {
            await assertSelectedSourceAfterMutations(project.id, source);
          }
          if (!args.cached) await syncAll(project.id, source, true);
          const items = store.list({
            projectId: project.id,
            ...(source ? { source } : {}),
            ...(args.query ? { query: args.query } : {}),
            limit: 200
          });
          return {
            exitCode: 0,
            stdout: args.json
              ? JSON.stringify({ items }, null, 2)
              : items
                  .map(
                    item =>
                      `${item.bbProjectId}\t${sourceName(item.source)}\t${item.key}\t${item.status}\t${item.assignee ?? '-'}\t${item.title}`
                  )
                  .join('\n')
          };
        }
        if (command === 'show') {
          if (args.positionals.length !== 2) {
            throw new Error(
              'Usage: bb taskboard show <linear|github|jira> <locator> [--project <proj_id>] [--json]'
            );
          }
          const project = await requireProject();
          const parsedSource = workSourceSchema.safeParse(args.positionals[0]);
          const locator = args.positionals[1]!;
          if (!parsedSource.success) {
            throw new Error('Source must be linear, github, or jira');
          }
          const item = await getLiveItem(
            project.id,
            parsedSource.data,
            locator
          );
          return {
            exitCode: 0,
            stdout: args.json
              ? JSON.stringify({ item }, null, 2)
              : formatWorkItemContext(item)
          };
        }
        if (command === 'transitions') {
          if (args.positionals.length !== 2) {
            throw new Error(
              'Usage: bb taskboard transitions <linear|github|jira> <locator> [--project <proj_id>] [--json]'
            );
          }
          const project = await requireProject();
          const parsedSource = workSourceSchema.safeParse(args.positionals[0]);
          if (!parsedSource.success) {
            throw new Error('Source must be linear, github, or jira');
          }
          const locator = args.positionals[1]!;
          const options = await liveStatusOptions(
            project.id,
            parsedSource.data,
            locator
          );
          return {
            exitCode: 0,
            stdout: args.json
              ? JSON.stringify(
                  {
                    projectId: project.id,
                    source: parsedSource.data,
                    locator,
                    options
                  },
                  null,
                  2
                )
              : options
                  .map(
                    option =>
                      `${option.id}\t${option.name}\t${option.stateCategory}\t${option.current ? 'current' : 'available'}`
                  )
                  .join('\n')
          };
        }
        if (command === 'move') {
          if (args.positionals.length !== 2 || !args.statusId) {
            throw new Error(
              'Usage: bb taskboard move <linear|github|jira> <locator> --status <id> [--project <proj_id>] [--json]'
            );
          }
          const project = await requireProject();
          const parsedSource = workSourceSchema.safeParse(args.positionals[0]);
          if (!parsedSource.success) {
            throw new Error('Source must be linear, github, or jira');
          }
          const item = await updateItemStatus(
            project.id,
            parsedSource.data,
            args.positionals[1]!,
            args.statusId
          );
          return {
            exitCode: 0,
            stdout: args.json
              ? JSON.stringify({ item }, null, 2)
              : formatWorkItemContext(item)
          };
        }
        if (command === 'config') {
          if (args.positionals.length > 0) {
            throw new Error(
              'Usage: bb taskboard config [--project <proj_id>] [--source linear|github|jira] [--linear-team <key>] [--jira-url <url>] [--jira-email <email>] [--jira-jql <text>] [--json]'
            );
          }
          const parsedSource = args.source
            ? workSourceSchema.safeParse(args.source)
            : null;
          if (parsedSource && !parsedSource.success) {
            throw new Error('--source must be linear, github, or jira');
          }
          if (args.jiraJql !== undefined && !args.jiraJql.trim()) {
            throw new Error('--jira-jql requires a non-empty value');
          }
          const project = await requireProject();
          const snapshot = await readCredentialFormSnapshot(project.id);
          const previous = snapshot.config;
          const changed =
            parsedSource !== null ||
            args.linearTeam !== undefined ||
            args.jiraUrl !== undefined ||
            args.jiraEmail !== undefined ||
            args.jiraJql !== undefined;
          const config = changed
            ? await persistProjectConfig(
                {
                  projectId: previous.projectId,
                  source: parsedSource?.data ?? previous.source,
                  linearTeamKey: args.linearTeam ?? previous.linearTeamKey,
                  jiraBaseUrl: args.jiraUrl ?? previous.jiraBaseUrl,
                  jiraEmail: args.jiraEmail ?? previous.jiraEmail,
                  jiraJql: args.jiraJql ?? previous.jiraJql,
                  linearCredential: KEEP_SECRET,
                  jiraCredential: KEEP_SECRET
                },
                { config: previous, revisions: snapshot.revisions }
              )
            : previous;
          return {
            exitCode: 0,
            stdout: args.json
              ? JSON.stringify({ config }, null, 2)
              : formatProjectConfig(config)
          };
        }
        if (command === 'credentials') {
          if (args.positionals.length > 0) {
            throw new Error(
              'Usage: bb taskboard credentials [--project <proj_id>] [--json]'
            );
          }
          if (!ctx.threadId) {
            throw new Error(
              'bb taskboard credentials must run from an active BB thread'
            );
          }
          const project = await requireProject();
          const snapshot = await readCredentialFormSnapshot(project.id);
          const previous = snapshot.config;
          const result = await bb.ui.requestInput(
            {
              threadId: ctx.threadId,
              rendererId: 'taskboard-credentials',
              title: `Manage credentials for ${project.name}`,
              payload: {
                projectId: project.id,
                projectName: project.name,
                linearTeamKey: previous.linearTeamKey,
                jiraBaseUrl: previous.jiraBaseUrl,
                jiraEmail: previous.jiraEmail,
                linearCredentialConfigured: previous.linearCredentialConfigured,
                jiraCredentialConfigured: previous.jiraCredentialConfigured
              }
            },
            { signal: ctx.signal }
          );
          if (result.outcome === 'cancelled') {
            return {
              exitCode: 1,
              stderr: 'Credential update cancelled.\n'
            };
          }
          const parsedResponse =
            projectCredentialsInteractionResponseSchema.safeParse(result.value);
          if (!parsedResponse.success) {
            throw new Error('Credential form response was invalid');
          }
          const response = parsedResponse.data;
          const config = await persistProjectConfig(
            {
              projectId: previous.projectId,
              source: previous.source,
              linearTeamKey: previous.linearTeamKey,
              jiraBaseUrl: previous.jiraBaseUrl,
              jiraEmail: previous.jiraEmail,
              jiraJql: previous.jiraJql,
              linearCredential: response.linearCredential,
              jiraCredential: response.jiraCredential
            },
            { config: previous, revisions: snapshot.revisions }
          );
          return {
            exitCode: 0,
            stdout: args.json
              ? JSON.stringify(credentialStatus(config), null, 2)
              : formatCredentialStatus(config)
          };
        }
        throw new Error('Unknown bb taskboard command');
      } catch (error) {
        return { exitCode: 1, stderr: `${errorMessage(error)}\n` };
      }
    }
  });

  async function configuredLiveProjectIds(): Promise<string[]> {
    const liveProjectIds = new Set(
      (await listProjects()).map(project => project.id)
    );
    return store
      .configuredProjectIds()
      .filter(projectId => liveProjectIds.has(projectId));
  }

  async function migrateLegacyCredential(
    source: CredentialSource,
    liveProjectIds: ReadonlySet<string>
  ): Promise<void> {
    const selectedProjectIds = store
      .selectedProjectIds(source)
      .filter(projectId => liveProjectIds.has(projectId));
    const connectorStates = await Promise.all(
      selectedProjectIds.map(async projectId => ({
        projectId,
        credentialConfigured: await credentials.configured(projectId, source),
        scopeConfigured: (() => {
          const config = store.projectConfig(projectId, DEFAULT_PROJECT_CONFIG);
          return source === 'linear'
            ? Boolean(config.linearTeamKey)
            : Boolean(config.jiraBaseUrl && config.jiraEmail);
        })()
      }))
    );
    const unavailableProjectIds = connectorStates
      .filter(entry => !entry.credentialConfigured || !entry.scopeConfigured)
      .map(entry => entry.projectId);

    if (selectedProjectIds.length !== 1) {
      if (selectedProjectIds.length > 1) {
        for (const projectId of unavailableProjectIds) {
          invalidateSource(projectId, source);
        }
        await Promise.all(
          unavailableProjectIds.map(projectId =>
            enqueueMutation(projectId, [source], async () => undefined)
          )
        );
      }
      const result = await credentials.migrateLegacy(
        source,
        selectedProjectIds
      );
      if (result.outcome === 'ambiguous-projects') {
        bb.log.warn(
          `${sourceName(source)} legacy credential needs manual project assignment`
        );
      }
      return;
    }

    const projectId = selectedProjectIds[0]!;
    if (source === 'jira') {
      const config = store.projectConfig(projectId, DEFAULT_PROJECT_CONFIG);
      if (!config.jiraBaseUrl || !config.jiraEmail) {
        invalidateSource(projectId, source);
        await enqueueMutation(projectId, [source], async () => undefined);
        const result = await credentials.migrateLegacy(source, []);
        if (result.outcome === 'no-eligible-project') {
          bb.log.warn(
            'Jira legacy credential was preserved because the enabled project needs a Jira URL and email; assign the full credential bundle in Manage'
          );
        }
        return;
      }
    }
    if (unavailableProjectIds.includes(projectId)) {
      invalidateSource(projectId, source);
    }
    await enqueueMutation(projectId, [source], async () => {
      const result = await credentials.migrateLegacy(source, [projectId]);
      if (
        result.outcome === 'migrated' ||
        result.outcome === 'already-migrated'
      ) {
        bb.realtime.publish('taskboard:changed', {
          projectId,
          source
        });
      } else if (result.outcome === 'destination-conflict') {
        bb.log.warn(
          `${sourceName(source)} legacy credential conflicts with the configured project credential`
        );
      }
    });
  }

  async function migrateLegacyCredentials(): Promise<void> {
    await withExclusiveMigration(async () => {
      const liveProjectIds = new Set(
        (await listProjects()).map(project => project.id)
      );
      for (const source of CREDENTIAL_SOURCES) {
        await migrateLegacyCredential(source, liveProjectIds);
      }
    });
  }

  bb.background.service('sync', {
    async start(signal) {
      let legacyMigrationFinished = false;
      while (!signal.aborted) {
        if (!legacyMigrationFinished) {
          try {
            await migrateLegacyCredentials();
            legacyMigrationFinished = true;
          } catch (error) {
            bb.log.warn(
              `Legacy credential migration deferred: ${errorMessage(error)}`
            );
          }
        }
        try {
          const projectIds = await configuredLiveProjectIds();
          await Promise.all(
            projectIds.map(projectId => syncAll(projectId, undefined, false))
          );
        } catch (error) {
          bb.log.warn(`Background sync failed: ${errorMessage(error)}`);
        }
        await sleep(SYNC_INTERVAL_MS, signal);
      }
    }
  });

  bb.log.info(
    'Taskboard registered project-scoped Linear, GitHub, and Jira sources'
  );
}
