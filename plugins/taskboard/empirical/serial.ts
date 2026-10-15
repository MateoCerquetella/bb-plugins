export function createEmpiricalObservationQueue() {
  const tails = new Map<string, Promise<void>>();
  return function observe<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const prior = tails.get(key) ?? Promise.resolve();
    const result = prior.then(operation);
    const tail = result.then(() => undefined, () => undefined);
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  };
}
