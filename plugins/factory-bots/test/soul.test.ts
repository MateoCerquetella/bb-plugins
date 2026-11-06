import assert from "node:assert/strict";
import test from "node:test";

import {
  characterDelta,
  diffLines,
  missingBots,
  newestAuditForBot,
  orderedSouls,
  soulSummary,
  storedTextMatches,
  toolsForBot,
  verifySavedSoul,
} from "../lib/soul.ts";

const soul = `# Helm

Implement the approved specification.

- Read the diff.
`;

test("summarizes the first non-heading prose line", () => {
  assert.equal(
    soulSummary(soul),
    "Implement the approved specification.",
  );
});

test("falls back when a soul has no prose", () => {
  assert.equal(soulSummary("# Heading\n\n## Another"), "No prose summary");
});

test("calculates the exact character delta", () => {
  assert.equal(characterDelta("abc", "abcde"), 2);
  assert.equal(characterDelta("abcde", "abc"), -2);
  assert.equal(characterDelta("abc", "abc"), 0);
});

test("diffs additions, removals, and unchanged lines", () => {
  const lines = diffLines("one\ntwo\nthree", "one\nTWO\nthree\nfour");
  assert.deepEqual(
    lines.map((line) => [line.kind, line.text]),
    [
      ["same", "one"],
      ["remove", "two"],
      ["add", "TWO"],
      ["same", "three"],
      ["add", "four"],
    ],
  );
});

test("selects the newest audit entry for the selected bot", () => {
  const entries = [
    { at: "2026-01-01T00:00:00Z", bot: "helm", author: "A", digest: "old" },
    { at: "2026-02-01T00:00:00Z", bot: "sieve", author: "B", digest: "sieve" },
    { at: "2026-03-01T00:00:00Z", bot: "helm", author: "C", digest: "new" },
  ];
  assert.equal(newestAuditForBot(entries, "helm")?.digest, "new");
  assert.equal(newestAuditForBot(entries, "audit"), null);
});

test("accepts the factory's single trailing newline normalization", () => {
  assert.equal(storedTextMatches("hello\n", "hello"), true);
  assert.equal(storedTextMatches("hello", "hello\n"), true);
  assert.equal(storedTextMatches("hello\n", "hello\n"), true);
  assert.equal(storedTextMatches("hello\n", "hello\n\n"), false);
  assert.equal(storedTextMatches("hello", "other"), false);
});

test("orders returned souls and reports missing bots without inventing them", () => {
  const souls = [
    { bot: "lens", soul: "removed bot" },
    { bot: "orchestrator", soul: "orchestrator" },
    { bot: "unknown", soul: "unknown" },
    { bot: "helm", soul: "helm" },
  ];
  assert.deepEqual(
    orderedSouls(souls).map((entry) => entry.bot),
    ["orchestrator", "helm"],
  );
  assert.deepEqual(missingBots(souls), ["sieve"]);
});

test("verifies a read-back soul and attaches the newest audit row", () => {
  const audit = [
    { at: "2026-01-01T00:00:00Z", bot: "helm", author: "Old", digest: "old" },
    { at: "2026-03-01T00:00:00Z", bot: "helm", author: "New", digest: "new" },
  ];
  const result = verifySavedSoul(
    "helm",
    "new text",
    [{ bot: "helm", soul: "new text\n" }],
    audit,
  );
  assert.equal(result.verified, true);
  assert.equal(result.audit?.digest, "new");
  const mismatch = verifySavedSoul(
    "helm",
    "new text",
    [{ bot: "helm", soul: "another text\n" }],
    audit,
  );
  assert.equal(mismatch.verified, false);
  assert.equal(
    verifySavedSoul("helm", "new text", [], audit).verified,
    false,
  );
});

test("reads a tool list only for the selected bot", () => {
  assert.deepEqual(toolsForBot({ helm: ["Read"] }, "helm"), ["Read"]);
  assert.equal(toolsForBot({ helm: ["Read"] }, "sieve"), null);
  assert.equal(toolsForBot(null, "helm"), null);
});
