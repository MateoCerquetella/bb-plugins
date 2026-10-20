import { execFile } from "node:child_process";
import { z } from "zod";
import { activityInputSchema, completeDays, dateRange, daySchema, type ActivityInput, type ActivityResult, type ActivityData } from "./activity.ts";

const count = z.number().int().nonnegative();
const perRepository = z.array(z.object({ repository: z.object({ nameWithOwner: z.string() }), contributions: z.object({ totalCount: count }) }));
const collectionSchema = z.object({
  totalPullRequestReviewContributions: count,
  contributionCalendar: z.object({ totalContributions: count, weeks: z.array(z.object({ contributionDays: z.array(daySchema) })) }),
  commitContributionsByRepository: perRepository,
  pullRequestContributionsByRepository: perRepository,
  pullRequestReviewContributionsByRepository: perRepository,
});
const viewerSchema = z.object({ data: z.object({ viewer: z.object({ login: z.string().regex(/^[A-Za-z0-9-]+$/), contributionsCollection: collectionSchema }) }) });
const searchSchema = z.object({ data: z.object({ opened: z.object({ issueCount: count }), merged: z.object({ issueCount: count }) }) });

export type Graphql = (query: string, variables: Record<string, string>) => Promise<unknown>;
export class GitHubUnavailable extends Error {}

export const githubGraphql: Graphql = (query, variables) => new Promise((resolve, reject) => {
  const argv = ["api", "--hostname", "github.com", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables)) argv.push("-f", `${key}=${value}`);
  execFile("gh", argv, { timeout: 20_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GH_HOST: "github.com", GH_PROMPT_DISABLED: "1" } }, (error, stdout, stderr) => {
    if (error) {
      // Never forward stderr, which can contain host paths or credential details.
      const unavailable = (error as NodeJS.ErrnoException).code === "ENOENT" || /auth login|not logged|authentication|HTTP 401|bad credentials/i.test(stderr);
      reject(unavailable ? new GitHubUnavailable() : new Error("GitHub request failed")); return;
    }
    try {
      const value = JSON.parse(stdout);
      if (value.errors?.length) throw new Error("GitHub returned an incomplete response");
      resolve(value);
    } catch { reject(new Error("GitHub response could not be verified")); }
  });
});

const VIEWER = `query($from:DateTime!,$to:DateTime!){viewer{login contributionsCollection(from:$from,to:$to){totalPullRequestReviewContributions contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}} commitContributionsByRepository(maxRepositories:100){repository{nameWithOwner} contributions(first:1){totalCount}} pullRequestContributionsByRepository(maxRepositories:100){repository{nameWithOwner} contributions(first:1){totalCount}} pullRequestReviewContributionsByRepository(maxRepositories:100){repository{nameWithOwner} contributions(first:1){totalCount}}}}}`;
const SEARCH = `query($opened:String!,$merged:String!){opened:search(query:$opened,type:ISSUE,first:1){issueCount} merged:search(query:$merged,type:ISSUE,first:1){issueCount}}`;

export async function fetchActivity(input: ActivityInput, graphql: Graphql = githubGraphql, now = new Date()): Promise<ActivityResult> {
  const range = dateRange(input.period, now);
  try {
    const { login, contributionsCollection: collection } = viewerSchema.parse(await graphql(VIEWER, { from: range.from, to: range.to })).data.viewer;
    const groups = [collection.commitContributionsByRepository, collection.pullRequestContributionsByRepository, collection.pullRequestReviewContributionsByRepository];
    const repositories = [...new Set(groups.flatMap(group => group.map(item => item.repository.nameWithOwner)))].sort();
    const repositoryListTruncated = groups.some(group => group.length >= 100);
    const scope = input.repository ? ` repo:${input.repository}` : "";
    const query = `is:pr author:${login}${scope}`;
    const dates = `${range.from.slice(0, 10)}..${range.to.slice(0, 10)}`;
    const notes: string[] = [];
    const days = input.repository ? null : completeDays(collection.contributionCalendar.weeks.flatMap(week => week.contributionDays), range.from, range.to);
    let opened: number | null = null, merged: number | null = null;
    try {
      const searches = searchSchema.parse(await graphql(SEARCH, { opened: `${query} created:${dates}`, merged: `${query} is:merged merged:${dates}` })).data;
      opened = searches.opened.issueCount; merged = searches.merged.issueCount;
    } catch { notes.push("Pull request counts could not be verified. Retry to refresh them."); }
    const repoReviews = collection.pullRequestReviewContributionsByRepository;
    const foundReviews = repoReviews.find(item => item.repository.nameWithOwner.toLowerCase() === input.repository?.toLowerCase());
    const reviews = input.repository ? foundReviews?.contributions.totalCount ?? (repoReviews.length >= 100 ? null : 0) : collection.totalPullRequestReviewContributions;
    const contributions = days ? days.reduce((sum, day) => sum + day.contributionCount, 0) : null;
    if (input.repository) notes.push("GitHub's contribution calendar is available for all repositories only. Repository calendar and patterns are unavailable.");
    else if (!days) notes.push("GitHub returned an incomplete calendar. Contribution totals and patterns are unavailable.");
    if (reviews === null) notes.push("Repository review contributions are outside GitHub's returned range.");
    if (repositoryListTruncated) notes.push("Repository choices are limited to GitHub's first 100 contribution repositories per category.");
    const data: ActivityData = {
      login, from: range.from, to: range.to, fetchedAt: now.toISOString(), repository: input.repository, repositories, repositoryListTruncated,
      contributions, opened, merged, reviews, days, notes,
      links: {
        pullRequests: `https://github.com/pulls?q=${encodeURIComponent(query + " is:open")}`,
        reviewRequests: `https://github.com/pulls?q=${encodeURIComponent(`is:pr is:open review-requested:${login}${scope}`)}`,
      },
    };
    return { status: [contributions, opened, merged, reviews].some(value => value === null) ? "partial" : "ready", message: null, data };
  } catch (cause) {
    return cause instanceof GitHubUnavailable
      ? { status: "unavailable", message: "GitHub activity is unavailable. Authenticate the GitHub CLI on your BB server, then retry.", data: null }
      : { status: "error", message: "Could not load verified GitHub activity. Please retry.", data: null };
  }
}

/** Bounded cache, keyed by exact scope/day; only verified complete/partial successes. */
export function createActivityService(graphql: Graphql = githubGraphql, clock = () => new Date()) {
  const cache = new Map<string, { expires: number; value: ActivityResult }>();
  const pending = new Map<string, Promise<ActivityResult>>();
  return async (raw: ActivityInput): Promise<ActivityResult> => {
    const input = activityInputSchema.parse(raw), now = clock();
    const key = JSON.stringify([input.period, input.repository, now.toISOString().slice(0, 10)]);
    const hit = cache.get(key);
    if (hit && hit.expires > now.getTime()) return hit.value;
    const running = pending.get(key); if (running) return running;
    // Bound both concurrent source requests and retained scope entries.
    if (pending.size >= 8) return { status: "error", message: "Activity refresh is busy. Please retry shortly.", data: null };
    const work = fetchActivity(input, graphql, now).then(value => {
      if (value.data && !value.data.notes.some(note => note.includes("could not be verified") || note.includes("incomplete calendar"))) {
        if (cache.size >= 24) cache.delete(cache.keys().next().value!);
        cache.set(key, { expires: now.getTime() + 5 * 60_000, value });
      }
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, work); return work;
  };
}
