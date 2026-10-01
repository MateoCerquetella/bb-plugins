import { execFile } from 'node:child_process';
import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { CREATE_OUTCOME_UNCERTAIN_MARKER } from '../contract.js';
import type {
  ExternalWorkItemCreateInput,
  ExternalWorkItemDetail,
  ExternalWorkStatusOption,
  WorkSourceAdapter
} from './types.js';
import type { WorkStateCategory } from '../contract.js';
import { withoutComments } from './types.js';

/**
 * GitLab source adapter.
 *
 * Data access goes through the `glab` CLI (`glab api --hostname <host>`), the
 * same pattern the GitHub adapter uses with `gh`. Credentials come from glab's
 * own configuration (keyring), so Taskboard stores nothing secret.
 *
 * Workflow: GitLab has only native open/closed states, so team workflow columns
 * come from `status/<name>` labels. Moving a column replaces the previous
 * `status/*` label and closes/reopens the issue when the target column is
 * terminal (done/canceled) or left again.
 */

const STATUS_LABEL_PREFIX_PATTERN = /^status\/(.+)$/iu;

const GLAB_TIMEOUT_MS = 20_000;
const CREATE_TIMEOUT_MS = 30_000;

const glabUserSchema = z
  .object({ username: z.string() })
  .passthrough();

const glabIssueListSchema = z
  .array(
    z
      .object({
        iid: z.number().int().positive(),
        title: z.string(),
        state: z.string(),
        description: z.string().nullish(),
        labels: z.array(z.string()).default([]),
        web_url: z.string(),
        updated_at: z.string(),
        assignees: z.array(glabUserSchema).nullish().default([]),
        project_id: z.number().int().positive().nullish()
      })
      .passthrough()
  )
  .default([]);

const glabNoteSchema = z
  .object({
    body: z.string(),
    system: z.boolean().nullish().default(false),
    author: z
      .object({ username: z.string().nullish() })
      .passthrough()
      .nullish(),
    created_at: z.string().nullish()
  })
  .passthrough();

const glabIssueDetailSchema = z
  .object({
    iid: z.number().int().positive(),
    title: z.string(),
    state: z.string(),
    description: z.string().nullish(),
    labels: z.array(z.string()).default([]),
    web_url: z.string(),
    updated_at: z.string(),
    assignees: z.array(glabUserSchema).nullish().default([]),
    notes: z.array(glabNoteSchema).nullish().default([])
  })
  .passthrough();

const glabCreatedIssueSchema = z
  .object({
    iid: z.number().int().positive(),
    web_url: z.string().min(1),
    labels: z
      .array(
        z.union([
          z.string(),
          glabUserSchema,
          z.object({ name: z.string() }).passthrough()
        ])
      )
      .default([]),
    assignees: z.array(glabUserSchema).nullish().default([]),
    state: z.string().default('opened')
  })
  .passthrough();

const glabProjectLabelsSchema = z
  .array(z.object({ name: z.string() }).passthrough())
  .default([]);

const glabProjectMembersSchema = z
  .array(
    z
      .object({ id: z.number().int().positive(), username: z.string().min(1) })
      .passthrough()
  )
  .default([]);

const glabMilestonesSchema = z
  .array(
    z.object({ id: z.number().int().positive(), title: z.string() }).passthrough()
  )
  .default([]);

export interface GitlabStatusSnapshot {
  glabOk: boolean;
  glabError: string | null;
}

let resolvedGlabPath: string | null = null;

function runFile(
  file: string,
  args: string[],
  timeoutMs: number,
  stdinBody?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
        } else {
          resolve(stdout);
        }
      }
    );
    if (stdinBody !== undefined) {
      child.stdin?.end(stdinBody, 'utf8');
    }
  });
}

