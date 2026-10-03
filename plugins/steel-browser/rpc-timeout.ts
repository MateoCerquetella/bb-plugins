export const RPC_TIMEOUT_MS = 30_000;
const READ_TIMEOUT_MS = 15_000;
class RpcTimeoutError extends Error {}

// A timeout does not cancel server work. Never retry session mutations automatically.
export function boundedRpc<T>(operation: Promise<T>, method: string, timeoutMs = RPC_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RpcTimeoutError(
      `BB did not respond to Steel ${method} within ${timeoutMs / 1000}s. `
      + "The request may still finish on the server. Refresh to check its status before trying again.",
    )), timeoutMs);
    operation.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

export async function callSteelRpc<T>(operation: () => Promise<T>, method: string,
  timeoutMs = ["project", "dashboard", "allProjects"].includes(method) ? READ_TIMEOUT_MS : RPC_TIMEOUT_MS): Promise<T> {
  try {
    return await boundedRpc(operation(), method, timeoutMs);
  } catch (error) {
    // Dashboard setup is coalesced by ensureBinding; mutations must not be replayed.
    if (!(error instanceof RpcTimeoutError) || !["project", "dashboard", "allProjects"].includes(method)) throw error;
    return boundedRpc(operation(), method, timeoutMs);
  }
}
