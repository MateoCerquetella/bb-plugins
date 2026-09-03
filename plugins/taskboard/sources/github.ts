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
import { withoutComments } from './types.js';

const githubItemSchema = z
  .object({
    repo: z.string(),
    number: z.number().int().positive(),
    kind: z.enum(['issue', 'pr']),
    title: z.string(),
    state: z.string(),
    author: z.string(),
    labels: z.array(z.string()),
    assignees: z.array(z.string()),
    url: z.string(),
    body: z.string(),
    updatedAt: z.string()
  })
  .strict();

const listOutputSchema = z
  .object({ items: z.array(githubItemSchema) })
  .strict();

const detailOutputSchema = z
  .object({
    issue: githubItemSchema
      .omit({ kind: true })
      .extend({
        comments: z.array(
          z
            .object({
              author: z.string(),
              body: z.string(),
              createdAt: z.string()
            })
            .strict()
        )
      })
      .strict()
  })
  .strict();

export const githubStatusOutputSchema = z
  .object({
    ghOk: z.boolean(),
    // Added by the GitHub plugin in bb 0.41; optional so older plugins still parse.
    ghState: z.enum(["ready", "needs_configuration", "unavailable"]).optional(),
    ghError: z.string().nullable(),
    repos: z.array(
      z.object({ repo: z.string(), projectId: z.string().nullable() }).strict()
    ),
    lastSyncedAt: z.string().nullable()
  })
  .strict();

const refreshOutputSchema = z
  .object({
    repos: z.number().int().nonnegative(),
    items: z.number().int().nonnegative()
  })
  .strict();

const okOutputSchema = z.object({ ok: z.literal(true) }).strict();

const githubAssigneeSchema = z
  .object({ login: z.string().min(1) })
  .passthrough();
const paginatedGithubAssigneesSchema = z.array(
  z.array(githubAssigneeSchema)
);
const githubLabelSchema = z
  .object({ name: z.string().min(1) })
  .passthrough();
const paginatedGithubLabelsSchema = z.array(z.array(githubLabelSchema));
const githubMilestoneSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string().min(1),
    due_on: z.string().nullable().optional()
  })
  .passthrough();
const paginatedGithubMilestonesSchema = z.array(
  z.array(githubMilestoneSchema)
);
const createdGithubIssueSchema = z
  .object({
    number: z.number().int().positive(),
    html_url: z.string().min(1),
    assignees: z
      .array(z.object({ login: z.string().min(1) }).passthrough()),
    labels: z
      .array(
        z.union([
          z.string(),
          z.object({ name: z.string().min(1) }).passthrough()
        ])
      )
      .default([]),
    milestone: z
      .object({ number: z.number().int().positive() })
      .passthrough()
      .nullable()
      .default(null)
  })
  .passthrough();

interface ActiveGithubRefresh {
  mutationRevision: number;
  promise: Promise<void>;
}

const githubMutationRevisions = new WeakMap<BbPluginApi, number>();
const activeRefreshes = new WeakMap<BbPluginApi, ActiveGithubRefresh>();
let resolvedGhPath: string | null = null;

function runFile(
  file: string,
  args: string[],
  timeoutMs = 20_000
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
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
  });
}

async function resolveGhPath(): Promise<string> {
  if (resolvedGhPath !== null) return resolvedGhPath;
  for (const candidate of [
    'gh',
    '/opt/homebrew/bin/gh',
    '/usr/local/bin/gh'
  ]) {
    try {
      await runFile(candidate, ['--version'], 5_000);
      resolvedGhPath = candidate;
      return candidate;
    } catch {
      // Try the next common GitHub CLI location.
    }
  }
  throw new Error('GitHub CLI is not available');
}

async function runGh(args: string[], timeoutMs?: number): Promise<string> {
  return runFile(await resolveGhPath(), args, timeoutMs);
}

function milestoneLabel(milestone: z.infer<typeof githubMilestoneSchema>) {
  const dueDate = milestone.due_on?.slice(0, 10);
  return dueDate ? `${milestone.title} · ${dueDate}` : milestone.title;
}

