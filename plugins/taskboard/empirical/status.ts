import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type EmpiricalStatusResult =
  | { kind: 'uninitialized' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'empty' }
  | {
      kind: 'feature';
      feature: string;
      revision: number;
      phase: string;
      status: string;
      nextAction: string;
      verification: string;
      completionLevel: string;
      completionMethod: string | null;
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

export async function readEmpiricalStatus(
  checkoutRoot: string,
  execute: Execute = execFileAsync
): Promise<EmpiricalStatusResult> {
  try {
    const { stdout } = await execute('empirical',
      ['__internal', 'status', '--root', checkoutRoot, '--json'],
      { timeout: 15_000, maxBuffer: 512 * 1024 });
    return parseEmpiricalStatus(JSON.parse(stdout) as unknown);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/PROJECT_NOT_INITIALIZED/.test(text)) return { kind: 'uninitialized' };
    return { kind: 'unavailable', reason: 'Empirical status could not be read.' };
  }
}
