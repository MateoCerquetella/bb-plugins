import assert from "node:assert/strict";
import test from "node:test";
import { cachedReader } from "../lib/reset-reader.ts";

test("cachedReader re-reads once per ttl and keeps the last good value on failure", async () => {
  let clock = 0;
  let calls = 0;
  const reader = cachedReader(
    async () => {
      calls += 1;
      if (calls === 3) throw new Error("boom");
      return calls;
    },
    100,
    () => clock,
  );
  assert.equal(await reader(), 1);
  assert.equal(await reader(), 1);
  assert.equal(calls, 1);
  clock = 150;
  assert.equal(await reader(), 2);
  clock = 300;
  assert.equal(await reader(), 2);
  assert.equal(calls, 3);
});
