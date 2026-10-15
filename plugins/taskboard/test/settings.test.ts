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
