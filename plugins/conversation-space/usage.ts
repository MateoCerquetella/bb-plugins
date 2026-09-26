export type UsageEvent = { type: string; data: unknown; createdAt: number };
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' ? v as Record<string, unknown> : {};
const count = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
export function summarize(events: UsageEvent[]) {
  let context: Record<string, unknown> | null = null;
  let usage: Record<string, unknown> | null = null;
  let measuredAt: number | null = null;
  for (const event of [...events].sort((a,b) => b.createdAt-a.createdAt)) {
    if (event.type === 'thread/context/cleared' || event.type === 'thread/compacted') break;
    const data = record(event.data);
    if (!context && event.type === 'thread/contextWindowUsage/updated') { context = record(data.contextWindowUsage); measuredAt ??= event.createdAt; }
    if (!usage && event.type === 'thread/tokenUsage/updated') { usage = record(data.tokenUsage); measuredAt ??= event.createdAt; }
  }
  const last = record(usage?.last);
  const total = record(usage?.total);
  const input = count(last.inputTokens), cached = count(last.cachedInputTokens);
  const capacity = count(context?.modelContextWindow ?? usage?.modelContextWindow);
  // Last-call total is the provider's context proxy, never cumulative usage.
  const used = context ? count(context.usedTokens) : count(last.totalTokens);
  return { used, capacity: capacity && capacity > 0 ? capacity : null,
    remaining: used !== null && capacity !== null && capacity > 0 ? Math.max(0, capacity-used) : null,
    percent: used !== null && capacity !== null && capacity > 0 ? Math.min(100,Math.round(used/capacity*100)) : null,
    sessionTokens: count(total.totalTokens),
    totalInput: input,
    input: input !== null && cached !== null ? Math.max(0,input-cached) : null,
    cached, output: count(last.outputTokens), reasoning: count(last.reasoningOutputTokens),
    estimated: context ? context.estimated === true : used !== null, measuredAt };
}
export function formatTokens(n: number | null): string {
  if (n === null) return 'Unavailable';
  return new Intl.NumberFormat('en', { notation:'compact', maximumFractionDigits:1 }).format(n).toLowerCase();
}

export function tokenShare(value: number | null | undefined, input: number | null | undefined, cached: number | null | undefined, output: number | null | undefined): string {
  if (value == null || input == null || cached == null || output == null) return '—';
  const total = input+cached+output;
  if (total === 0) return '0%';
  const percent = value/total*100;
  return percent > 0 && percent < 0.1 ? '<0.1%' : `${Math.min(100,percent).toFixed(1).replace(/\.0$/, '')}%`;
}
