import { execFile } from 'node:child_process';
import { z } from 'zod';
import { CREATE_OUTCOME_UNCERTAIN_MARKER } from '../contract.js';
import type {
  ExternalWorkItemCreateInput,
  ExternalWorkItemDetail,
  ExternalWorkStatusOption,
  WorkSourceAdapter
} from './types.js';
import { withoutComments } from './types.js';

const GITHUB_HOST = 'github.com';
const GITHUB_TIMEOUT_MS = 30_000;

const githubRepositorySchema = z
  .string()
  .regex(
    /^(?!\.{1,2}(?:\/|$))[A-Za-z0-9_.-]+\/(?!\.{1,2}$)[A-Za-z0-9_.-]+$/u,
    'GitHub repository must be owner/repo'
  );

const githubIssueSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string(),
    state: z.enum(['open', 'closed']),
    user: z.object({ login: z.string() }).passthrough(),
    labels: z.array(
      z.union([
        z.string(),
        z.object({ name: z.string().nullable() }).passthrough()
      ])
    ),
    assignees: z.array(
      z.object({ login: z.string() }).passthrough()
    ),
    html_url: z.string().url(),
    body: z.string().nullable(),
    updated_at: z.string(),
    pull_request: z.unknown().optional()
  })
  .passthrough();

const githubIssueListSchema = z.array(githubIssueSchema);
const githubCommentSchema = z
  .object({
    user: z.object({ login: z.string() }).passthrough(),
    body: z.string().nullable(),
    created_at: z.string()
  })
  .passthrough();
const paginatedGithubCommentsSchema = z.array(z.array(githubCommentSchema));
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
const createdGithubIssueSchema = githubIssueSchema.extend({
  milestone: z
    .object({ number: z.number().int().positive() })
    .passthrough()
    .nullable()
    .default(null)
});

export type GithubCliRunner = (
  args: string[],
  timeoutMs?: number
) => Promise<string>;

export type GitRunner = (
  cwd: string,
  args: string[],
  timeoutMs?: number
) => Promise<string>;

export interface GithubProject {
  gitRemoteUrl: string | null;
  sources: readonly {
    type: 'local_path';
    hostId: string;
    path: string;
  }[];
}

let resolvedGhPath: string | null = null;

