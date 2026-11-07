import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test, type TestContext } from 'node:test';
import { createFakePluginHost, makeThreadResponse } from '@get-bb/plugin-sdk/testing';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && specifier.endsWith('.js')) {
      const url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
    }
    return next(specifier, context);
  }
});
const { default: plugin } = await import('../server.ts');
const { createFactoryStore } = await import('../factory/store.ts');
const { factoryRecordSchema, factoryRecordTag, factoryThreadTag } = await import('../factory/contract.ts');

const projectId = 'proj_test';
const identity = { projectId, source: 'github' as const, locator: 'acme/app#7' };
const coordinatorThreadId = 'thr_coordinator';
const buildThreadId = 'thr_build';
const startedAt = '2026-01-01T00:00:00.000Z';

function seedRecord(fake: ReturnType<typeof createFakePluginHost>) {
  createFactoryStore(fake.bb.storage.database()).save(factoryRecordSchema.parse({
    schemaVersion: 1, ...identity, version: 0, stage: 'Build', scopeDigest: 'scope', plans: [],
    approvedDigest: null, admission: { kind: 'manual' }, execution: null, automatic: false,
    coordinator: { status: 'ready', intentId: 'intent', startedAt, legacyRunCount: 0, threadId: coordinatorThreadId },
    automationError: null, trackerProgress: { status: 'synced', message: null }, updatedAt: startedAt,
    runs: [{
      id: 'run_build', kind: 'build', status: 'running', threadId: buildThreadId, environmentId: 'env_build',
      hostId: 'host_1', checkoutRoot: '/repo', cursor: 0, turnId: null, planDigest: null, scopeDigest: 'scope',
      activity: 'Agent working', error: null, output: '', startedAt, finishedAt: null
    }]
  }));
}

function nativeBb(t: TestContext) {
  const statuses = new Map([[buildThreadId, 'active'], [coordinatorThreadId, 'idle']]);
  const events: { seq: number; type: string; scope: { kind: 'turn'; turnId: string }; data: unknown; createdAt: number }[] = [
    { seq: 1, type: 'turn/started', scope: { kind: 'turn', turnId: 'turn_1' }, data: {}, createdAt: 1 }
  ];
  const thread = (id: string) => makeThreadResponse({
    id, projectId, environmentId: id === buildThreadId ? 'env_build' : 'env_coordinator',
    parentThreadId: id === buildThreadId ? coordinatorThreadId : null,
    status: (statuses.get(id) ?? 'idle') as 'idle'
  });
  const hostCalls: unknown[] = [];
  const fake = createFakePluginHost({
    pluginId: 'taskboard',
    sdk: {
      projects: { list: async () => [{ id: projectId, name: 'Test' }] as never },
      threads: {
        get: async ({ threadId }: { threadId: string }) => thread(threadId),
        events: { list: async ({ threadId, afterSeq }: { threadId: string; afterSeq: string }) =>
          threadId === buildThreadId ? events.filter(event => event.seq > Number(afterSeq)) : [] },
        output: async () => ({ output: 'Build summary' })
      } as never,
      environments: {
        get: async ({ environmentId }: { environmentId: string }) => ({
          id: environmentId, projectId, hostId: 'host_1', path: '/repo', status: 'ready'
        })
      } as never
    },
    experimental_callHostRpc: call => {
      hostCalls.push(call.input);
      return { environmentId: 'env_build', root: '/repo', status: { kind: 'empty' } };
    }
  });
  t.after(() => fake.harness.lifecycle.dispose());
  seedRecord(fake);
  return { fake, statuses, events, thread, hostCalls };
}

async function settle() {
  for (let index = 0; index < 20; index++) await new Promise(resolve => setImmediate(resolve));
}

test('factory progress follows thread events instead of polling bb', async t => {
  const { fake, statuses, events, thread } = nativeBb(t);
  await plugin(fake.bb);
  fake.harness.behavior.runService('taskboard-factory-progress');
  await settle();
  const bbReads = () => fake.harness.sdk.calls.filter(call =>
    call.path.startsWith('threads.') || call.path.startsWith('environments.')).length;
  assert.equal(fake.harness.sdk.callsTo('threads.events.list').length, 1, 'boot catches up once');

  t.mock.timers.enable({ apis: ['setTimeout'] });
  const afterBoot = bbReads();
  for (let index = 0; index < 6; index++) {
    t.mock.timers.tick(10_000);
    await settle();
  }
  assert.equal(bbReads(), afterBoot, 'no bb reads while nothing happens');

  await fake.harness.behavior.emitThreadEvent('thread.idle', { thread: thread('thr_unrelated'), lastAssistantText: null });
  await settle();
  assert.equal(bbReads(), afterBoot, 'unlinked threads cost nothing');

  events.push({ seq: 2, type: 'turn/completed', scope: { kind: 'turn', turnId: 'turn_1' },
    data: { status: 'completed' }, createdAt: 2 });
  statuses.set(buildThreadId, 'idle');
  const invalidationsBefore = fake.harness.inspection.experimental_rpcInvalidations.length;
  await fake.harness.behavior.emitThreadEvent('thread.idle', { thread: thread(buildThreadId), lastAssistantText: 'Build summary' });
  await settle();
  const { record } = await fake.harness.behavior.callRpc('factoryForThread', { threadId: buildThreadId }) as {
    record: { runs: { status: string; output: string }[] };
  };
  assert.equal(record.runs[0]!.status, 'finished');
  assert.equal(record.runs[0]!.output, 'Build summary');
  const invalidated = fake.harness.inspection.experimental_rpcInvalidations.slice(invalidationsBefore).flatMap(tags => tags ?? []);
  assert.ok(invalidated.includes(factoryRecordTag(identity)));
  assert.ok(invalidated.includes(factoryThreadTag(buildThreadId)));
});

test('Empirical observes the workspace only while a client watches it', async t => {
  const { fake, hostCalls } = nativeBb(t);
  await plugin(fake.bb);
  for (const service of fake.harness.inspection.registrations.services) {
    if (service.name !== 'sync') fake.harness.behavior.runService(service.name);
  }
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const advance = async (ms: number) => {
    t.mock.timers.tick(ms);
    await settle();
  };
  await advance(30_000);
  assert.equal(hostCalls.length, 0, 'nobody is watching');

  const unwatch = fake.harness.behavior.experimental_watchRpc('factoryEmpirical', { input: identity });
  await settle();
  assert.equal(hostCalls.length, 1);
  await advance(8_000);
  assert.equal(hostCalls.length, 2);

  unwatch();
  await advance(30_000);
  assert.equal(hostCalls.length, 2, 'stops when the last client leaves');
});
