import type { WorkStatusOption } from '../contract.js';
import type { FactoryRecord, FactoryStatusTarget } from './contract.js';

const reviewName = /(^|[\s_-])(review|qa|verify|verification|acceptance)([\s_-]|$)/i;

// Only use transitions exposed by the item's provider; Open is not In progress.
export function progressStatus(options: readonly WorkStatusOption[]) {
  const available = options.filter(option => option.stateCategory === 'in_progress');
  return available.find(option => /^in[\s_-]*progress$/i.test(option.name.trim()))
    ?? available.find(option => !reviewName.test(option.name.trim()));
}

export function reviewStatus(options: readonly WorkStatusOption[]) {
  return options.find(option => option.stateCategory === 'in_progress' && reviewName.test(option.name.trim()));
}

export function doneStatus(options: readonly WorkStatusOption[]) {
  return options.find(option => option.stateCategory === 'done' &&
    /(^|[\s_-])(done|complete|completed|closed|resolved|accepted)([\s_-]|$)/i.test(option.name.trim()))
    ?? options.find(option => option.stateCategory === 'done');
}

export function statusTargetLabel(target: FactoryStatusTarget) {
  return target === 'review' ? 'In review' : target === 'done' ? 'Done' : 'In progress';
}

// A Review that has been sent back for repair belongs In progress again; only
// an active/finished review is In review. Done is reserved for explicit human
// acceptance and is never inferred from a passed review.
export function trackerTarget(record: FactoryRecord): FactoryStatusTarget {
  const latest = record.runs.at(-1);
  if (record.stage === 'Done') return 'done';
  if (record.stage === 'Review' && latest?.kind === 'review' && latest.reviewResult?.verdict !== 'blocked') {
    return 'review';
  }
  return 'in_progress';
}
