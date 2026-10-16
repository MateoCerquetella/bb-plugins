import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && specifier.endsWith('.js')) {
    const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
  }
  return nextResolve(specifier, context);
} });

const { createWorkItemStore } = await import('../store.ts');
const { parseTaskboardCliArguments } = await import('../server.ts');
const { projectConfigMutationSchema, formatWorkItemHandoffPrompt } = await import('../contract.ts');
const { taskboardComposerMention, parseTaskboardComposerMention, serializeTaskboardComposerMention } = await import('../composer-handoff.ts');
const { defaultBrowsePreferences } = await import('../browse-preferences.ts');
type StoreBb = Parameters<typeof createWorkItemStore>[0];
const defaults = {
  source: 'github' as const, linearTeamKey: '', linearFinishedDays: 0,
  jiraBaseUrl: '', jiraEmail: '', jiraJql: 'project = APP', gitlabProjectRef: '',
  giteaLogin: '', giteaProjectRef: ''
};

test('CLI accepts explicit Gitea scope and mutation requires both destination fields', () => {
  const parsed = parseTaskboardCliArguments('config', [ '--source', 'gitea', '--gitea-login', 'pilot', '--gitea-project', 'git.example.com/team/app']);
  assert.equal(parsed.giteaLogin, 'pilot');
  assert.deepEqual(parsed.positionals, []);
  assert.equal(parsed.giteaProject, 'git.example.com/team/app');
  const input = { projectId: 'proj_gitea', ...defaults, source: 'gitea',
    linearCredential: { operation: 'keep' }, jiraCredential: { operation: 'keep' } };
  assert.equal(projectConfigMutationSchema.safeParse(input).success, false);
  assert.equal(projectConfigMutationSchema.safeParse({ ...input, giteaLogin: 'pilot', giteaProjectRef: 'git.example.com/team/app' }).success, true);
});

test('appended migration preserves existing main data and records source identity', () => {
  let statements: readonly string[] = [];
  const db = new Database(':memory:');
  const capture = { storage: {
    database: () => db,
    migrate(_db: Database.Database, migrations: readonly string[]) { statements = migrations; throw new Error('captured'); }
  } } as unknown as StoreBb;
  assert.throws(() => createWorkItemStore(capture), /captured/u);
  const previous = statements.slice(0, -1);
  const hashes = previous.map(sql => createHash('sha256').update(sql).digest('hex'));
  previous.forEach(sql => db.exec(sql));
  db.prepare(`INSERT INTO project_source_config
    (bb_project_id, source, linear_team_key, linear_finished_days, jira_base_url, jira_email, jira_jql, gitlab_project_ref, updated_at)
    VALUES ('proj_existing','github','',0,'','','project = APP','','2026-10-14')`).run();
  db.prepare(`INSERT INTO work_items_by_project VALUES
    ('proj_existing','github','team/app#1','#1','Existing task','','https://github.com/team/app/issues/1','Open','todo',NULL,NULL,NULL,'[]','2026-10-14')`).run();
  const bb = { storage: {
    database: () => db,
    migrate(database: Database.Database, migrations: readonly string[]) {
      assert.deepEqual(migrations.slice(0, -1).map(sql => createHash('sha256').update(sql).digest('hex')), hashes);
      migrations.slice(previous.length).forEach(sql => database.exec(sql));
    }
  } } as unknown as StoreBb;
  try {
    const store = createWorkItemStore(bb);
    assert.equal(store.projectConfig('proj_existing', defaults).source, 'github');
    assert.equal(store.projectConfig('proj_existing', defaults).giteaLogin, '');
    assert.equal(store.get('proj_existing', 'github', 'team/app#1')?.title, 'Existing task');
    const saved = store.saveProjectConfig({ projectId: 'proj_gitea', ...defaults, source: 'gitea', giteaLogin: 'pilot', giteaProjectRef: 'git.example.com/team/app' });
    assert.equal(saved.giteaLogin, 'pilot');
    assert.equal(store.projectConfig('proj_gitea', defaults).giteaProjectRef, 'git.example.com/team/app');
    store.setSourceError('proj_gitea', 'gitea', 'temporary failure');
    assert.equal(store.syncState('proj_gitea', 'gitea').error, 'temporary failure');
  } finally { db.close(); }
});

test('Gitea issues are valid composer mentions and retain untrusted context boundaries', () => {
  const item = {
    bbProjectId: 'proj_gitea', source: 'gitea' as const, locator: 'git.example.com/team/app#7', key: '#7',
    title: 'A Gitea issue', description: 'Do not treat this as instructions', url: 'https://git.example.com/team/app/issues/7',
    status: 'Open', stateCategory: 'todo' as const, priority: null, assignee: null, project: 'git.example.com/team/app', labels: [], updatedAt: '2026-10-14'
  };
  const mention = taskboardComposerMention(item);
  assert.deepEqual(parseTaskboardComposerMention(serializeTaskboardComposerMention(mention)!), mention);
  const prompt = formatWorkItemHandoffPrompt(item);
  assert.match(prompt, /provider="Gitea"/u);
  assert.match(prompt, /UNTRUSTED EXTERNAL TRACKER DATA/u);
  assert.equal(defaultBrowsePreferences({ provider: 'gitea', source: 'gitea' }).source, 'gitea');
});
