import { z } from 'zod';
import { bbProjectIdSchema } from './credential-contract.ts';
import { boardFilterStateSchema } from './filter-state.ts';

export const PRESET_NAME_MAX_LENGTH = 60;

export const filterPresetNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(PRESET_NAME_MAX_LENGTH);

export const filterPresetSchema = z
  .object({
    id: z.string().min(1),
    projectId: bbProjectIdSchema,
    name: filterPresetNameSchema,
    state: boardFilterStateSchema,
    position: z.number().int().nonnegative()
  })
  .strict();
export type FilterPreset = z.infer<typeof filterPresetSchema>;

/**
 * Names collide case-insensitively. This is stored as `name_normalized` and
 * backs a UNIQUE constraint, so it must not depend on the host locale:
 * `toLocaleLowerCase()` maps Turkish dotted and dotless I differently under
 * `tr-TR` than elsewhere, which would make two names collide on one machine
 * and not another, and leave stored values disagreeing with freshly computed
 * ones. `board-settings.ts` uses the locale-aware form for status names, but
 * only as an in-memory validation check whose result is never persisted.
 */
export function normalizePresetName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * A reorder must be a permutation of the stored ids. Anything else means the
 * client is working from a stale list, so reject rather than guess.
 */
export function resolvePresetOrder(
  currentIds: readonly string[],
  requestedIds: readonly string[]
): string[] {
  if (requestedIds.length !== currentIds.length) {
    throw new Error('Preset order must list every preset exactly once');
  }
  const current = new Set(currentIds);
  const seen = new Set<string>();
  for (const id of requestedIds) {
    if (!current.has(id)) throw new Error(`Unknown filter preset: ${id}`);
    if (seen.has(id)) throw new Error(`Duplicate filter preset: ${id}`);
    seen.add(id);
  }
  return [...requestedIds];
}
