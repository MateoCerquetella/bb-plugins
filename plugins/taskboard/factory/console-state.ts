import type { FactoryRecord, FactoryRun, FactoryRunKind } from './contract.ts';
import { MAX_REVIEW_REPAIRS } from './review.ts';

export const stageLabels = { investigate: 'Investigate', plan: 'Plan', build: 'Build', review: 'Review' };
export const stageKinds: FactoryRunKind[] = ['investigate', 'plan', 'build', 'review'];
export type RunSelection =
  | { kind: 'follow-current' }
  | { kind: 'attempt'; stage: FactoryRunKind; runId: string | null };
export type EvidenceView = 'activity' | 'result' | 'changes' | 'plan' | 'workspace';
export type FactoryAction = 'start-task' | 'continue-task' | 'retry-status' | 'recover' | 'retry' | 'continue-build' |
  'return-build' | 'generate-plan' | 'start-build' | 'start-review' | 'approve-plan' | null;

export function selectedRun(record: FactoryRecord, selection: RunSelection): FactoryRun | null {
  if (selection.kind === 'follow-current') return record.runs.at(-1) ?? null;
  return record.runs.find(run => run.id === selection.runId && run.kind === selection.stage) ??
    record.runs.filter(run => run.kind === selection.stage).at(-1) ?? null;
}

export function runStatus(run: FactoryRun): string {
  if (run.kind === 'build' && run.status === 'finished') {
    if (run.buildResult?.verdict === 'needs_input') return 'Needs approval';
    if (run.buildResult?.verdict === 'blocked') return 'Build found blockers';
  }
  if (run.kind === 'review' && run.status === 'finished') {
    return run.reviewResult?.verdict === 'blocked' ? 'Review found blockers'
      : run.reviewResult?.verdict === 'passed' ? 'Review passed'
      : 'Review needs attention';
  }
  return { starting: 'Starting', running: 'In progress', finished: 'Turn finished',
    failed: 'Failed', canceled: 'Stopped', uncertain: 'Needs attention' }[run.status];
}

export function consoleState(record: FactoryRecord) {
  const run = record.runs.at(-1);
  const plan = record.plans.at(-1);
  const approved = !!plan && record.approvedDigest === plan.digest && plan.scopeDigest === record.scopeDigest;
  const active = record.runs.some(candidate => ['starting', 'running', 'uncertain'].includes(candidate.status));
  const repairLimitReached = record.runs.filter(candidate => candidate.kind === 'build' && candidate.repairOf &&
    candidate.planDigest === record.approvedDigest && candidate.scopeDigest === record.scopeDigest).length >= MAX_REVIEW_REPAIRS;
  let action: FactoryAction = null;
  if (record.trackerProgress.status === 'failed') action = 'retry-status';
  else if (!run) {
    if (record.admission.kind === 'manual' &&
      (!record.coordinator || ['pending', 'ready'].includes(record.coordinator.status))) action = 'start-task';
  } else if (run.status === 'uncertain') action = 'recover';
  else if (!active) {
    if (run.scopeDigest && run.scopeDigest !== record.scopeDigest) action = 'continue-task';
    else if (plan && plan.scopeDigest === record.scopeDigest && !approved) action = 'approve-plan';
    else if (approved && run.status === 'finished' && ['build', 'review'].includes(run.kind) &&
      run.planDigest !== record.approvedDigest) action = 'start-build';
    else if (run.status === 'failed' || run.status === 'canceled') action = 'retry';
    else if (run.kind === 'build' && run.status === 'finished' &&
      approved && run.planDigest === record.approvedDigest &&
      ['blocked', 'needs_input'].includes(run.buildResult?.verdict ?? '') && run.threadId) action = 'continue-build';
    else if (approved && run.kind === 'review' && run.status === 'finished' &&
      run.reviewResult?.verdict !== 'passed') action = 'return-build';
    else if (record.automationError && run.kind !== 'review') action = 'continue-task';
    else if (!record.automatic && !record.automationError && run.status === 'finished' && run.kind === 'investigate') action = 'generate-plan';
    else if (approved && run.status === 'finished' && run.kind !== 'review' &&
      (!record.automatic || run.kind === 'build') && !['needs_input', 'blocked'].includes(run.buildResult?.verdict ?? '')) {
      action = run.kind === 'build' ? 'start-review' : 'start-build';
    }
  }
  const summary = !run ? 'No stage has started.' :
    run.kind === 'review' && run.status === 'finished'
      ? run.reviewResult?.verdict === 'passed' ? 'Review passed. Work acceptance is still pending.'
        : repairLimitReached ? 'Review still found blockers after two repair attempts. Inspect the findings and revise the plan.'
        : record.automatic && !record.automationError ? 'Review found blockers. Returning to Build with the findings automatically.'
        : 'Review found blockers. Return to Build with the findings to continue.'
      : run.buildResult?.verdict === 'needs_input' ? 'Review the Build questions, then approve to continue.'
      : run.repairOf && ['starting', 'running'].includes(run.status)
        ? 'Addressing review findings in the Build workspace. Review will run again automatically.'
        : run.activity || 'Waiting for the next observation.';
  return { run, plan, approved, active, repairLimitReached, action, summary };
}
