import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';

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

test('registers independent default-on thread header visibility settings', async t => {
  const fake = createFakePluginHost({ pluginId: 'taskboard' });
  t.after(() => fake.harness.lifecycle.dispose());

  await plugin(fake.bb);

  assert.deepEqual(
    fake.harness.inspection.registrations.settingsDescriptors,
    {
      showThreadHeaderProgress: {
        type: 'boolean',
        label: 'Show task progress in thread headers',
        default: true
      },
      showThreadHeaderPin: {
        type: 'boolean',
        label: 'Show Taskboard pin and open button',
        default: true
      }
    }
  );
});


test('factory instructions survive RPC reads and CLI enable/pause without changing AI', async t => {
  const fake = createFakePluginHost({ pluginId: 'taskboard', sdk: { projects: {
    list: async () => [{ id: 'proj_test', name: 'Test' }, { id: 'proj_other', name: 'Other' }] as any
  } } });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);
  const execution = {
    providerId: 'codex', model: 'test', permissionMode: 'auto', reasoningLevel: 'high', serviceTier: 'default'
  };
  const factoryInstructions = '  Project rules\nVerify changes.\n';
  await fake.harness.behavior.callRpc('factorySaveProject', {
    projectId: 'proj_test', provider: 'github', enabled: false, execution, factoryInstructions
  });
  const saved = await fake.harness.behavior.callRpc('factoryGetProject', { projectId: 'proj_test' }) as any;
  assert.deepEqual(saved.policy.execution, execution);
  assert.equal(saved.policy.factoryInstructions, factoryInstructions);
  for (const args of [['factory', 'enable', '2'], ['factory', 'pause']]) {
    const result = await fake.harness.behavior.runCli([...args, '--project', 'proj_test', '--json']);
    assert.equal(result.exitCode, 0, result.stderr);
    const { policy } = JSON.parse(result.stdout);
    assert.deepEqual(policy.execution, execution);
    assert.equal(policy.factoryInstructions, factoryInstructions);
  }
  const other = await fake.harness.behavior.callRpc('factoryGetProject', { projectId: 'proj_other' }) as any;
  assert.equal(other.policy.factoryInstructions, '');
  await assert.rejects(fake.harness.behavior.callRpc('factorySaveProject', {
    projectId: 'proj_test', provider: 'github', factoryInstructions: 'a'.repeat(20_001)
  }));
});
