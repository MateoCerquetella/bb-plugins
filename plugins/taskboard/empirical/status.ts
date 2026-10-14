import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { empiricalOverviewSchema, projectEmpiricalCheckout, type EmpiricalCheckoutState } from './observation.ts';

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

const statusDocumentSchema = z.object({
  schemaVersion: z.number().optional(),
  activeFeature: z.union([z.string(), z.null()]).optional(),
  revision: z.number().int().safe().optional(),
  phase: z.string().optional(),
  status: z.string().optional(),
  completion: z.object({
    highest: z.string().optional(),
    verified: z.boolean().optional()
  }).optional(),
  completionRecord: z.object({ method: z.string().optional() }).optional(),
  roadmap: z.object({
    nextAction: z.string().optional(),
    checks: z.array(z.object({ gate: z.unknown(), state: z.unknown() })).optional()
  }).optional()
}).passthrough();

export function parseEmpiricalStatus(value: unknown): EmpiricalStatusResult {
  const parsed = statusDocumentSchema.safeParse(value);
  if (!parsed.success) {
    return { kind: 'unavailable', reason: 'Empirical returned an invalid status.' };
  }
  const document = parsed.data;
  if (document.schemaVersion !== 5) {
    return { kind: 'unavailable', reason: 'Unsupported Empirical status schema.' };
  }
  if (document.activeFeature === null) return { kind: 'empty' };
  if (typeof document.activeFeature !== 'string' ||
    typeof document.revision !== 'number' ||
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
    revision: document.revision,
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
        state = projectEmpiricalCheckout(empiricalOverviewSchema.parse(JSON.parse(stdout) as unknown), root);
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
        const packet = z.object({
          roadmap: z.object({ nextAction: z.string().optional() }).optional(),
          rationale: z.object({ nextAction: z.string().optional() }).optional()
        }).passthrough().parse(JSON.parse(next.stdout) as unknown);
        nextAction = packet.roadmap?.nextAction ?? packet.rationale?.nextAction ?? nextAction;
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
