import assert from "node:assert/strict";
import test from "node:test";

import {
  BOT_ORDER,
  BotNameSchema,
  FactoryStatusPayloadSchema,
  SaveSoulInputSchema,
  SoulAuditPayloadSchema,
  SoulsPayloadSchema,
  SaveResultSchema,
} from "../contract.ts";

test("pins the Factory bot order", () => {
  assert.deepEqual([...BOT_ORDER], [
    "orchestrator",
    "sieve",
    "helm",
    "lens",
    "warden",
    "audit",
    "lookback",
  ]);
  assert.equal(BotNameSchema.safeParse("sieve").success, true);
  assert.equal(BotNameSchema.safeParse("unknown").success, false);
});

test("parses souls and audit payloads", () => {
  assert.deepEqual(
    SoulsPayloadSchema.parse({
      souls: [{ bot: "sieve", soul: "# Sieve\nSpecify." }],
    }),
    { souls: [{ bot: "sieve", soul: "# Sieve\nSpecify." }] },
  );
  assert.deepEqual(
    SoulAuditPayloadSchema.parse({
      entries: [
        {
          at: "2026-03-01T12:00:00Z",
          bot: "sieve",
          author: "Mateo",
          digest: "sha256:abc",
        },
      ],
    }).entries[0]?.digest,
    "sha256:abc",
  );
});

test("accepts status without a tool map and preserves optional tool maps", () => {
  assert.deepEqual(
    FactoryStatusPayloadSchema.parse({
      bots: { sieve: 7 },
      storage: "/tmp/factory.sqlite",
    }).toolsByBot,
    undefined,
  );
  assert.deepEqual(
    FactoryStatusPayloadSchema.parse({
      toolsByBot: { sieve: ["Read"] },
    }).toolsByBot,
    { sieve: ["Read"] },
  );
});

test("requires a bot, non-empty soul, and trimmed author for a save", () => {
  assert.deepEqual(
    SaveSoulInputSchema.parse({
      bot: "lens",
      soul: "full replacement",
      author: "  Mateo  ",
    }),
    { bot: "lens", soul: "full replacement", author: "Mateo" },
  );
  assert.equal(
    SaveSoulInputSchema.safeParse({
      bot: "lens",
      soul: "",
      author: "Mateo",
    }).success,
    false,
  );
  assert.equal(
    SaveSoulInputSchema.safeParse({
      bot: "lens",
      soul: "text",
      author: "   ",
    }).success,
    false,
  );
  assert.equal(
    SaveSoulInputSchema.safeParse({
      bot: "unknown",
      soul: "text",
      author: "Mateo",
    }).success,
    false,
  );
});

test("a successful save result needs a digest", () => {
  assert.equal(
    SaveResultSchema.safeParse({
      ok: true,
      fetchedAt: 1,
      bot: "sieve",
      digest: "sha256:abc",
    }).success,
    true,
  );
  assert.equal(
    SaveResultSchema.safeParse({
      ok: true,
      fetchedAt: 1,
      bot: "sieve",
    }).success,
    false,
  );
});
