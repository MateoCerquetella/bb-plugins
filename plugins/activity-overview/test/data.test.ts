import test from "node:test";
import assert from "node:assert/strict";
import { getOverview } from "../data.ts";
test("repository and period filters produce deterministic summaries", () => {
  const year = getOverview("year", "all");
  const month = getOverview("month", "all");
  assert.equal(year.contributions, 1284);
  assert.equal(month.contributions, 154);
  assert.notEqual(year.opened, getOverview("year", "taskboard").opened);
  assert.equal(year.heatmap.length, 364);
});
