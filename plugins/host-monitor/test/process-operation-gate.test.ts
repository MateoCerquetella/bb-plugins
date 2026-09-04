import assert from "node:assert/strict";
import test from "node:test";
import {
  HostProcessOperationGate,
  ProcessOperationBusyError,
  ProcessOperationClosedError,
} from "../lib/process-operation-gate.ts";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("process operations serialize per host while different hosts stay independent", async () => {
  const gate = new HostProcessOperationGate();
  const firstDone = deferred();
  const order: string[] = [];
  const first = gate.run("host-a", async () => {
    order.push("a1-start");
    await firstDone.promise;
    order.push("a1-end");
  });
  const second = gate.run("host-a", async () => {
    order.push("a2");
  });
  const other = gate.run("host-b", async () => {
    order.push("b1");
  });

  await other;
  assert.deepEqual(order, ["a1-start", "b1"]);
  firstDone.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["a1-start", "b1", "a1-end", "a2"]);
});

test("process operation waiting is strictly bounded", async () => {
  const gate = new HostProcessOperationGate(1);
  const activeDone = deferred();
  const active = gate.run("host-a", () => activeDone.promise);
  const waiting = gate.run("host-a", async () => undefined);
  await assert.rejects(
    gate.run("host-a", async () => undefined),
    ProcessOperationBusyError,
  );
  activeDone.resolve();
  await Promise.all([active, waiting]);
});

test("a synchronous operation throw cannot wedge the host queue", async () => {
  const gate = new HostProcessOperationGate();
  await assert.rejects(
    gate.run("host-a", () => {
      throw new Error("stale host client");
    }),
    /stale host client/iu,
  );
  assert.equal(
    await gate.run("host-a", async () => "recovered"),
    "recovered",
  );
});

test("closing the gate rejects queued destructive work without starting it", async () => {
  const gate = new HostProcessOperationGate();
  const pollDone = deferred();
  let actionStarted = false;
  const poll = gate.run("host-a", () => pollDone.promise);
  const action = gate.run("host-a", async () => {
    actionStarted = true;
  });

  gate.close();
  await assert.rejects(action, ProcessOperationClosedError);
  assert.equal(actionStarted, false);
  await assert.rejects(
    gate.run("host-a", async () => undefined),
    ProcessOperationClosedError,
  );
  pollDone.resolve();
  await poll;
  assert.equal(actionStarted, false);
});
