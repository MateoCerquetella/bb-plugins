import assert from "node:assert/strict";
import test from "node:test";

import { expectedSampleInterval, withChartGaps } from "../chart-data.ts";

test("marks deterministic collection gaps without adding chart rows", () => {
  const rows = [
    [0, 10],
    [30_000, 20],
    [600_000, 30],
    [630_000, 40],
  ];
  const result = withChartGaps(rows, 30_000);
  assert.equal(result.length, rows.length);
  assert.deepEqual(result[2], [600_000, null]);
  assert.deepEqual(result[3], [630_000, 40]);
});

test("derives the same bounded interval used by long history queries", () => {
  assert.equal(expectedSampleInterval(1), 10_000);
  assert.ok(expectedSampleInterval(24 * 30) > 10_000);
});
