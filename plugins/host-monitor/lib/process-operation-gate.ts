export class ProcessOperationBusyError extends Error {
  override readonly name = "ProcessOperationBusyError";
}

export class ProcessOperationClosedError extends Error {
  override readonly name = "ProcessOperationClosedError";
}

interface QueuedOperation<T> {
  readonly operation: () => Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

interface HostQueue {
  running: boolean;
  readonly waiting: QueuedOperation<unknown>[];
}

export class HostProcessOperationGate {
  readonly #hosts = new Map<string, HostQueue>();
  readonly #maxWaitingPerHost: number;
  #closed = false;

  constructor(maxWaitingPerHost = 4) {
    if (!Number.isSafeInteger(maxWaitingPerHost) || maxWaitingPerHost < 0) {
      throw new RangeError("Maximum waiting operations must be a nonnegative safe integer.");
    }
    this.#maxWaitingPerHost = maxWaitingPerHost;
  }

  run<T>(hostId: string, operation: () => Promise<T>): Promise<T> {
    if (this.#closed) {
      return Promise.reject(
        new ProcessOperationClosedError("Process operations are shutting down."),
      );
    }
    let host = this.#hosts.get(hostId);
    if (host === undefined) {
      host = { running: false, waiting: [] };
      this.#hosts.set(hostId, host);
    }
    if (host.running && host.waiting.length >= this.#maxWaitingPerHost) {
      return Promise.reject(
        new ProcessOperationBusyError(
          "Too many process operations are already waiting for this machine.",
        ),
      );
    }

    return new Promise<T>((resolve, reject) => {
      host!.waiting.push({
        operation,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.#pump(hostId, host!);
    });
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const [hostId, host] of this.#hosts) {
      for (const waiting of host.waiting.splice(0)) {
        waiting.reject(
          new ProcessOperationClosedError("Process operations are shutting down."),
        );
      }
      if (!host.running) this.#hosts.delete(hostId);
    }
  }

  #pump(hostId: string, host: HostQueue): void {
    if (host.running) return;
    if (this.#closed) {
      this.#hosts.delete(hostId);
      return;
    }
    const next = host.waiting.shift();
    if (next === undefined) {
      this.#hosts.delete(hostId);
      return;
    }
    host.running = true;
    void Promise.resolve()
      .then(next.operation)
      .then(next.resolve, next.reject)
      .finally(() => {
        host.running = false;
        this.#pump(hostId, host);
      });
  }
}
