import type { WorkStatusOption } from '../contract.js';

// Only use transitions exposed by the item's provider; Open is not In progress.
export function progressStatus(options: readonly WorkStatusOption[]) {
  const available = options.filter(option => option.stateCategory === 'in_progress');
  return available.find(option => /^in[\s_-]*progress$/i.test(option.name.trim())) ?? available[0];
}
