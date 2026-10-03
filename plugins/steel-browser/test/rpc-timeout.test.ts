import assert from "node:assert/strict";
import { test } from "node:test";
import { boundedRpc, callSteelRpc } from "../rpc-timeout.ts";

test("RPC returns successful results and preserves actionable errors", async () => {
  assert.equal(await boundedRpc(Promise.resolve("connected"), "dashboard", 20), "connected");
  const error = new Error("Docker is unavailable");
  await assert.rejects(boundedRpc(Promise.reject(error), "dashboard", 20), e => e === error);
});

test("stalled RPC expires without replaying the operation or accepting a late result", async () => {
  let finish!: (value: string) => void;
  const pending = new Promise<string>(resolve => { finish = resolve; });
  const result = boundedRpc(pending, "createSession", 10);
  await assert.rejects(result, /request may still finish.*Refresh/);
  finish("late session");
  await assert.rejects(result, /did not respond to Steel createSession/);
  assert.equal(await boundedRpc(Promise.resolve("recovered"), "dashboard", 20), "recovered");
});

test("late RPC rejection after timeout is handled", async () => {
  let fail!: (reason: Error) => void;
  const pending = new Promise<never>((_, reject) => { fail = reject; });
  await assert.rejects(boundedRpc(pending, "project", 10), /did not respond/);
  fail(new Error("late transport error"));
  await new Promise(resolve => setTimeout(resolve, 0));
});

test("stalled reads retry once and recover, while permanent hangs are bounded", async () => {
  let calls = 0;
  assert.equal(await callSteelRpc(() => ++calls === 1 ? new Promise<string>(() => {}) : Promise.resolve("connected"),
    "dashboard", 10), "connected");
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(callSteelRpc(() => { calls++; return new Promise(() => {}); }, "project", 10), /did not respond/);
  assert.equal(calls, 2);
});

test("mutations and explicit server failures are never replayed", async () => {
  for (const method of ["createSession", "releaseSession", "setEngine"]) {
    let calls = 0;
    await assert.rejects(callSteelRpc(() => { calls++; return new Promise(() => {}); }, method, 10), /Refresh/);
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(callSteelRpc(() => { calls++; return Promise.reject(new Error("Ownership mismatch")); },
    "dashboard", 10), /Ownership mismatch/);
  assert.equal(calls, 1);
});