async function resolveGlabPath(): Promise<string> {
  if (resolvedGlabPath !== null) return resolvedGlabPath;
  for (const candidate of [
    'glab',
    '/opt/homebrew/bin/glab',
    '/usr/local/bin/glab'
  ]) {
    try {
      await runFile(candidate, ['--version'], 5_000);
      resolvedGlabPath = candidate;
      return candidate;
    } catch {
      // Try the next common GitLab CLI location.
    }
  }
  throw new Error('GitLab CLI (glab) is not available');
}

export function parseGitlabRef(ref: string): { host: string; path: string } {
  const firstSlash = ref.indexOf('/');
  const secondSlash = ref.indexOf('/', firstSlash + 1);
  if (
    firstSlash <= 0 ||
    secondSlash === -1 ||
    secondSlash + 1 >= ref.length
  ) {
    throw new Error(
      `GitLab project ref must be host/group/..., got: ${ref}`
    );
  }
  return {
    host: ref.slice(0, firstSlash),
    path: ref.slice(firstSlash + 1)
  };
}

export function issueLocator(ref: string, iid: number): string {
  return `${ref}#${iid}`;
}

export function parseIssueLocator(
  locator: string
): { ref: string; host: string; path: string; iid: number } {
  const match = /^(?<ref>[^#]+)#(?<iid>[1-9]\d*)$/u.exec(locator);
  if (!match?.groups) {
    throw new Error(`Invalid GitLab issue locator: ${locator}`);
  }
  const { ref } = match.groups;
  const { host, path } = parseGitlabRef(ref);
  return { ref, host, path, iid: Number(match.groups.iid) };
}

export function statusLabelCategory(
  labelName: string
): WorkStateCategory {
  const name = labelName.slice('status/'.length).toLowerCase();
  if (name === 'canceled' || name === 'cancelled') return 'canceled';
  if (name === 'backlog') return 'backlog';
  if (name === 'todo' || name === 'to do') return 'todo';
  if (
    name === 'done'
    || name.startsWith('done')
  ) {
    return 'done';
  }
  return 'in_progress';
}

export function statusLabels(labels: readonly string[]): string[] {
  return labels.filter(label => STATUS_LABEL_PREFIX_PATTERN.test(label));
}

export function issueStateCategory(
  labels: readonly string[],
  state: string
): WorkStateCategory {
  const status = statusLabels(labels)[0];
  if (status !== undefined) return statusLabelCategory(status);
  return state.toLowerCase() === 'closed' ? 'done' : 'todo';
}

export function issueStatusName(
  labels: readonly string[],
  state: string
): string {
  const status = statusLabels(labels)[0];
  if (status !== undefined) {
    return status.slice('status/'.length);
  }
  return state.toLowerCase() === 'closed' ? 'Closed' : 'Open';
}


export async function glabStatusProbe(
  hosts: readonly string[]
): Promise<GitlabStatusSnapshot> {
  let glabPath: string;
  try {
    glabPath = await resolveGlabPath();
  } catch (error) {
    return {
      glabOk: false,
      glabError: error instanceof Error ? error.message : String(error)
    };
  }
  const failures: string[] = [];
  for (const host of hosts) {
    try {
      await runFile(glabPath, ['api', '--hostname', host, 'user'], 10_000);
      return { glabOk: true, glabError: null };
    } catch (error) {
      failures.push(
        `${host}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return {
    glabOk: false,
    glabError:
      failures.length > 0
        ? failures.join('; ')
        : 'No authenticated GitLab host found'
  };
}

export class GitlabClient {
  private readonly glabPath: string;

  readonly host: string;

  constructor(glabPath: string, host: string) {
    if (!glabPath) {
      throw new Error('GitLab CLI (glab) is not available');
    }
    this.glabPath = glabPath;
    this.host = host;
  }

  static async forHost(host: string): Promise<GitlabClient> {
    let glabPath: string | null = null;
    let failure: string | null = null;
    try {
      glabPath = await resolveGlabPath();
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    if (glabPath === null) {
      throw new Error(
        `GitLab CLI (glab) is not available: ${failure ?? 'unknown error'}`
      );
    }
    return new GitlabClient(glabPath, host);
  }

  async api<T>(
    pathArgs: string[],
    options: {
      method?: string;
      fields?: string[];
      timeoutMs?: number;
      jsonBody?: unknown;
    } = {}
  ): Promise<T> {
    const glabPath = this.glabPath ?? (await resolveGlabPath());
    const bodyGiven = options.jsonBody !== undefined;
    const args = [
      'api',
      '--hostname',
      this.host,
      ...(options.method ? ['--method', options.method] : []),
      ...(bodyGiven
        ? ['--input', '-', '--header', 'Content-Type: application/json']
        : []),
      ...(options.fields
        ? options.fields.flatMap(field => ['--raw-field', field])
        : []),
      ...pathArgs
    ];
    const stdout = await runFile(
      glabPath,
      args,
      options.timeoutMs ?? GLAB_TIMEOUT_MS,
      bodyGiven ? JSON.stringify(options.jsonBody) : undefined
    );
    return (stdout.trim() ? JSON.parse(stdout) : null) as T;
  }
}

export function createGitlabAdapter(
  bb: BbPluginApi,
  enabled: boolean,
  projectId: string,
  projectRef: string,
  createClient: (host: string) => Promise<GitlabClient> = host =>
    GitlabClient.forHost(host)
): WorkSourceAdapter {
  // One client per host for the life of this adapter instance.
  const clientCache = new Map<string, Promise<GitlabClient>>();
  const clientFor = (host: string): Promise<GitlabClient> => {
    let entry = clientCache.get(host);
    if (entry === undefined) {
      entry = createClient(host).catch(error => {
        // A transient glab failure must not poison the per-host cache.
        clientCache.delete(host);
        throw error;
      });
      clientCache.set(host, entry);
    }
    return entry;
  };

  function requireRef(): { host: string; path: string; ref: string } {
    if (!enabled) throw new Error('GitLab is disabled');
    if (!projectRef) {
      throw new Error(
        'Choose a GitLab project (host/path) for this BB project in Manage.'
      );
    }
    const { host, path } = parseGitlabRef(projectRef);
    return { host, path, ref: projectRef };
  }

  function toIssue(
    value: z.infer<typeof glabIssueDetailSchema>,
    comments: ExternalWorkItemDetail['comments'] = []
  ): ExternalWorkItemDetail {
    return {
      source: 'gitlab',
      locator: issueLocator(projectRef, value.iid),
      key: `${projectRef}#${value.iid}`,
      title: value.title,
      description: value.description ?? '',
      url: value.web_url,
      status: issueStatusName(value.labels, value.state),
      stateCategory: issueStateCategory(value.labels, value.state),
      priority: null,
      assignee:
        (value.assignees ?? [])
          .flatMap(user => (user.username ? [user.username] : []))
          .join(', ') || null,
      project: projectRef,
      labels: value.labels ?? [],
      updatedAt: value.updated_at,
      comments
    };
  }

  function encodedPath(path: string): string {
    return encodeURIComponent(path);
  }

  async function scopedIssue(
    locator: string
  ): Promise<ExternalWorkItemDetail> {
    const { ref, host, path, iid } = parseIssueLocator(locator);
    if (ref !== projectRef) {
      throw new Error(
        `GitLab issue ${locator} is outside the configured project ${projectRef}`
      );
    }
    const client = await clientFor(host);
    const enc = encodedPath(path);
    const issue = await client.api<unknown>(
      [`projects/${enc}/issues/${iid}`],
      { timeoutMs: GLAB_TIMEOUT_MS }
    );
    const notesRaw: unknown[] = await apiArrayPage(
      client,
      `projects/${enc}/issues/${iid}/notes?sort=asc&order_by=created_at`
    );
    const parsed = glabIssueDetailSchema.parse({
      ...(typeof issue === 'object' && issue !== null ? issue : {}),
      notes: notesRaw
    });
    if (parsed.iid !== iid) {
      throw new Error(`GitLab returned the wrong issue for ${locator}`);
    }
    const comments = (parsed.notes ?? [])
      .filter(note => !note.system && note.body.trim().length > 0)
      .map(note => ({
        author: note.author?.username ?? 'unknown',
        body: note.body,
        createdAt: note.created_at ?? ''
      }));
    return toIssue(parsed, comments);
  }

  async function apiArrayPage(
    client: GitlabClient,
    pathSuffix: string,
    timeoutMs = GLAB_TIMEOUT_MS
  ): Promise<unknown[]> {
    const all: unknown[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const rows = await client.api<unknown>(
        [
          `${pathSuffix}${pathSuffix.includes('?') ? '&' : '?'}per_page=100&page=${page}`
        ],
        { timeoutMs }
      );
      const batch = Array.isArray(rows) ? rows : [];
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  }

  async function projectWorkflowLabels(
    client: GitlabClient,
    encPath: string
  ): Promise<string[]> {
    const raw = await client.api<unknown>(
      [`projects/${encPath}/labels?per_page=100`]
    );
    const parsed = glabProjectLabelsSchema.parse(raw).map(l => l.name);
    return statusLabels(parsed);
  }

  function nativeOptions(closed: boolean): ExternalWorkStatusOption[] {
    return [
      { id: '__open__', name: 'Open', stateCategory: 'todo', current: !closed },
      { id: '__closed__', name: 'Closed', stateCategory: 'done', current: closed }
    ];
  }

  async function applyStatusChange(
    iid: number,
    statusId: string,
    before: { labels: readonly string[]; nativeState: string }
  ): Promise<ExternalWorkItemDetail> {
    const { host, path } = requireRef();
    const client = await clientFor(host);
    const enc = encodedPath(path);
    const issuePath = `projects/${enc}/issues/${iid}`;

    if (statusId === '__closed__') {
      await client.api<unknown>([issuePath], {
        method: 'PUT',
        jsonBody: { state_event: 'close' },
        timeoutMs: CREATE_TIMEOUT_MS
      });
      return scopedIssue(issueLocator(projectRef, iid));
    }
    if (statusId === '__open__') {
      // Back to untriaged: drop every status/* label and re-open.
      const remaining = before.labels.filter(
        label => !STATUS_LABEL_PREFIX_PATTERN.test(label)
      );
      await client.api<unknown>([issuePath], {
        method: 'PUT',
        jsonBody: { labels: remaining, state_event: 'reopen' },
        timeoutMs: CREATE_TIMEOUT_MS
      });
      return scopedIssue(issueLocator(projectRef, iid));
    }

    // Label-driven move: all previous status labels out, the new one in.
    const nextCategory = statusLabelCategory(statusId);
    const stateEvent =
      nextCategory === 'done' || nextCategory === 'canceled'
        ? 'close'
        : (before.nativeState ?? '').toLowerCase() === 'closed'
          ? 'reopen'
          : null;
    const otherLabels = before.labels.filter(
      label => !STATUS_LABEL_PREFIX_PATTERN.test(label)
    );
    await client.api<unknown>([issuePath], {
      method: 'PUT',
      jsonBody: {
        labels: [...otherLabels, statusId],
        ...(stateEvent ? { state_event: stateEvent } : {})
      },
      timeoutMs: CREATE_TIMEOUT_MS
    });
    return scopedIssue(issueLocator(projectRef, iid));
  }

  async function computeStatusOptions(
    client: GitlabClient,
    encPath: string,
    issue: ExternalWorkItemDetail
  ): Promise<ExternalWorkStatusOption[]> {
    const currentStatus = statusLabels(issue.labels)[0] ?? null;
    const closed =
      issue.stateCategory === 'done' || issue.stateCategory === 'canceled';
    // Native open/closed always stay available: every issue has a native
    // state regardless of workflow labels.
    const native = nativeOptions(closed && currentStatus === null);
    const workflowLabels = await projectWorkflowLabels(client, encPath);
    if (workflowLabels.length === 0 && currentStatus === null) {
      return native;
    }
    const names = new Set(workflowLabels);
    if (currentStatus !== null) names.add(currentStatus);
    const labelOptions: ExternalWorkStatusOption[] = [...names]
      .sort((a, b) => a.localeCompare(b))
      .map(label => ({
        id: label,
        name: label.slice('status/'.length),
        stateCategory: statusLabelCategory(label),
        current: label === currentStatus
      }));
    return [...native, ...labelOptions];
  }

  return {
    source: 'gitlab',
    configured: () => enabled,
    configurationMessage: () =>
      enabled
        ? null
        : 'Enable glab CLI authentication for this GitLab host.',
    async list(options?: { refresh?: boolean }) {
      if (!enabled) throw new Error('GitLab is disabled');
      const { host, path, ref } = requireRef();
      if (!ref) throw new Error('GitLab project is not configured');
      const client = await clientFor(host);
      const enc = encodedPath(path);
      const issues = await apiArrayPage(
        client,
        `projects/${enc}/issues?state=all&order_by=updated_at&sort=desc`
      );
      const parsed = glabIssueListSchema.parse(issues);
      return parsed.map(issue => withoutComments(toIssue({ ...issue, notes: [] })));
    },
    async get(locator: string) {
      return scopedIssue(locator);
    },
    async statusOptions(locator: string): Promise<ExternalWorkStatusOption[]> {
      const issue = await scopedIssue(locator);
      const { host, path } = parseGitlabRef(projectRef);
      const client = await clientFor(host);
      const enc = encodedPath(path);
      return computeStatusOptions(client, enc, issue);
    },
    async createMetadata() {
      const { host, path } = requireRef();
      const client = await clientFor(host);
      const enc = encodedPath(path);
      const [membersRaw, labelsRaw, milestonesRaw] = await Promise.all([
        apiArrayPage(client, `projects/${enc}/members?query=`),
        apiArrayPage(client, `projects/${enc}/labels`),
        apiArrayPage(client, `projects/${enc}/milestones?state=active`)
      ]);
      const members = glabProjectMembersSchema.parse(membersRaw);
      const projectLabels = glabProjectLabelsSchema.parse(labelsRaw);
      const milestones = glabMilestonesSchema.parse(milestonesRaw);
      const workflowLabels = statusLabels(projectLabels.map(l => l.name));
      return {
        statusOptions: [
          ...workflowLabels.map(label => ({
            id: label,
            label: label.slice('status/'.length)
          })),
          { id: '__open__', label: 'Open' }
        ],
        assigneeOptions: members.map(user => ({
          id: String(user.id),
          label: `@${user.username}`
        })),
        priorityOptions: [],
        labelOptions: projectLabels
          .filter(label => !STATUS_LABEL_PREFIX_PATTERN.test(label.name))
          .map(label => ({ id: label.name, label: label.name })),
        milestoneOptions: milestones.map(milestone => ({
          id: String(milestone.id),
          label: milestone.title
        })),
        issueTypeOptions: [],
        defaultStatusId: null,
        defaultIssueTypeId: null,
        supportsDueDate: true
      };
    },
    async create(input: ExternalWorkItemCreateInput) {
      if (!enabled) throw new Error('GitLab is disabled');
      const { host, path } = requireRef();
      if (input.destinationId !== projectRef && input.destinationId !== '') {
        throw new Error(
          `GitLab project ${input.destinationId} is outside the configured scope`
        );
      }
      if (input.priorityId !== null) {
        throw new Error('GitLab issues do not support a native priority');
      }
      if (input.issueType !== null) {
        throw new Error('GitLab issues do not support issue types');
      }
      const client = await clientFor(host);
      const enc = encodedPath(path);
      const createBody: Record<string, unknown> = {
        title: input.title,
        description: input.description,
        ...(input.assigneeId
          ? { assignee_ids: [Number(input.assigneeId)] }
          : {}),
        ...(input.labelIds.length > 0
          ? { labels: input.labelIds }
          : {}),
        ...(input.dueDate ? { due_date: input.dueDate } : {}),
        ...(input.milestoneId
          ? { milestone_id: Number(input.milestoneId) }
          : {})
      };
      // The write may commit even when the response is lost or malformed —
      // same uncertainty handling as the GitHub adapter.
      let created: z.infer<typeof glabCreatedIssueSchema>;
      try {
        created = glabCreatedIssueSchema.parse(
          await client.api<unknown>([`projects/${enc}/issues`], {
            method: 'POST',
            jsonBody: createBody,
            timeoutMs: CREATE_TIMEOUT_MS
          })
        );
        const createdLabels = created.labels
          .map(label =>
            typeof label === 'string'
              ? label
              : (
                  (label as { name?: unknown }).name ?? ''
                ).toString()
          )
          .filter(label => label.length > 0);
        const createdAssignees = (created.assignees ?? [])
          .flatMap(user => (user.username ? [user.username] : []));
        const detail = glabIssueDetailSchema.parse({
          ...created,
          labels: createdLabels,
          title: input.title,
          description: input.description,
          updated_at: new Date().toISOString(),
          assignees: [],
          notes: []
        });
        const warnings: string[] = [];
        if (createdAssignees.length === 0 && input.assigneeId) {
          warnings.push('GitLab dropped the requested assignee.');
        }
        const requestedExtras = input.labelIds.filter(
          label => label !== input.statusId
        );
        if (
          input.labelIds.length > 0 &&
          !requestedExtras.every(extra => createdLabels.includes(extra))
        ) {
          warnings.push('Some requested labels were not accepted by GitLab.');
        }
        let item: ExternalWorkItemDetail = toIssue(detail, []);
        if (input.statusId && input.statusId !== '__open__') {
          // Create stays native-open; the chosen column is applied through
          // the shared label/state move path so terminal closes work the
          // same way as manual moves.
          try {
            item = await applyStatusChange(
              detail.iid,
              input.statusId,
              { labels: createdLabels, nativeState: created.state ?? 'opened' }
            );
            warnings.push(`Issue created and moved to ${input.statusId}.`);
          } catch {
            warnings.push(
              `Issue created, but moving it to ${input.statusId} failed; move it manually.`
            );
          }
        }
        return {
          item,
          warnings,
          assigneeConfirmation: {
            confirmed: true,
            id: createdAssignees[0] ?? null
          }
        };
      } catch {
        throw new Error(
          `${CREATE_OUTCOME_UNCERTAIN_MARKER} GitLab may have created the issue, but Taskboard could not confirm its details. Refresh the board and check for it before trying again.`
        );
      }
    },
    async updateStatus(
      locator: string,
      statusId: string
    ): Promise<ExternalWorkItemDetail> {
      const { ref, host, path, iid } = parseIssueLocator(locator);
      if (ref !== projectRef) {
        throw new Error(
          `GitLab issue ${locator} is outside the configured project ${projectRef}`
        );
      }
      const client = await clientFor(host);
      const enc = encodedPath(path);
      const issueBefore = glabIssueDetailSchema.parse(
        await client.api<unknown>([`projects/${enc}/issues/${iid}`])
      );
      const before = toIssue({ ...issueBefore, notes: [] });
      const available = await computeStatusOptions(client, enc, before);
      const target = available.find(option => option.id === statusId);
      if (!target) {
        throw new Error('GitLab status is not available for this issue');
      }
      if (target.current) return scopedIssue(locator);
      await applyStatusChange(iid, statusId, {
        labels: before.labels,
        nativeState: issueBefore.state
      });
      return scopedIssue(locator);
    }
  } satisfies WorkSourceAdapter;
}
