import type { ExecutionRun, ExecutionState } from '../../contract.js';
import type { ExecutionEngine } from '../../engine.js';
export function mapSymphonyState(state: string): ExecutionState {
  const states: Record<string, ExecutionState> = {
    queued: 'queued',
    running: 'running',
    retrying: 'retrying',
    blocked: 'blocked',
    waiting_for_input: 'blocked',
    agent_finished: 'implementation_complete',
    implementation_complete: 'implementation_complete',
    failed: 'failed',
    canceled: 'canceled'
  };
  if (!states[state]) throw new Error(`Unknown Symphony state: ${state}`);
  return states[state];
}
function endpointUrl(endpoint: string, path: string) {
  const url = new URL(endpoint);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid Symphony endpoint');
  url.pathname = url.pathname.replace(/\/$/, '') + path;
  return url;
}
export function createSymphonyEngine(
  fetcher: typeof fetch = fetch
): ExecutionEngine {
  async function call(run: ExecutionRun, path: string, method = 'GET') {
    return fetcher(endpointUrl(run.endpoint, path), {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000)
    });
  }
  async function refresh(run: ExecutionRun) {
    const response = await call(run, '/api/v1/refresh', 'POST');
    if (!response.ok)
      throw new Error(`Symphony unavailable (HTTP ${response.status})`);
  }
  return {
    start: refresh,
    stop: refresh,
    resume: refresh,
    async getStatus(run) {
      const response = await call(run, `/api/v1/${encodeURIComponent(run.id)}`);
      if (response.status === 404) {
        // Upstream also returns issue_not_found when its snapshot is unavailable.
        // Confirm a healthy global snapshot before treating a workspace as released.
        const snapshotResponse = await call(run, '/api/v1/state');
        if (!snapshotResponse.ok)
          throw new Error('Symphony snapshot unavailable');
        const snapshot = (await snapshotResponse.json()) as Record<string, any>;
        if (
          snapshot.error ||
          !Array.isArray(snapshot.running) ||
          !Array.isArray(snapshot.retrying) ||
          !Array.isArray(snapshot.blocked)
        )
          throw new Error('Invalid Symphony snapshot');
        for (const state of ['running', 'retrying', 'blocked'] as const) {
          const entry = snapshot[state].find(
            (entry: Record<string, unknown>) => entry.issue_id === run.id
          );
          if (entry)
            return {
              state,
              runId:
                typeof entry.session_id === 'string' ? entry.session_id : null,
              retries: Number.isInteger(entry.attempt) ? entry.attempt : 0,
              error: typeof entry.error === 'string' ? entry.error : null
            };
        }
        return { state: 'untracked', runId: null, retries: 0, error: null };
      }
      if (!response.ok)
        throw new Error(`Symphony unavailable (HTTP ${response.status})`);
      const body = (await response.json()) as Record<string, any>;
      if (
        body.issue_id !== run.id ||
        !['running', 'retrying', 'blocked'].includes(body.status)
      )
        throw new Error('Invalid Symphony runtime response');
      return {
        state: body.status,
        runId:
          typeof body.running?.session_id === 'string'
            ? body.running.session_id
            : null,
        retries: Number.isInteger(body.attempts?.current_retry_attempt)
          ? body.attempts.current_retry_attempt
          : 0,
        error:
          typeof body.last_error === 'string'
            ? body.last_error.slice(0, 2000)
            : null
      };
    }
  };
}
