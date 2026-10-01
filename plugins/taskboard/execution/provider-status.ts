import type {
  WorkStateCategory,
  WorkStatusOption
} from '../contract.js';

const preferredNames: Record<'in_progress' | 'done', RegExp[]> = {
  in_progress: [/^in progress$/iu, /^started$/iu, /^working$/iu],
  done: [/^done$/iu, /^completed$/iu, /^closed$/iu]
};

export function selectAgentStatus(
  options: readonly WorkStatusOption[],
  category: Extract<WorkStateCategory, 'in_progress' | 'done'>
): WorkStatusOption | null {
  const candidates = options.filter(
    option => option.stateCategory === category
  );
  if (category === 'in_progress') {
    const current = candidates.find(option => option.current);
    if (current) return current;
  }
  for (const pattern of preferredNames[category]) {
    const preferred = candidates.find(option => pattern.test(option.name));
    if (preferred) return preferred;
  }
  return candidates[0] ?? null;
}
