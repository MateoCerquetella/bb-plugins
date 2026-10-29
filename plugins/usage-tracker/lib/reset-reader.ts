/**
 * Remembers the last good value and re-reads at most once per ttl. A failed or
 * empty re-read keeps the old value and is retried after retryMs.
 */
export function cachedReader<T>(
  read: () => Promise<T | null>,
  ttlMs: number,
  now: () => number = Date.now,
  retryMs: number = ttlMs,
): () => Promise<T | null> {
  let value: T | null = null;
  let validUntil = Number.NEGATIVE_INFINITY;
  let pending: Promise<T | null> | null = null;
  return () => {
    if (now() < validUntil) return Promise.resolve(value);
    pending ??= read()
      .catch(() => null)
      .then((next) => {
        validUntil = now() + (next === null ? retryMs : ttlMs);
        value = next ?? value;
        return value;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}
