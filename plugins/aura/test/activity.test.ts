import assert from "node:assert/strict";
import test from "node:test";
import { completeDays, dateRange, patterns, DAY_MS } from "../lib/activity.ts";
import { createActivityService, fetchActivity, GitHubUnavailable, type Graphql } from "../lib/github.ts";

const now = new Date("2026-03-01T12:30:00Z");
const range = dateRange("month", now);
const days = Array.from({ length: 30 }, (_, i) => ({ date: new Date(Date.parse(range.from) + i * DAY_MS).toISOString().slice(0, 10), contributionCount: i >= 27 ? 2 : 0 }));
const repo = (name: string, totalCount: number) => ({ repository: { nameWithOwner: name }, contributions: { totalCount } });
const viewer = () => ({ data: { viewer: { login: "someone", contributionsCollection: {
  totalPullRequestReviewContributions: 3,
  contributionCalendar: { totalContributions: 6, weeks: [{ contributionDays: days }] },
  commitContributionsByRepository: [repo("owner/project", 6)],
  pullRequestContributionsByRepository: [repo("owner/project", 7)],
  pullRequestReviewContributionsByRepository: [repo("owner/project", 3)],
} } } });
const searches = { data: { opened: { issueCount: 7 }, merged: { issueCount: 4 } } };
const graphql: Graphql = async query => query.includes("viewer{") ? viewer() : searches;

test("ranges cover exact inclusive UTC days across leap years and timezone offsets", () => {
  assert.equal(range.from, "2026-01-31T00:00:00.000Z");
  assert.equal(range.to, now.toISOString());
  assert.equal(dateRange("month", new Date("2024-03-01T03:00:00+03:00")).from, "2024-02-01T00:00:00.000Z");
  for (const period of ["month", "quarter", "year"] as const) {
    const r = dateRange(period, now);
    assert.equal((Date.parse(r.to.slice(0, 10)) - Date.parse(r.from)) / DAY_MS + 1, r.length);
  }
});

test("calendar validation refuses missing, duplicate and impossible dates instead of filling zero days", () => {
  assert.deepEqual(completeDays([...days].reverse(), range.from, range.to), days);
  assert.equal(completeDays(days.slice(1), range.from, range.to), null);
  assert.equal(completeDays([...days.slice(1), days[1]], range.from, range.to), null);
  assert.equal(completeDays([{ date: "2026-02-30", contributionCount: 1 }], "2026-02-28", "2026-03-01"), null);
});

test("patterns use real consecutive days, yesterday grace, earliest ties and no-activity values", () => {
  const result = patterns(days, "2026-03-01");
  assert.equal(result.current, 3); assert.equal(result.longest, 3);
  assert.equal(result.busiestDate, "2026-02-27"); assert.equal(result.busiestMonth, "2026-02");
  const todayEmpty = days.map(day => ({ ...day, contributionCount: day.date === "2026-03-01" ? 0 : day.contributionCount }));
  assert.equal(patterns(todayEmpty, "2026-03-01").current, 2);
  assert.equal(patterns(days.filter(day => day.date !== "2026-02-28"), "2026-03-01").longest, 1);
  assert.deepEqual(patterns(days.map(day => ({ ...day, contributionCount: 0 })), "2026-03-01"), { current: 0, longest: 0, busiestDate: null, busiestMonth: null });
});

test("authenticated counts and dated cells pass through unchanged; explicit viewer login scopes authored searches", async () => {
  const calls: Record<string, string>[] = [];
  const value = await fetchActivity({ period: "month", repository: null }, async (query, vars) => { calls.push(vars); return graphql(query, vars); }, now);
  assert.equal(value.status, "ready");
  assert.equal(value.data?.contributions, 6); assert.equal(value.data?.opened, 7); assert.equal(value.data?.merged, 4); assert.equal(value.data?.reviews, 3);
  assert.deepEqual(value.data?.days, days);
  assert.deepEqual(calls[0], { from: range.from, to: range.to });
  assert.match(calls[1].opened, /author:someone created:2026-01-31\.\.2026-03-01/);
  assert.ok(!calls[1].opened.includes("@me"));
});

