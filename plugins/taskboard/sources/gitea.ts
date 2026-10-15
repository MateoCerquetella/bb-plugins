import { execFile } from 'node:child_process';
import { access, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, isAbsolute, join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { CREATE_OUTCOME_UNCERTAIN_MARKER, giteaProjectRefSchema } from '../contract.js';
import type { CreateIssueMetadata, WorkStateCategory } from '../contract.js';
import type { ExternalWorkItemDetail, ExternalWorkStatusOption, WorkSourceAdapter } from './types.js';
import { withoutComments } from './types.js';

const PAGE_SIZE = 50;
const MAX_PAGES = 200;
const WORKFLOW_LABEL = /^status\/(.+)$/iu;
const labelSchema = z.object({ id: z.number().int().positive(), name: z.string() });
const userSchema = z.object({ login: z.string().min(1) });
const issueSchema = z.object({
  number: z.number().int().positive(), title: z.string(), body: z.string().nullish(),
  html_url: z.string().url(), state: z.enum(['open', 'closed']), updated_at: z.string(),
  labels: z.array(labelSchema).nullish().transform(value => value ?? []),
  assignees: z.array(userSchema).nullish().transform(value => value ?? []),
  pull_request: z.unknown().optional()
});
const loginListSchema = z.array(z.object({ name: z.string(), url: z.string().url() }));
export type TeaRunner = (args: string[], stdin?: string) => Promise<string>;

const ENV_KEYS = new Set([
  'HOME', 'USER', 'LOGNAME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'XDG_CONFIG_HOME', 'PATH', 'SYSTEMROOT', 'SystemRoot', 'WINDIR',
  'TMPDIR', 'TMP', 'TEMP', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'
]);

function runFile(file: string, args: string[], stdin?: string, probe = false): Promise<string> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) =>
    value !== undefined && (probe ? ['PATH', 'SYSTEMROOT', 'SystemRoot', 'WINDIR'].includes(key) : ENV_KEYS.has(key))));
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, {
      env, cwd: tmpdir(), timeout: 30_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true
    }, (error, stdout) => {
      if (error) reject(new Error('tea request failed; check the configured login, repository access and connection.'));
      else resolve(stdout);
    });
    child.stdin?.end(stdin ?? '', 'utf8');
  });
}