function uniqueByIdentity<T>(
  values: readonly T[],
  identity: (value: T) => string
): T[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = identity(value).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function markGithubCacheStale(bb: BbPluginApi): void {
  githubMutationRevisions.set(
    bb,
    (githubMutationRevisions.get(bb) ?? 0) + 1
  );
}

function refreshGithubCache(bb: BbPluginApi): Promise<void> {
  const mutationRevision = githubMutationRevisions.get(bb) ?? 0;
  const active = activeRefreshes.get(bb);
  if (active && active.mutationRevision >= mutationRevision) {
    return active.promise;
  }
  const run = () =>
    bb.sdk.plugins
      .callRpc({
        pluginId: 'github',
        method: 'refresh',
        input: null,
        outputSchema: refreshOutputSchema
      })
      .then(() => undefined);
  const pending = active
    ? active.promise.then(run, run)
    : run();
  const promise = pending.finally(() => {
    if (activeRefreshes.get(bb)?.promise === promise) {
      activeRefreshes.delete(bb);
    }
  });
  activeRefreshes.set(bb, { mutationRevision, promise });
  return promise;
}

export function loadGithubStatus(bb: BbPluginApi) {
  return bb.sdk.plugins.callRpc({
    pluginId: 'github',
    method: 'status',
    input: null,
    outputSchema: githubStatusOutputSchema
  });
}

export type GithubStatus = z.infer<typeof githubStatusOutputSchema>;

export function githubReposForProject(
  status: GithubStatus,
  projectId: string
): string[] {
  return [
    ...new Set(
      status.repos
        .filter(repo => repo.projectId === projectId)
        .map(repo => repo.repo)
    )
  ];
}

function toItem(
  value: z.infer<typeof githubItemSchema>,
  comments: ExternalWorkItemDetail['comments'] = []
): ExternalWorkItemDetail {
  const open = value.state.toLowerCase() === 'open';
  return {
    source: 'github',
    locator: `${value.repo}#${value.number}`,
    key: `${value.repo}#${value.number}`,
    title: value.title,
    description: value.body,
    url: value.url,
    status: value.state,
    stateCategory: open ? 'todo' : 'done',
    priority: null,
    assignee: value.assignees.join(', ') || null,
    project: value.repo,
    labels: value.labels,
    updatedAt: value.updatedAt,
    comments
  };
}

function parseLocator(locator: string): { repo: string; number: number } {
  const match = /^(?<repo>[^#]+)#(?<number>[1-9]\d*)$/u.exec(locator);
  if (!match?.groups)
    throw new Error(`Invalid GitHub issue locator: ${locator}`);
  return { repo: match.groups.repo!, number: Number(match.groups.number) };
}

export function createGithubAdapter(
  bb: BbPluginApi,
  enabled: boolean,
  projectId: string,
  runGithubCli: (args: string[], timeoutMs?: number) => Promise<string> = runGh
): WorkSourceAdapter {
  async function scopedIssue(locator: string): Promise<ExternalWorkItemDetail> {
    const { repo, number } = parseLocator(locator);
    const status = await loadGithubStatus(bb);
    if (!status.ghOk) {
      throw new Error(status.ghError ?? 'GitHub is not authenticated');
    }
    if (!githubReposForProject(status, projectId).includes(repo)) {
      throw new Error(
        `GitHub repository ${repo} is not mapped to BB project ${projectId}`
      );
    }
    const result = await bb.sdk.plugins.callRpc({
      pluginId: 'github',
      method: 'getIssue',
      input: { repo, number },
      outputSchema: detailOutputSchema
    });
    if (result.issue.repo !== repo || result.issue.number !== number) {
      throw new Error(`GitHub returned the wrong issue for ${locator}`);
    }
    return toItem({ ...result.issue, kind: 'issue' }, result.issue.comments);
  }

  async function statusOptions(
    locator: string
  ): Promise<ExternalWorkStatusOption[]> {
    const issue = await scopedIssue(locator);
    const current = issue.status.toLowerCase() === 'open' ? 'open' : 'closed';
    return [
      {
        id: 'open',
        name: 'Open',
        stateCategory: 'todo',
        current: current === 'open'
      },
      {
        id: 'closed',
        name: 'Closed',
        stateCategory: 'done',
        current: current === 'closed'
      }
    ];
  }

  async function assertMappedRepository(repo: string): Promise<void> {
    const status = await loadGithubStatus(bb);
    if (!status.ghOk) {
      throw new Error(status.ghError ?? 'GitHub is not authenticated');
    }
    if (!githubReposForProject(status, projectId).includes(repo)) {
      throw new Error(
        `GitHub repository ${repo} is not mapped to this BB project`
      );
    }
  }

  return {
    source: 'github',
    configured: () => enabled,
    configurationMessage: () =>
      enabled ? null : 'Enable GitHub in Taskboard settings.',
    async list(options) {
      if (!enabled) throw new Error('GitHub is disabled');
      if (options?.refresh) await refreshGithubCache(bb);
      const status = await loadGithubStatus(bb);
      if (!status.ghOk) {
        throw new Error(status.ghError ?? 'GitHub is not authenticated');
      }
      const repos = githubReposForProject(status, projectId);
      const results = await Promise.all(
        repos.map(async repo => ({
          repo,
          result: await bb.sdk.plugins.callRpc({
            pluginId: 'github',
            method: 'listItems',
            input: { kind: 'issue', repo },
            outputSchema: listOutputSchema
          })
        }))
      );
      return results.flatMap(({ repo, result }) =>
        result.items.map(item => {
          if (item.repo !== repo || item.kind !== 'issue') {
            throw new Error(
              `GitHub returned an item outside requested repository ${repo}`
            );
          }
          return withoutComments(toItem(item));
        })
      );
    },
    async get(locator) {
      if (!enabled) throw new Error('GitHub is disabled');
      return scopedIssue(locator);
    },
    async statusOptions(locator) {
      if (!enabled) throw new Error('GitHub is disabled');
      return statusOptions(locator);
    },
    async createMetadata(input) {
      if (!enabled) throw new Error('GitHub is disabled');
      await assertMappedRepository(input.destinationId);
      const [users, labels, milestones] = await Promise.all([
        runGithubCli(
          [
            'api',
            '--paginate',
            '--slurp',
            `repos/${input.destinationId}/assignees?per_page=100`
          ],
          30_000
        ).then(output =>
          uniqueByIdentity(
            paginatedGithubAssigneesSchema
              .parse(JSON.parse(output))
              .flat(),
            user => user.login
          )
        ),
        runGithubCli(
          [
            'api',
            '--paginate',
            '--slurp',
            `repos/${input.destinationId}/labels?per_page=100`
          ],
          30_000
        ).then(output =>
          uniqueByIdentity(
            paginatedGithubLabelsSchema.parse(JSON.parse(output)).flat(),
            label => label.name
          )
        ),
        runGithubCli(
          [
            'api',
            '--paginate',
            '--slurp',
            `repos/${input.destinationId}/milestones?state=open&per_page=100`
          ],
          30_000
        )
          .then(output =>
            uniqueByIdentity(
              paginatedGithubMilestonesSchema
                .parse(JSON.parse(output))
                .flat(),
              milestone => String(milestone.number)
            )
          )
          .catch(() => [])
      ]);
      return {
        statusOptions: [],
        assigneeOptions: users.map(user => ({
          id: user.login,
          label: `@${user.login}`
        })),
        priorityOptions: [],
        labelOptions: labels.map(label => ({
          id: label.name,
          label: label.name
        })),
        milestoneOptions: milestones.map(milestone => ({
          id: String(milestone.number),
          label: milestoneLabel(milestone)
        })),
        issueTypeOptions: [],
        defaultStatusId: null,
        defaultIssueTypeId: null,
        supportsDueDate: false
      };
    },
    async create(input: ExternalWorkItemCreateInput) {
      if (!enabled) throw new Error('GitHub is disabled');
      await assertMappedRepository(input.destinationId);
      if (input.dueDate !== null || input.priorityId !== null) {
        throw new Error(
          'GitHub issues use milestones instead of direct due dates or priorities'
        );
      }
      if (input.statusId !== null && input.statusId !== 'open') {
        throw new Error('GitHub issues are created open');
      }
      const milestone =
        input.milestoneId === null ? null : Number(input.milestoneId);
      if (
        milestone !== null &&
        (!Number.isSafeInteger(milestone) || milestone < 1)
      ) {
        throw new Error('GitHub milestone is invalid');
      }
      const args = [
        'api',
        '--method',
        'POST',
        `repos/${input.destinationId}/issues`,
        '--raw-field',
        `title=${input.title}`,
        '--raw-field',
        `body=${input.description}`,
        ...input.assigneeId
          ? ['--raw-field', `assignees[]=${input.assigneeId}`]
          : [],
        ...input.labelIds.flatMap(label => [
          '--raw-field',
          `labels[]=${label}`
        ]),
        ...(milestone !== null
          ? ['--field', `milestone=${milestone}`]
          : [])
      ];
      // The write may commit even when the response is lost or malformed.
      // Advance before attempting it so reconciliation never reuses a refresh
      // that began before this possibly-committed mutation.
      markGithubCacheStale(bb);
      let created: z.infer<typeof createdGithubIssueSchema>;
      try {
        created = createdGithubIssueSchema.parse(
          JSON.parse(await runGithubCli(args, 30_000))
        );
      } catch {
        throw new Error(
          `${CREATE_OUTCOME_UNCERTAIN_MARKER} GitHub may have created the issue, but Taskboard could not confirm the response. Refresh the board and check for it before trying again.`
        );
      }
      const createdAssignees = created.assignees.map(assignee => assignee.login);
      const createdLabels = created.labels.map(label =>
        typeof label === 'string' ? label : label.name
      );
      const returnedAssignees = new Set(
        createdAssignees
      );
      const returnedLabels = new Set(createdLabels);
      const confirmedId =
        (input.assigneeId && returnedAssignees.has(input.assigneeId)
          ? input.assigneeId
          : createdAssignees[0]) ?? null;
      const warnings: string[] = [];
      if (input.assigneeId && !returnedAssignees.has(input.assigneeId)) {
        warnings.push(
          `GitHub created the issue but could not assign @${input.assigneeId}.`
        );
      }
      const missingLabels = input.labelIds.filter(
        label => !returnedLabels.has(label)
      );
      if (missingLabels.length > 0) {
        warnings.push(
          `GitHub created the issue without ${missingLabels.join(', ')}.`
        );
      }
      if (milestone !== null && created.milestone?.number !== milestone) {
        warnings.push(
          'GitHub created the issue but could not attach the selected milestone.'
        );
      }
      return {
        item: {
          source: 'github',
          locator: `${input.destinationId}#${created.number}`,
          key: `${input.destinationId}#${created.number}`,
          title: input.title,
          description: input.description,
          url: created.html_url,
          status: 'OPEN',
          stateCategory: 'todo',
          priority: null,
          assignee: createdAssignees.join(', ') || null,
          project: input.destinationId,
          labels: createdLabels,
          updatedAt: new Date().toISOString(),
          comments: []
        },
        warnings,
        assigneeConfirmation: {
          confirmed: true,
          id: confirmedId
        }
      };
    },
    async updateStatus(locator, statusId) {
      if (!enabled) throw new Error('GitHub is disabled');
      const available = await statusOptions(locator);
      const target = available.find(option => option.id === statusId);
      if (!target) {
        throw new Error('GitHub status is not available for this issue');
      }
      if (!target.current) {
        const { repo, number } = parseLocator(locator);
        await bb.sdk.plugins.callRpc({
          pluginId: 'github',
          method: 'setIssueState',
          input: { repo, number, state: statusId },
          outputSchema: okOutputSchema
        });
      }
      return scopedIssue(locator);
    }
  };
}
