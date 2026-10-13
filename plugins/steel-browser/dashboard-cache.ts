// Share concurrent reads; bound reuse so Refresh observes changes promptly.
export class DashboardCache<T> {
  private entries = new Map<string, { until: number; task: Promise<T> }>();
  constructor(private readonly now = () => performance.now()) {}
  read(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing && existing.until > this.now()) return existing.task;
    const entry = { until: Infinity, task: Promise.resolve().then(load) };
    this.entries.set(key, entry);
    void entry.task.then(() => {
      entry.until = this.now() + 2000;
      // Drop completed entries even if a project is never opened again.
      const timer = setTimeout(() => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
      }, 2000);
      timer.unref?.();
    }, () => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return entry.task;
  }
  invalidate(key: string) { this.entries.delete(key); }
}
