import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import Database from 'better-sqlite3';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && specifier.endsWith('.js')) {
      const url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(url))) {
        return { shortCircuit: true, url: url.href };
      }
    }
    return next(specifier, context);
  }
});

const {
  AGENT_THREAD_MIGRATION,
  agentThreadOutcome,
  createAgentThreadStore
} = await import('../execution/agent-thread-store.ts');

const task = {
  projectId: 'proj_test',
  source: 'linear' as const,
  locator: 'ROT-18'
};

function fixture() {
  const db = new Database(':memory:');
  db.exec(AGENT_THREAD_MIGRATION);
  const store = createAgentThreadStore(db);
  const now = '2026-09-28T20:00:00.000Z';
  const link = store.insert({
    dispatchKey: '8d529569-8ef7-4ec9-9901-06a4453ebf55',
    task,
    threadId: 'thr_worker',
    state: 'running',
    terminalEventSeq: null,
    error: null,
    inProgressTransitionAt: null,
    doneTransitionAt: null,
    providerError: null,
    createdAt: now,
    updatedAt: now
  });
  return { db, link, store };
}

test('native thread links survive store recreation and deduplicate dispatches', () => {
  const f = fixture();
  try {
    assert.equal(f.store.latest(task)?.threadId, 'thr_worker');
    assert.equal(f.store.unresolved().length, 1);
    assert.equal(
      createAgentThreadStore(f.db).byDispatch(f.link.dispatchKey)?.threadId,
      'thr_worker'
    );
    assert.equal(
      f.store.insert({ ...f.link, threadId: 'thr_duplicate' }).threadId,
      'thr_worker'
    );
  } finally {
    f.db.close();
  }
});

test('structured terminal events map without reading assistant prose', () => {
  assert.deepEqual(
    agentThreadOutcome({
      seq: 21,
      data: { status: 'completed' }
    }),
    { state: 'completed', terminalEventSeq: 21, error: null }
  );
  assert.deepEqual(
    agentThreadOutcome({
      seq: 22,
      data: { status: 'interrupted' }
    }),
    { state: 'canceled', terminalEventSeq: 22, error: null }
  );
  assert.deepEqual(
    agentThreadOutcome({
      seq: 23,
      data: { status: 'failed', error: { message: 'Provider disconnected' } }
    }),
    {
      state: 'failed',
      terminalEventSeq: 23,
      error: 'Provider disconnected'
    }
  );
});

test('terminal reconciliation is idempotent and removes completed links from polling', () => {
  const f = fixture();
  try {
    const outcome = {
      state: 'completed' as const,
      terminalEventSeq: 21,
      error: null
    };
    const first = f.store.transition(f.link, outcome);
    assert.equal(first.changed, true);
    assert.equal(first.link.state, 'completed');
    assert.equal(f.store.unresolved().length, 0);
    assert.equal(f.store.transition(first.link, outcome).changed, false);
    assert.equal(
      f.store.transition(first.link, {
        state: 'failed',
        terminalEventSeq: 20,
        error: 'late older event'
      }).changed,
      false
    );
  } finally {
    f.db.close();
  }
});

test('transient reconciliation errors stay retryable', () => {
  const f = fixture();
  try {
    const result = f.store.transition(f.link, {
      state: 'running',
      terminalEventSeq: null,
      error: 'Could not refresh worker state: offline'
    });
    assert.equal(result.changed, true);
    assert.equal(result.link.state, 'running');
    assert.equal(f.store.unresolved().length, 1);
  } finally {
    f.db.close();
  }
});

test('provider transitions persist exact-once receipts and retryable errors', () => {
  const f = fixture();
  try {
    const failed = f.store.providerTransition(
      f.link,
      'in_progress',
      'Start status update failed: offline'
    );
    assert.equal(failed.inProgressTransitionAt, null);
    assert.match(failed.providerError!, /offline/u);
    assert.equal(f.store.pending().length, 1);

    const started = f.store.providerTransition(
      failed,
      'in_progress',
      null
    );
    assert.ok(started.inProgressTransitionAt);
    assert.equal(started.providerError, null);
    assert.equal(f.store.pending().length, 1);

    const completed = f.store.transition(started, {
      state: 'completed',
      terminalEventSeq: 30,
      error: null
    }).link;
    assert.equal(f.store.pending().length, 1);
    const done = f.store.providerTransition(completed, 'done', null);
    assert.ok(done.doneTransitionAt);
    assert.equal(f.store.pending().length, 0);
  } finally {
    f.db.close();
  }
});
