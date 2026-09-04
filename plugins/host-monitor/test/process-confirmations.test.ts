import assert from "node:assert/strict";
import test from "node:test";
import {
  ProcessConfirmationStore,
  type ProcessConfirmationPayload,
} from "../lib/process-confirmations.ts";

const payload: ProcessConfirmationPayload = {
  hostId: "host-alpha",
  hostName: "Alpha",
  pid: 42,
  name: "worker",
  identity: "i".repeat(43),
  mode: "graceful",
};

function tokenFactory(): () => string {
  let index = 0;
  return () => String(index++).padStart(43, "a");
}

test("process confirmations are one-use and consumed before remote work", () => {
  const store = new ProcessConfirmationStore({
    tokenFactory: tokenFactory(),
    ttlMs: 1_000,
  });
  const issued = store.issue(payload, 10_000);

  assert.equal(issued.expiresAtMs, 11_000);
  assert.deepEqual(store.consume(issued.confirmationToken, 10_999), {
    outcome: "ok",
    confirmation: { ...payload, expiresAtMs: 11_000 },
  });
  assert.deepEqual(store.consume(issued.confirmationToken, 10_999), {
    outcome: "invalid",
  });
});

test("process confirmations expire at the deadline and stay one-use", () => {
  const store = new ProcessConfirmationStore({
    tokenFactory: tokenFactory(),
    ttlMs: 60_000,
  });
  const issued = store.issue(payload, 100);

  assert.deepEqual(store.consume(issued.confirmationToken, 60_100), {
    outcome: "expired",
  });
  assert.deepEqual(store.consume(issued.confirmationToken, 60_100), {
    outcome: "invalid",
  });
});

test("a new challenge invalidates every prior mode for the same process identity", () => {
  const store = new ProcessConfirmationStore({
    tokenFactory: tokenFactory(),
    ttlMs: 60_000,
  });
  const first = store.issue(payload, 1_000);
  const replacement = store.issue({ ...payload, mode: "force" }, 1_001);

  assert.deepEqual(store.consume(first.confirmationToken, 1_002), {
    outcome: "invalid",
  });
  assert.deepEqual(store.consume(replacement.confirmationToken, 1_002), {
    outcome: "ok",
    confirmation: {
      ...payload,
      mode: "force",
      expiresAtMs: 61_001,
    },
  });
});

test("process confirmation storage is bounded and prunes expired entries", () => {
  const store = new ProcessConfirmationStore({
    tokenFactory: tokenFactory(),
    ttlMs: 100,
    maxEntries: 2,
  });
  store.issue(payload, 1_000);
  store.issue({ ...payload, pid: 43 }, 1_000);
  assert.throws(
    () => store.issue({ ...payload, pid: 44 }, 1_000),
    /too many process confirmations/iu,
  );

  assert.doesNotThrow(() => store.issue({ ...payload, pid: 44 }, 1_100));
});

test("process confirmation options reject unbounded configurations", () => {
  assert.throws(
    () => new ProcessConfirmationStore({ ttlMs: 0 }),
    /TTL/iu,
  );
  assert.throws(
    () => new ProcessConfirmationStore({ maxEntries: 0 }),
    /capacity/iu,
  );
});