function runFile(
  file: string,
  args: string[],
  timeoutMs = 20_000,
  env = process.env
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { env, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
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
  throw new Error(
    'GitHub CLI is not available. Install gh and run "gh auth login --hostname github.com".'
  );
}

async function runGh(args: string[], timeoutMs?: number): Promise<string> {
  return runFile(await resolveGhPath(), args, timeoutMs, {
    ...process.env,
    GH_HOST: GITHUB_HOST
  });
}

const runGit: GitRunner = (cwd, args, timeoutMs) =>
  runFile('git', ['-C', cwd, ...args], timeoutMs);

export function parseGithubRepoFromRemote(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const ssh =
    /^git@github\.com:(?<repo>[^/\s]+\/[^/\s]+?)(?:\.git)?$/iu.exec(trimmed);
  if (ssh?.groups?.repo) {
    const parsed = githubRepositorySchema.safeParse(ssh.groups.repo);
    return parsed.success ? parsed.data : null;
  }
  try {
    const url = new URL(trimmed);
    if (url.hostname.toLowerCase() !== GITHUB_HOST) return null;
    const path = url.pathname
      .replace(/^\/+|\/+$/gu, '')
      .replace(/\.git$/iu, '');
    const parsed = githubRepositorySchema.safeParse(path);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function discoverGithubRepositories(options: {
  project: GithubProject;
  primaryHostId: string | null;
  runGit?: GitRunner;
}): Promise<string[]> {
  const sources = options.primaryHostId
    ? options.project.sources.filter(
        source => source.hostId === options.primaryHostId
      )
    : [];
  const runner = options.runGit ?? runGit;
  const remotes = await Promise.allSettled(
    sources.map(source =>
      runner(source.path, ['remote', 'get-url', 'origin'], 5_000)
    )
  );
  const readableRemotes = remotes.flatMap(result =>
    result.status === 'fulfilled' ? [result.value] : []
  );
  const candidates =
    readableRemotes.length > 0
      ? readableRemotes
      : [options.project.gitRemoteUrl];
  return [
    ...new Set(
      candidates
        .map(parseGithubRepoFromRemote)
        .filter((repo): repo is string => repo !== null)
    )
  ];
}

function githubArgs(...args: string[]): string[] {
  return ['api', '--hostname', GITHUB_HOST, ...args];
}

async function assertGithubReady(runGithubCli: GithubCliRunner): Promise<void> {
  try {
    await runGithubCli(
      ['auth', 'status', '--hostname', GITHUB_HOST, '--active'],
      10_000
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `GitHub CLI is not authenticated for github.com. Run "gh auth login --hostname github.com". ${detail}`
    );
  }
}

function parseJson(output: string): unknown {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error('GitHub CLI returned malformed JSON');
  }
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

function issueLabels(issue: z.infer<typeof githubIssueSchema>): string[] {
  return issue.labels.flatMap(label =>
    typeof label === 'string' ? [label] : label.name ? [label.name] : []
  );
}

function toItem(
  repo: string,
  issue: z.infer<typeof githubIssueSchema>,
  comments: ExternalWorkItemDetail['comments'] = []
): ExternalWorkItemDetail {
  const open = issue.state === 'open';
  return {
    source: 'github',
    locator: `${repo}#${issue.number}`,
    key: `${repo}#${issue.number}`,
    title: issue.title,
    description: issue.body ?? '',
    url: issue.html_url,
    status: open ? 'OPEN' : 'CLOSED',
    stateCategory: open ? 'todo' : 'done',
    priority: null,
    assignee: issue.assignees.map(value => value.login).join(', ') || null,
    project: repo,
    labels: issueLabels(issue),
    updatedAt: issue.updated_at,
    comments
  };
}

function parseLocator(locator: string): { repo: string; number: number } {
  const match = /^(?<repo>[^#]+)#(?<number>[1-9]\d*)$/u.exec(locator);
  if (!match?.groups) {
    throw new Error(`Invalid GitHub issue locator: ${locator}`);
  }
  const repo = githubRepositorySchema.safeParse(match.groups.repo);
  if (!repo.success) {
    throw new Error(`Invalid GitHub issue locator: ${locator}`);
  }
  return { repo: repo.data, number: Number(match.groups.number) };
}

export function createGithubAdapter(options: {
  enabled: boolean;
  repositories: readonly string[];
  runGithubCli?: GithubCliRunner;
}): WorkSourceAdapter {
  const repositories = [
    ...new Set(options.repositories.map(repo => githubRepositorySchema.parse(repo)))
  ];
  const repositoryByIdentity = new Map(
    repositories.map(repo => [repo.toLowerCase(), repo])
  );
  const runGithubCli = options.runGithubCli ?? runGh;

  function scopedRepository(repo: string): string {
    const parsed = githubRepositorySchema.safeParse(repo);
    if (!parsed.success) {
      throw new Error(`Invalid GitHub repository: ${repo}`);
    }
    const scoped = repositoryByIdentity.get(parsed.data.toLowerCase());
    if (!scoped) {
      throw new Error(
        `GitHub repository ${repo} is outside this BB project's repository scope`
      );
    }
    return scoped;
  }

  function assertConfigured(): void {
    if (!options.enabled) throw new Error('GitHub is disabled');
    if (repositories.length === 0) {
      throw new Error(
        'No GitHub repository is mapped to this BB project on the current host'
      );
    }
  }

  async function loadIssue(
    repo: string,
    number: number
  ): Promise<z.infer<typeof githubIssueSchema>> {
    const issue = githubIssueSchema.parse(
      parseJson(
        await runGithubCli(
          githubArgs(`repos/${repo}/issues/${number}`),
          GITHUB_TIMEOUT_MS
        )
      )
    );
    if (issue.pull_request !== undefined) {
      throw new Error(`${repo}#${number} is a pull request, not an issue`);
    }
    if (issue.number !== number) {
      throw new Error(`GitHub returned the wrong issue for ${repo}#${number}`);
    }
    return issue;
  }

  async function scopedIssue(locator: string): Promise<ExternalWorkItemDetail> {
    assertConfigured();
    const parsed = parseLocator(locator);
    const repo = scopedRepository(parsed.repo);
    await assertGithubReady(runGithubCli);
    const [issue, comments] = await Promise.all([
      loadIssue(repo, parsed.number),
      runGithubCli(
        githubArgs(
          '--paginate',
          '--slurp',
          `repos/${repo}/issues/${parsed.number}/comments?per_page=100`
        ),
        GITHUB_TIMEOUT_MS
      ).then(output =>
        paginatedGithubCommentsSchema.parse(parseJson(output)).flat()
      )
    ]);
    return toItem(
      repo,
      issue,
      comments.map(comment => ({
        author: comment.user.login,
        body: comment.body ?? '',
        createdAt: comment.created_at
      }))
    );
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

  return {
    source: 'github',
    configured: () => options.enabled && repositories.length > 0,
    configurationMessage: () =>
      !options.enabled
        ? 'Enable GitHub in Taskboard settings.'
        : repositories.length === 0
          ? 'No GitHub repository is mapped to this BB project on the current host.'
          : null,
    async list() {
      assertConfigured();
      await assertGithubReady(runGithubCli);
      const results = await Promise.all(
        repositories.flatMap(repo =>
          [
            { state: 'open', limit: 100 },
            { state: 'closed', limit: 50 }
          ].map(async query => ({
            repo,
            issues: githubIssueListSchema.parse(
              parseJson(
                await runGithubCli(
                  githubArgs(
                    `repos/${repo}/issues?state=${query.state}&sort=updated&direction=desc&per_page=${query.limit}`
                  ),
                  GITHUB_TIMEOUT_MS
                )
              )
            )
          }))
        )
      );
      return results.flatMap(({ repo, issues }) =>
        issues.flatMap(issue =>
          issue.pull_request === undefined
            ? [withoutComments(toItem(repo, issue))]
            : []
        )
      );
    },
    async get(locator) {
      return scopedIssue(locator);
    },
    async statusOptions(locator) {
      return statusOptions(locator);
    },
    async createMetadata(input) {
      assertConfigured();
      const repo = scopedRepository(input.destinationId);
      await assertGithubReady(runGithubCli);
      const [users, labels, milestones] = await Promise.all([
        runGithubCli(
          githubArgs(
            '--paginate',
            '--slurp',
            `repos/${repo}/assignees?per_page=100`
          ),
          GITHUB_TIMEOUT_MS
        ).then(output =>
          uniqueByIdentity(
            paginatedGithubAssigneesSchema.parse(parseJson(output)).flat(),
            user => user.login
          )
        ),
        runGithubCli(
          githubArgs(
            '--paginate',
            '--slurp',
            `repos/${repo}/labels?per_page=100`
          ),
          GITHUB_TIMEOUT_MS
        ).then(output =>
          uniqueByIdentity(
            paginatedGithubLabelsSchema.parse(parseJson(output)).flat(),
            label => label.name
          )
        ),
        runGithubCli(
          githubArgs(
            '--paginate',
            '--slurp',
            `repos/${repo}/milestones?state=open&per_page=100`
          ),
          GITHUB_TIMEOUT_MS
        )
          .then(output =>
            uniqueByIdentity(
              paginatedGithubMilestonesSchema.parse(parseJson(output)).flat(),
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
      assertConfigured();
      const repo = scopedRepository(input.destinationId);
      await assertGithubReady(runGithubCli);
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
      const args = githubArgs(
        '--method',
        'POST',
        `repos/${repo}/issues`,
        '--raw-field',
        `title=${input.title}`,
        '--raw-field',
        `body=${input.description}`,
        ...(input.assigneeId
          ? ['--raw-field', `assignees[]=${input.assigneeId}`]
          : []),
        ...input.labelIds.flatMap(label => [
          '--raw-field',
          `labels[]=${label}`
        ]),
        ...(milestone !== null
          ? ['--field', `milestone=${milestone}`]
          : [])
      );
      let created: z.infer<typeof createdGithubIssueSchema>;
      try {
        created = createdGithubIssueSchema.parse(
          parseJson(await runGithubCli(args, GITHUB_TIMEOUT_MS))
        );
      } catch {
        throw new Error(
          `${CREATE_OUTCOME_UNCERTAIN_MARKER} GitHub may have created the issue, but Taskboard could not confirm the response. Refresh the board and check for it before trying again.`
        );
      }
      const createdAssignees = created.assignees.map(
        assignee => assignee.login
      );
      const createdLabels = issueLabels(created);
      const returnedAssignees = new Set(createdAssignees);
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
        item: toItem(repo, created),
        warnings,
        assigneeConfirmation: {
          confirmed: true,
          id: confirmedId
        }
      };
    },
    async updateStatus(locator, statusId) {
      assertConfigured();
      if (statusId !== 'open' && statusId !== 'closed') {
        throw new Error('GitHub status is not available for this issue');
      }
      const parsed = parseLocator(locator);
      const repo = scopedRepository(parsed.repo);
      const issue = await scopedIssue(`${repo}#${parsed.number}`);
      const current = issue.status.toLowerCase();
      if (current !== statusId) {
        const updated = githubIssueSchema.parse(
          parseJson(
            await runGithubCli(
              githubArgs(
                '--method',
                'PATCH',
                `repos/${repo}/issues/${parsed.number}`,
                '--field',
                `state=${statusId}`
              ),
              GITHUB_TIMEOUT_MS
            )
          )
        );
        if (
          updated.pull_request !== undefined ||
          updated.number !== parsed.number
        ) {
          throw new Error(`GitHub returned the wrong issue for ${locator}`);
        }
      }
      return scopedIssue(`${repo}#${parsed.number}`);
    }
  };
}
