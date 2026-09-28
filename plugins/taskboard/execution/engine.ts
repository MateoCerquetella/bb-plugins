import type { ExecutionRun } from './contract.js';

export interface RuntimeSnapshot {
  state: 'running' | 'retrying' | 'blocked' | 'untracked';
  runId: string | null;
  retries: number;
  error: string | null;
}
/** Managed engines supervise runs; the local adapter returns the existing composer handoff. */
export interface ExecutionEngine {
  start(run: ExecutionRun): Promise<void>;
  getStatus(run: ExecutionRun): Promise<RuntimeSnapshot>;
  stop(run: ExecutionRun): Promise<void>;
  resume(run: ExecutionRun): Promise<void>;
}
