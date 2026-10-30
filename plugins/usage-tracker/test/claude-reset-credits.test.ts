import assert from "node:assert/strict";
import test from "node:test";
import { claudeResetCount } from "../lib/claude-reset-credits.ts";

test("counts the weekly session reset and granted resets", () => {
  assert.equal(
    claudeResetCount({
      juniper_tide: { available: true },
      cedar_ember: { grants: [{ resets_left: 2 }, { resets_left: 0 }] },
    }),
    3,
  );
  assert.equal(claudeResetCount({ juniper_tide: { available: false }, cedar_ember: { grants: [] } }), null);
  assert.equal(claudeResetCount({ juniper_tide: null, cedar_ember: null }), null);
  assert.equal(claudeResetCount("nope"), null);
});
