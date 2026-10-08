// Explicit opt-in integration harness; never installs a plugin or contacts a tracker.
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createBBSdk } from 'bb-app';
import Database from 'better-sqlite3';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && specifier.endsWith('.js')) {
      const url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
    }
    return next(specifier, context);
  }
});
if (!process.env.BB_THREAD_ID || !process.env.BB_PROJECT_ID || !process.env.FACTORY_SMOKE_DB) {
  throw new Error('Requires BB context and an isolated FACTORY_SMOKE_DB path.');
}
const { createFactoryStore } = await import('../factory/store.ts');
const { createFactoryService } = await import('../factory/service.ts');
const sdk = createBBSdk({ baseUrl: process.env.BB_SERVER_URL });
const db = new Database(process.env.FACTORY_SMOKE_DB);
const store = createFactoryStore(db);
const service = createFactoryService(sdk, store, () => {});
const item = {
  bbProjectId: process.env.BB_PROJECT_ID, source: 'github' as const,
  locator: 'synthetic/taskboard-smoke#0', key: 'TASKBOARD-SMOKE',
  title: 'Read-only Taskboard native execution smoke test',
  description: 'Synthetic test, not a tracker issue. Inspect the repository root and report the package name and one verification script. Do not change any files, create commits or contact trackers.',
  url: '', status: 'Open', stateCategory: 'todo' as const,
  priority: null, assignee: null, project: null, labels: [], updatedAt: new Date().toISOString()
};
let record = await service.get(item);
try {
  if (!record.runs.length) record = await service.start(item, {
    expectedVersion: record.version, kind: 'investigate',
    contextThreadId: process.env.BB_THREAD_ID, retry: false
  });
  const run = record.runs.at(-1)!;
  console.log(JSON.stringify({ threadId: run.threadId, environmentId: run.environmentId, status: run.status }));
  if (!run.threadId) throw new Error(run.error ?? 'No native thread');
  const duplicate = await service.start(item, {
    expectedVersion: 0, kind: 'investigate', contextThreadId: process.env.BB_THREAD_ID, retry: false
  });
  if (duplicate.runs.length !== record.runs.length) throw new Error('Duplicate dispatch');
  for (let i = 0; i < 120; i++) {
    await new Promise(resolve => setTimeout(resolve, 2500));
    record = await service.get(item);
    const current = record.runs.at(-1)!;
    if (['finished', 'failed', 'canceled', 'uncertain'].includes(current.status)) {
      console.log(JSON.stringify({
        threadId: current.threadId, status: current.status, stage: record.stage,
        tracker: item.status, cursor: current.cursor, output: current.output,
        error: current.error, linked: store.forThread(current.threadId!)?.locator === item.locator
      }));
      if (current.status !== 'finished' || record.stage === 'Done') throw new Error('Native smoke did not pass');
      process.exitCode = 0;
      break;
    }
    if (i === 119) {
      await sdk.threads.stop({ threadId: run.threadId });
      throw new Error('Native smoke timed out; requested stop.');
    }
  }
} finally { db.close(); }
