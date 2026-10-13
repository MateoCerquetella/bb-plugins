import { z } from "zod";

export const DAY_MS = 86_400_000;
export const activityInputSchema = z.object({
  period: z.enum(["month", "quarter", "year"]),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).max(201).nullable().default(null),
}).strict();
export type ActivityInput = z.infer<typeof activityInputSchema>;
export const daySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), contributionCount: z.number().int().nonnegative() });
export type ContributionDay = z.infer<typeof daySchema>;
export const activityDataSchema = z.object({
  login: z.string(), from: z.string(), to: z.string(), fetchedAt: z.string(),
  repository: z.string().nullable(), repositories: z.array(z.string()), repositoryListTruncated: z.boolean(),
  contributions: z.number().int().nonnegative().nullable(), opened: z.number().int().nonnegative().nullable(),
  merged: z.number().int().nonnegative().nullable(), reviews: z.number().int().nonnegative().nullable(),
  days: z.array(daySchema).nullable(), notes: z.array(z.string()),
  links: z.object({ pullRequests: z.string().url(), reviewRequests: z.string().url() }),
});
export type ActivityData = z.infer<typeof activityDataSchema>;
export const activityResultSchema = z.object({
  status: z.enum(["ready", "partial", "unavailable", "error"]), message: z.string().nullable(), data: activityDataSchema.nullable(),
});
export type ActivityResult = z.infer<typeof activityResultSchema>;

export function dateRange(period: ActivityInput["period"], now = new Date()) {
  const length = { month: 30, quarter: 90, year: 365 }[period];
  const to = now.toISOString();
  const midnight = Date.parse(to.slice(0, 10) + "T00:00:00Z");
  return { from: new Date(midnight - (length - 1) * DAY_MS).toISOString(), to, length };
}

/** Reject missing/duplicate/invalid source days instead of inventing zero cells. */
export function completeDays(days: ContributionDay[], from: string, to: string): ContributionDay[] | null {
  const start = from.slice(0, 10), end = to.slice(0, 10);
  const selected = days.filter(day => day.date >= start && day.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const first = Date.parse(start + "T00:00:00Z"), last = Date.parse(end + "T00:00:00Z");
  if (selected.length !== (last - first) / DAY_MS + 1) return null;
  for (let i = 0; i < selected.length; i++) {
    if (selected[i].date !== new Date(first + i * DAY_MS).toISOString().slice(0, 10)) return null;
  }
  return selected;
}

export function patterns(days: ContributionDay[], today: string) {
  let longest = 0, run = 0, current = 0;
  let previous = "";
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const months = new Map<string, number>();
  let busiestDate: ContributionDay | null = null;
  for (const day of sorted) {
    const contiguous = previous && Date.parse(day.date) - Date.parse(previous) === DAY_MS;
    run = day.contributionCount > 0 ? (contiguous ? run : 0) + 1 : 0;
    longest = Math.max(longest, run);
    previous = day.date;
    const month = day.date.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + day.contributionCount);
    if (day.contributionCount > 0 && (!busiestDate || day.contributionCount > busiestDate.contributionCount)) busiestDate = day;
  }
  let cursor = Date.parse(today + "T00:00:00Z");
  const counts = new Map(sorted.map(day => [day.date, day.contributionCount]));
  if (counts.get(today) === 0) cursor -= DAY_MS;
  while ((counts.get(new Date(cursor).toISOString().slice(0, 10)) ?? 0) > 0) { current++; cursor -= DAY_MS; }
  const busiestMonth = [...months].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  return { current, longest, busiestMonth, busiestDate: busiestDate?.date ?? null };
}