test("repository selection scopes actual PR counts and reviews but does not relabel the global calendar", async () => {
  const calls: Record<string, string>[] = [];
  const value = await fetchActivity({ period: "month", repository: "owner/project" }, async (query, vars) => { calls.push(vars); return graphql(query, vars); }, now);
  assert.equal(value.status, "partial"); assert.equal(value.data?.contributions, null); assert.equal(value.data?.days, null);
  assert.equal(value.data?.reviews, 3); assert.equal(value.data?.opened, 7);
  assert.match(calls[1].opened, /repo:owner\/project/);
  assert.match(value.data!.notes.join(" "), /all repositories only/);
  assert.match(decodeURIComponent(value.data!.links.reviewRequests), /review-requested:someone repo:owner\/project/);
});

test("API/authentication failures are sanitized, partial counts stay unconfirmed, and invalid calendars are unavailable", async () => {
  const unavailable = await fetchActivity({ period: "month", repository: null }, async () => { throw new GitHubUnavailable("secret token"); }, now);
  assert.equal(unavailable.status, "unavailable"); assert.equal(unavailable.data, null); assert.ok(!JSON.stringify(unavailable).includes("secret"));
  const error = await fetchActivity({ period: "month", repository: null }, async () => ({ data: { viewer: null } }), now);
  assert.equal(error.status, "error"); assert.equal(error.data, null);
  const partial = await fetchActivity({ period: "month", repository: null }, async query => { if (query.includes("viewer{")) return viewer(); throw new Error("raw API secret"); }, now);
  assert.equal(partial.status, "partial"); assert.equal(partial.data?.opened, null); assert.equal(partial.data?.contributions, 6);
  const malformed = viewer(); malformed.data.viewer.contributionsCollection.contributionCalendar.weeks[0].contributionDays = days.slice(1);
  const missing = await fetchActivity({ period: "month", repository: null }, async query => query.includes("viewer{") ? malformed : searches, now);
  assert.equal(missing.status, "partial"); assert.equal(missing.data?.contributions, null); assert.equal(missing.data?.days, null);
});

test("empty is a complete source response; repository discovery caps never imply missing reviews are zero", async () => {
  const source = viewer(); source.data.viewer.contributionsCollection.contributionCalendar.weeks[0].contributionDays = days.map(day => ({ ...day, contributionCount: 0 }));
  source.data.viewer.contributionsCollection.totalPullRequestReviewContributions = 0;
  const empty = await fetchActivity({ period: "month", repository: null }, async query => query.includes("viewer{") ? source : { data: { opened: { issueCount: 0 }, merged: { issueCount: 0 } } }, now);
  assert.equal(empty.status, "ready"); assert.equal(empty.data?.contributions, 0); assert.equal(empty.data?.opened, 0);
  source.data.viewer.contributionsCollection.pullRequestReviewContributionsByRepository = Array.from({ length: 100 }, (_, i) => repo(`owner/repo-${i}`, 1));
  const capped = await fetchActivity({ period: "month", repository: "owner/not-returned" }, async query => query.includes("viewer{") ? source : searches, now);
  assert.equal(capped.data?.repositoryListTruncated, true); assert.equal(capped.data?.reviews, null);
});

test("cache coalesces matching requests, expires after five minutes and does not retain failed counts", async () => {
  let calls = 0, time = now.getTime();
  const service = createActivityService(async (query, vars) => { calls++; return graphql(query, vars); }, () => new Date(time));
  const input = { period: "month" as const, repository: null };
  await Promise.all([service(input), service(input)]); assert.equal(calls, 2);
  await service(input); assert.equal(calls, 2);
  time += 5 * 60_000; await service(input); assert.equal(calls, 4);
  let retryCalls = 0;
  const retry = createActivityService(async query => { retryCalls++; if (query.includes("viewer{")) return viewer(); throw new Error("Unavailable"); }, () => now);
  await retry(input); await retry(input); assert.equal(retryCalls, 4);
  await assert.rejects(service({ ...input, repository: "owner/project is:public" }));
});
