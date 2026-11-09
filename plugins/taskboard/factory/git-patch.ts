import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';

type Sdk = BbPluginApi['sdk'];
export type GitDiffTarget = { type: 'uncommitted' } | { type: 'all'; mergeBaseBranch: string };

const patchEntry = z.object({ path: z.string(), patch: z.string(), truncated: z.boolean() });
const notAvailable = [
  z.object({ outcome: z.literal('not_applicable'), message: z.string() }),
  z.object({ outcome: z.literal('unavailable'), failure: z.object({ message: z.string() }) })
] as const;
const filesResult = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('available'),
    files: z.array(z.object({ path: z.string(), revision: z.string() })),
    initialPatches: z.array(patchEntry)
  }),
  ...notAvailable
]);
const patchesResult = z.record(z.string(), z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('available'), patch: patchEntry }),
  ...notAvailable
]));

export type GitPatchRead =
  | { outcome: 'available'; patch: z.infer<typeof patchEntry> | null }
  | { outcome: 'unavailable'; message: string };

const failure = (result: { outcome: 'not_applicable'; message: string } | { outcome: 'unavailable'; failure: { message: string } }): GitPatchRead => ({
  outcome: 'unavailable',
  message: result.outcome === 'unavailable' ? result.failure.message : result.message
});

export async function readGitPatch(sdk: Sdk, environmentId: string, target: GitDiffTarget, path: string): Promise<GitPatchRead> {
  const files = await sdk.plugins.callRpc({
    pluginId: 'bb--git', method: 'files', outputSchema: filesResult,
    input: { environmentId, target, ignoreWhitespace: false }
  });
  if (files.outcome !== 'available') return failure(files);
  const inline = files.initialPatches.find(candidate => candidate.path === path);
  if (inline) return { outcome: 'available', patch: inline };
  const file = files.files.find(candidate => candidate.path === path);
  if (!file) return { outcome: 'available', patch: null };
  const key = JSON.stringify([environmentId, target, false, path, file.revision]);
  const patches = await sdk.plugins.callRpc({
    pluginId: 'bb--git', method: 'patches', outputSchema: patchesResult, input: { keys: [key] }
  });
  const row = patches[key];
  if (!row) return { outcome: 'available', patch: null };
  return row.outcome === 'available' ? { outcome: 'available', patch: row.patch } : failure(row);
}
