import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { projectEmpiricalCheckout, type EmpiricalCheckoutState, type EmpiricalOverview } from './observation.ts';

const execFileAsync = promisify(execFile);

export type EmpiricalStatusResult =
  | { kind: 'uninitialized' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'invalid'; reason: string }
  | { kind: 'empty' }
  | {
      kind: 'feature';
      feature: string;
      revision: number;
      phase: string;
      status: string;
      nextAction: string;
      verification: 'verified' | 'skipped' | 'pending';
      completionLevel: string;
      completionMethod: string | null;
      ownership?: 'selected' | 'unclaimed' | 'conflict' | 'unknown';
      mergedButUnclosed?: boolean;
    };

interface StatusDocument {
  schemaVersion?: unknown;
  activeFeature?: unknown;
  revision?: unknown;
  phase?: unknown;
  status?: unknown;
  completion?: { highest?: unknown; verified?: unknown };
  completionRecord?: { method?: unknown };
  roadmap?: { nextAction?: unknown; checks?: Array<{ gate?: unknown; state?: unknown }> };
}

export function parseEmpiricalStatus(value: unknown): EmpiricalStatusResult {
  if (typeof value !== 'object' || value === null) {
    return { kind: 'unavailable', reason: 'Empirical returned an invalid status.' };
  }
  const document = value as StatusDocument;
  if (document.schemaVersion !== 5) {
    return { kind: 'unavailable', reason: 'Unsupported Empirical status schema.' };
  }
  if (document.activeFeature === null) return { kind: 'empty' };
  if (typeof document.activeFeature !== 'string' ||
    !Number.isSafeInteger(document.revision) ||
    typeof document.phase !== 'string' ||
    typeof document.status !== 'string' ||
    typeof document.completion?.highest !== 'string' ||
    typeof document.completion.verified !== 'boolean') {
    return { kind: 'unavailable', reason: 'Empirical status is incomplete.' };
  }
  return {
    kind: 'feature',
    feature: document.activeFeature,
    revision: document.revision as number,
    phase: document.phase,
    status: document.status,
    nextAction: typeof document.roadmap?.nextAction === 'string'
      ? document.roadmap.nextAction : 'Unavailable from this Empirical version',
    verification: document.completion.verified ? 'verified'
      : document.roadmap?.checks?.some(check =>
        check.gate === 'verify' && check.state === 'skipped') ? 'skipped' : 'pending',
    completionLevel: document.completion.highest,
    completionMethod: typeof document.completionRecord?.method === 'string'
      ? document.completionRecord.method : null
  };
}

type Execute = (file: string, args: string[], options: {
  timeout: number;
  maxBuffer: number;
}) => Promise<{ stdout: string }>;

const ownership = new Map<string, { state: EmpiricalCheckoutState | null; checkedAt: number; pending: boolean }>();

function refreshOwnership(root: string, execute: Execute): void {
  const cached = ownership.get(root);
  if (cached?.pending || (cached && Date.now() - cached.checkedAt < 30_000)) return;
  if (ownership.size >= 32) ownership.delete(ownership.keys().next().value!);
  ownership.set(root, { state: cached?.state ?? null, checkedAt: cached?.checkedAt ?? 0, pending: true });
  void execute('empirical', ['__internal', 'overview', '--root', root, '--json'],
    { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 })
    .then(({ stdout }) => {
      let state: EmpiricalCheckoutState;
      try {
        state = projectEmpiricalCheckout(JSON.parse(stdout) as EmpiricalOverview, root);
      } catch {
        state = { kind: 'invalid', root, issues: ['Empirical overview did not match this checkout.'] };
      }
      ownership.set(root, { state, checkedAt: Date.now(), pending: false });
    })
    .catch(() => ownership.set(root, { state: null, checkedAt: Date.now(), pending: false }));
}

export async function readEmpiricalStatus(
  checkoutRoot: string,
  execute: Execute = execFileAsync
): Promise<EmpiricalStatusResult> {
  try {
    const { stdout } = await execute('empirical',
      ['__internal', 'status', '--root', checkoutRoot, '--json'],
      { timeout: 15_000, maxBuffer: 512 * 1024 });
    const result = parseEmpiricalStatus(JSON.parse(stdout) as unknown);
    if (result.kind !== 'feature') return result;
    refreshOwnership(checkoutRoot, execute);
    const state = ownership.get(checkoutRoot)?.state;
    let nextAction = result.nextAction;
    if (nextAction === 'Unavailable from this Empirical version') {
      try {
        const next = await execute('empirical',
          ['__internal', 'next', '--root', checkoutRoot, '--json'],
          { timeout: 15_000, maxBuffer: 512 * 1024 });
        const packet = JSON.parse(next.stdout) as { roadmap?: { nextAction?: unknown } };
        if (typeof packet.roadmap?.nextAction === 'string') nextAction = packet.roadmap.nextAction;
      } catch {
        // The status remains useful when the action query is unavailable.
      }
    }
    if (!state) return { ...result, nextAction };
    if (state.kind === 'invalid') {
      return { kind: 'invalid', reason: state.issues.join(' ').slice(0, 500) || 'Selected Empirical copy is invalid.' };
    }
    if (state.kind === 'none' || state.feature !== result.feature) {
      return { kind: 'invalid', reason: 'Empirical selection changed during observation.' };
    }
    return {
      ...result, nextAction: nextAction === 'Unavailable from this Empirical version'
        ? state.nextAction : nextAction,
      ownership: state.ownership, mergedButUnclosed: state.mergedButUnclosed
    };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/PROJECT_NOT_INITIALIZED/.test(text)) return { kind: 'uninitialized' };
    return { kind: 'unavailable', reason: 'Empirical status could not be read.' };
  }
}