let teaPath: Promise<string> | undefined;
async function resolveTeaPath(): Promise<string> {
  if (!teaPath) {
    teaPath = (async () => {
      const directories = (process.env.PATH ?? '').split(delimiter).filter(isAbsolute);
      const candidates = [...new Set([
        '/opt/homebrew/bin/tea', '/usr/local/bin/tea',
        ...directories.map(directory => join(directory, process.platform === 'win32' ? 'tea.exe' : 'tea'))
      ])];
      for (const candidate of candidates) {
        try {
          const canonical = await realpath(candidate);
          const inside = relative(process.cwd(), canonical);
          if (!inside.startsWith(`..${sep}`) && !isAbsolute(inside)) continue;
          if (canonical.split(sep).includes('node_modules')) continue;
          if (!(await stat(canonical)).isFile()) continue;
          await access(canonical, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
          const version = await runFile(canonical, ['--version'], undefined, true);
          const match = /Version:\s*(\d+)\.(\d+)\./u.exec(version.replace(/\u001b\[[0-9;]*m/gu, ''));
          if (!match || !(Number(match[1]) > 0 || Number(match[2]) >= 16)) {
            throw new Error('Taskboard Gitea requires tea 0.16 or newer with tea api.');
          }
          return canonical;
        } catch { /* Try the next trusted absolute executable. */ }
      }
      throw new Error('Install tea 0.16 or newer and configure a Gitea login.');
    })();
    teaPath.catch(() => { teaPath = undefined; });
  }
  return teaPath;
}

export const runTea: TeaRunner = async (args, stdin) => runFile(await resolveTeaPath(), args, stdin);

export function parseGiteaRef(ref: string): { host: string; owner: string; repo: string } {
  giteaProjectRefSchema.parse(ref);
  const [host, owner, repo] = ref.split('/');
  if (!host || !owner || !repo) throw new Error('Configure a Gitea repository as host/owner/repo.');
  return { host: host.toLowerCase(), owner, repo };
}

export function giteaStatusCategory(name: string): WorkStateCategory {
  const value = name.replace(WORKFLOW_LABEL, '$1').toLowerCase().replace(/[ _-]+/gu, ' ');
  if (/^(done|closed|complete|completed|resolved)$/u.test(value)) return 'done';
  if (/^(canceled|cancelled|rejected|wontfix|won't fix)$/u.test(value)) return 'canceled';
  if (/^(backlog|icebox)$/u.test(value)) return 'backlog';
  if (/^(todo|to do|open|ready)$/u.test(value)) return 'todo';
  return 'in_progress';
}

export function createGiteaAdapter(options: {
  enabled: boolean; login: string; projectRef: string; runner?: TeaRunner;
}): WorkSourceAdapter {
  const runner = options.runner ?? runTea;
  const configured = () => options.enabled && Boolean(options.login && options.projectRef);
  let session: Promise<{ root: string; repository: string }> | undefined;

  function requireRef() {
    if (!configured()) throw new Error('Choose a tea login and Gitea repository in Manage.');
    return parseGiteaRef(options.projectRef);
  }

  function validateLocator(locator: string): number {
    requireRef();
    const prefix = `${options.projectRef}#`;
    if (!locator.startsWith(prefix) || !/^[1-9]\d*$/u.test(locator.slice(prefix.length))) {
      throw new Error('Gitea issue is outside the configured repository.');
    }
    const number = Number(locator.slice(prefix.length));
    if (!Number.isSafeInteger(number)) throw new Error('Invalid Gitea issue number.');
    return number;
  }

  async function scopedSession() {
    if (!session) {
      session = (async () => {
        const ref = requireRef();
        const logins = loginListSchema.parse(JSON.parse(await runner(['logins', 'list', '--output', 'json'])));
        const login = logins.find(entry => entry.name === options.login);
        if (!login) throw new Error('The configured tea login does not exist. Run tea login add.');
        const url = new URL(login.url);
        if (url.host.toLowerCase() !== ref.host || url.username || url.password || url.search || url.hash ||
            !['http:', 'https:'].includes(url.protocol)) {
          throw new Error('The tea login host does not match the configured Gitea repository.');
        }
        return { root: `${url.origin}${url.pathname.replace(/\/$/u, '')}`, repository:
          `repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}` };
      })();
      session.catch(() => { session = undefined; });
    }
    return session;
  }

  async function api(endpoint: string, method = 'GET', body?: unknown): Promise<unknown> {
    await scopedSession();
    const args = ['api', '--login', options.login, '--method', method, endpoint];
    if (body !== undefined) args.push('--data', '@-');
    const response = await runner(args, body === undefined ? undefined : JSON.stringify(body));
    // Gitea label removal succeeds with HTTP 204 and no response body.
    return method === 'DELETE' && !response.trim() ? undefined : JSON.parse(response);
  }

  async function pages(endpoint: string): Promise<unknown[]> {
    const result: unknown[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const values = z.array(z.unknown()).parse(await api(`${endpoint}${endpoint.includes('?') ? '&' : '?'}limit=${PAGE_SIZE}&page=${page}`));
      result.push(...values);
      // The server may cap pages below our requested limit. Only an empty page
      // proves exhaustion without relying on tea to expose response headers.
      if (values.length === 0) return result;
    }
    throw new Error('Gitea result exceeds the page limit; use a smaller repository.');
  }

  async function rawIssue(locator: string) {
    const number = validateLocator(locator);
    const { repository, root } = await scopedSession();
    const issue = issueSchema.parse(await api(`${repository}/issues/${number}`));
    if (issue.number !== number || issue.pull_request != null) throw new Error('Expected a Gitea issue, not a pull request.');
    const ref = requireRef();
    const expected = `${root}/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/issues/${number}`;
    if (issue.html_url !== expected) throw new Error('Gitea returned an issue outside the configured repository.');
    return issue;
  }

  function toItem(issue: z.infer<typeof issueSchema>, comments: ExternalWorkItemDetail['comments'] = []): ExternalWorkItemDetail {
    const workflow = issue.labels.find(label => WORKFLOW_LABEL.test(label.name) &&
      ['done', 'canceled'].includes(giteaStatusCategory(label.name)) === (issue.state === 'closed'));
    const category = issue.state === 'closed'
      ? workflow && giteaStatusCategory(workflow.name) === 'canceled' ? 'canceled' : 'done'
      : workflow ? giteaStatusCategory(workflow.name) : 'todo';
    return {
      source: 'gitea', locator: `${options.projectRef}#${issue.number}`, key: `#${issue.number}`,
      title: issue.title, description: issue.body ?? '', url: issue.html_url,
      status: workflow && (issue.state === 'open' || ['done', 'canceled'].includes(giteaStatusCategory(workflow.name)))
        ? workflow.name.replace(WORKFLOW_LABEL, '$1') : issue.state === 'closed' ? 'Closed' : 'Open',
      stateCategory: category, priority: null, assignee: issue.assignees.map(user => user.login).join(', ') || null,
      project: options.projectRef, labels: issue.labels.map(label => label.name), updatedAt: issue.updated_at, comments
    };
  }

  async function labels() {
    const { repository } = await scopedSession();
    return z.array(labelSchema).parse(await pages(`${repository}/labels`));
  }

  async function details(locator: string) {
    const issue = await rawIssue(locator);
    const { repository } = await scopedSession();
    const comments = z.array(z.object({
      user: userSchema, body: z.string(), created_at: z.string()
    })).parse(await pages(`${repository}/issues/${issue.number}/comments`));
    return toItem(issue, comments.map(comment => ({ author: comment.user.login, body: comment.body, createdAt: comment.created_at })));
  }

  function statusOptions(issue: z.infer<typeof issueSchema>, repositoryLabels: z.infer<typeof labelSchema>[]): ExternalWorkStatusOption[] {
    const current = toItem(issue);
    const workflow = [...new Map([...repositoryLabels, ...issue.labels].filter(label => WORKFLOW_LABEL.test(label.name)).map(label => [label.id, label])).values()];
    return [
      { id: '__open__', name: 'Open', stateCategory: 'todo', current: current.status === 'Open' },
      { id: '__closed__', name: 'Closed', stateCategory: 'done', current: current.status === 'Closed' },
      ...workflow.map(label => ({ id: String(label.id), name: label.name.replace(WORKFLOW_LABEL, '$1'),
        stateCategory: giteaStatusCategory(label.name), current: issue.labels.some(value => value.id === label.id) && current.status === label.name.replace(WORKFLOW_LABEL, '$1') }))
    ];
  }

  async function move(locator: string, statusId: string) {
    const issue = await rawIssue(locator);
    const repositoryLabels = await labels();
    const target = statusOptions(issue, repositoryLabels).find(status => status.id === statusId);
    if (!target) throw new Error('Choose a current Gitea workflow status.');
    const { repository } = await scopedSession();
    const issuePath = `${repository}/issues/${issue.number}`;
    const targetLabelId = statusId.startsWith('__') ? null : Number(statusId);
    // Labels and state use separate Gitea endpoints. Do not pretend they are atomic.
    try {
      for (const label of issue.labels) {
        if (WORKFLOW_LABEL.test(label.name) && label.id !== targetLabelId) {
          await api(`${issuePath}/labels/${label.id}`, 'DELETE');
        }
      }
      if (targetLabelId !== null) {
        await api(`${issuePath}/labels`, 'POST', { labels: [targetLabelId] });
      }
      await api(issuePath, 'PATCH', { state: ['done', 'canceled'].includes(target.stateCategory) ? 'closed' : 'open' });
    } catch {
      throw new Error('Gitea status change may be partial. Refresh the issue before trying again.');
    }
    const result = await details(locator);
    if (result.status !== target.name || result.stateCategory !== target.stateCategory) {
      throw new Error('Gitea did not confirm the requested status. Refresh the issue.');
    }
    return result;
  }

  async function metadata(): Promise<CreateIssueMetadata> {
    const { repository } = await scopedSession();
    const [repositoryLabels, users, milestones] = await Promise.all([
      labels(), pages(`${repository}/assignees`), pages(`${repository}/milestones?state=open`)
    ]);
    const members = z.array(userSchema).parse(users);
    const milestoneList = z.array(z.object({ id: z.number().int().positive(), title: z.string() })).parse(milestones);
    return {
      statusOptions: [{ id: '__open__', label: 'Open' }, ...repositoryLabels.filter(label => WORKFLOW_LABEL.test(label.name))
        .map(label => ({ id: String(label.id), label: label.name.replace(WORKFLOW_LABEL, '$1') }))],
      assigneeOptions: members.map(user => ({ id: user.login, label: `@${user.login}` })),
      priorityOptions: [], labelOptions: repositoryLabels.filter(label => !WORKFLOW_LABEL.test(label.name))
        .map(label => ({ id: String(label.id), label: label.name })),
      milestoneOptions: milestoneList.map(milestone => ({ id: String(milestone.id), label: milestone.title })),
      issueTypeOptions: [], defaultStatusId: '__open__', defaultIssueTypeId: null, supportsDueDate: true
    };
  }

  return {
    source: 'gitea', configured,
    configurationMessage: () => configured() ? null : 'Choose a tea login and Gitea repository (host/owner/repo) in Manage.',
    async list() {
      const { repository, root } = await scopedSession();
      const ref = requireRef();
      return z.array(issueSchema).parse(await pages(`${repository}/issues?state=all&type=issues`))
        .filter(issue => issue.pull_request == null)
        .map(issue => {
          if (issue.html_url !== `${root}/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/issues/${issue.number}`) {
            throw new Error('Gitea returned an issue outside the configured repository.');
          }
          return withoutComments(toItem(issue));
        });
    },
    get: details,
    async statusOptions(locator) { return statusOptions(await rawIssue(locator), await labels()); },
    async createMetadata(input) {
      requireRef();
      if (input.destinationId !== options.projectRef) throw new Error('Gitea destination is outside the configured repository.');
      return metadata();
    },
    async create(input) {
      requireRef();
      if (input.destinationId !== options.projectRef) throw new Error('Gitea destination is outside the configured repository.');
      if (input.priorityId || input.issueType) throw new Error('Gitea does not support native priority or issue type.');
      const choices = await metadata();
      for (const id of input.labelIds) if (!choices.labelOptions.some(label => label.id === id)) throw new Error('Choose a current Gitea label.');
      if (input.assigneeId && !choices.assigneeOptions.some(user => user.id === input.assigneeId)) throw new Error('Choose a current Gitea assignee.');
      if (input.milestoneId && !choices.milestoneOptions.some(milestone => milestone.id === input.milestoneId)) throw new Error('Choose a current Gitea milestone.');
      if (input.statusId && !choices.statusOptions.some(status => status.id === input.statusId)) throw new Error('Choose a current Gitea status.');
      const { repository } = await scopedSession();
      let created: z.infer<typeof issueSchema>;
      try {
        created = issueSchema.parse(await api(`${repository}/issues`, 'POST', {
          title: input.title, body: input.description, labels: input.labelIds.map(Number),
          ...(input.assigneeId ? { assignees: [input.assigneeId] } : {}),
          ...(input.milestoneId ? { milestone: Number(input.milestoneId) } : {}),
          ...(input.dueDate ? { due_date: `${input.dueDate}T23:59:59Z` } : {})
        }));
        const scoped = await scopedSession();
        const ref = requireRef();
        if (created.pull_request != null || created.html_url !== `${scoped.root}/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/issues/${created.number}`) throw new Error('Invalid created issue.');
      } catch {
        throw new Error(`${CREATE_OUTCOME_UNCERTAIN_MARKER} Gitea may have created the issue. Refresh the board and check before trying again.`);
      }
      const warnings: string[] = [];
      let item = toItem(created);
      if (input.labelIds.some(id => !created.labels.some(label => String(label.id) === id))) warnings.push('Gitea did not confirm all requested labels.');
      if (input.assigneeId && !created.assignees.some(user => user.login === input.assigneeId)) warnings.push('Gitea did not confirm the requested assignee.');
      if (input.statusId && input.statusId !== '__open__') {
        try { item = await move(item.locator, input.statusId); }
        catch { warnings.push('Issue created, but its requested status was not confirmed. Refresh and move it manually.'); }
      }
      return { item, warnings, assigneeConfirmation: { confirmed: true,
        id: created.assignees.find(user => user.login === input.assigneeId)?.login ?? null } };
    },
    updateStatus: move
  };
}
