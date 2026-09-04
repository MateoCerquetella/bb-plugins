import assert from "node:assert/strict";
import test from "node:test";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import {
  executeTerminationResultSchema,
  preparedTerminationSchema,
  processListResultSchema,
  type ProcessRow,
} from "../contract.ts";
import plugin, {
  PROCESS_HOST_CALL_TIMEOUT_MS,
  PROCESS_TERMINATION_HOST_CALL_TIMEOUT_MS,
} from "../server.ts";

type HostRecord = Awaited<
  ReturnType<BbPluginApi["sdk"]["hosts"]["list"]>
>[number];

function hostRecord(
  status: HostRecord["status"] = "connected",
): HostRecord {
  return {
    id: "host-alpha",
    name: "Alpha",
    type: "persistent",
    status,
    maxPermissionMode: "full",
    lastSeenAt: Date.now(),
    lastRejectedProtocolVersion: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

const identity = "i".repeat(43);
const processRow: ProcessRow = {
  pid: 42,
  name: "worker",
  identity,
  cpuPercent: 35,
  rssBytes: 64 * 1024 ** 2,
  memoryPercent: 5,
  startedAtMs: 1_000,
  ownerCategory: "same-user",
  allowedTerminationModes: ["graceful", "force"],
  blockedReason: null,
};

test("termination timeout has clear headroom over bounded Windows commands", () => {
  const boundedWindowsForceMs = 4_000 + 160 + 10_000 + 4_000;
  assert.equal(PROCESS_HOST_CALL_TIMEOUT_MS, 20_000);
  assert.equal(PROCESS_TERMINATION_HOST_CALL_TIMEOUT_MS, 30_000);
  assert.ok(
    PROCESS_TERMINATION_HOST_CALL_TIMEOUT_MS - boundedWindowsForceMs >= 10_000,
  );
});

function hostProcessList() {
  return {
    sampledAtMs: 2_000,
    platform: "linux" as const,
    elevated: false,
    totalCount: 1,
    truncated: false,
    processes: [processRow],
  };
}

function preparedProcess(mode: "graceful" | "force" = "graceful") {
  return {
    outcome: "ready" as const,
    process: {
      pid: processRow.pid,
      name: processRow.name,
      identity,
      mode,
      cpuPercent: processRow.cpuPercent,
      rssBytes: processRow.rssBytes,
      memoryPercent: processRow.memoryPercent,
      startedAtMs: processRow.startedAtMs,
    },
  };
}

test("listProcesses routes only to the explicit enrolled connected host", async (t) => {
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    sdk: { hosts: { list: async () => [hostRecord()] } },
    experimental_callHostRpc: ({ method }) => {
      assert.equal(method, "listProcesses");
      return hostProcessList();
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const result = processListResultSchema.parse(
    await fake.harness.behavior.callRpc("listProcesses", {
      hostId: "host-alpha",
      sortBy: "cpu",
      limit: 25,
    }),
  );
  assert.equal(result.outcome, "ok");
  assert.deepEqual(
    fake.harness.inspection.experimental_hostRpcCalls.map((call) => ({
      method: call.method,
      hostId: call.hostId,
      input: call.input,
    })),
    [
      {
        method: "listProcesses",
        hostId: "host-alpha",
        input: { sortBy: "cpu", limit: 25 },
      },
    ],
  );
});

test("identical overlapping process polls are coalesced", async (t) => {
  let resolveHostCall!: (value: ReturnType<typeof hostProcessList>) => void;
  const hostCall = new Promise<ReturnType<typeof hostProcessList>>((resolve) => {
    resolveHostCall = resolve;
  });
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    sdk: { hosts: { list: async () => [hostRecord()] } },
    experimental_callHostRpc: () => hostCall,
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);
  const input = { hostId: "host-alpha", sortBy: "memory", limit: 50 } as const;

  const first = fake.harness.behavior.callRpc("listProcesses", input);
  const second = fake.harness.behavior.callRpc("listProcesses", input);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fake.harness.inspection.experimental_hostRpcCalls.length, 1);
  resolveHostCall(hostProcessList());
  assert.deepEqual(await first, await second);
});

test("termination preparation waits behind one active poll on the same host", async (t) => {
  let resolveList!: (value: ReturnType<typeof hostProcessList>) => void;
  const listCall = new Promise<ReturnType<typeof hostProcessList>>((resolve) => {
    resolveList = resolve;
  });
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    sdk: { hosts: { list: async () => [hostRecord()] } },
    experimental_callHostRpc: ({ method }) => {
      if (method === "listProcesses") return listCall;
      if (method === "inspectProcessTermination") return preparedProcess();
      throw new Error(`Unexpected method ${method}`);
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const list = fake.harness.behavior.callRpc("listProcesses", {
    hostId: "host-alpha",
    sortBy: "cpu",
    limit: 25,
  });
  const prepare = fake.harness.behavior.callRpc("prepareProcessTermination", {
    hostId: "host-alpha",
    pid: 42,
    identity,
    mode: "graceful",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    fake.harness.inspection.experimental_hostRpcCalls.map((call) => call.method),
    ["listProcesses"],
  );
  resolveList(hostProcessList());
  await list;
  const prepared = preparedTerminationSchema.parse(await prepare);
  assert.equal(prepared.outcome, "ready");
  assert.deepEqual(
    fake.harness.inspection.experimental_hostRpcCalls.map((call) => call.method),
    ["listProcesses", "inspectProcessTermination"],
  );
});

test("offline and unknown hosts never start a host worker", async (t) => {
  let hosts = [hostRecord("disconnected")];
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    sdk: { hosts: { list: async () => hosts } },
    experimental_callHostRpc: () => {
      throw new Error("host call must not run");
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  assert.deepEqual(
    await fake.harness.behavior.callRpc("listProcesses", {
      hostId: "host-alpha",
      sortBy: "name",
      limit: 10,
    }),
    {
      outcome: "offline",
      message: "Connect this machine before inspecting its processes.",
    },
  );
  hosts = [];
  assert.deepEqual(
    await fake.harness.behavior.callRpc("listProcesses", {
      hostId: "host-missing",
      sortBy: "name",
      limit: 10,
    }),
    {
      outcome: "not-found",
      message: "That enrolled machine no longer exists.",
    },
  );
  assert.equal(fake.harness.inspection.experimental_hostRpcCalls.length, 0);
});

test("prepare issues a one-use challenge and execute consumes it before dispatch", async (t) => {
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    sdk: { hosts: { list: async () => [hostRecord()] } },
    experimental_callHostRpc: ({ method }) => {
      if (method === "inspectProcessTermination") return preparedProcess();
      if (method === "terminateProcess") {
        return { outcome: "signal-sent", message: "Signal sent." };
      }
      throw new Error(`Unexpected method ${method}`);
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const prepared = preparedTerminationSchema.parse(
    await fake.harness.behavior.callRpc("prepareProcessTermination", {
      hostId: "host-alpha",
      pid: 42,
      identity,
      mode: "graceful",
    }),
  );
  assert.equal(prepared.outcome, "ready");
  if (prepared.outcome !== "ready") return;
  assert.match(prepared.confirmationToken, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(prepared.process.cpuPercent, 35);

  const executed = executeTerminationResultSchema.parse(
    await fake.harness.behavior.callRpc("executeProcessTermination", {
      confirmationToken: prepared.confirmationToken,
    }),
  );
  assert.equal(executed.outcome, "signal-sent");
  const reused = executeTerminationResultSchema.parse(
    await fake.harness.behavior.callRpc("executeProcessTermination", {
      confirmationToken: prepared.confirmationToken,
    }),
  );
  assert.equal(reused.outcome, "confirmation-invalid");
  assert.deepEqual(
    fake.harness.inspection.experimental_hostRpcCalls.map((call) => call.method),
    ["inspectProcessTermination", "terminateProcess"],
  );
  assert.ok(
    fake.harness.logEntries.some(
      (entry) =>
        entry.level === "info" &&
        entry.message.includes(
          "Process control host=host-alpha pid=42 mode=graceful outcome=signal-sent",
        ) &&
        !entry.message.includes(prepared.confirmationToken) &&
        !entry.message.includes("worker"),
    ),
  );
});

test("execute reports known preflight failure before dispatch and unknown transport outcome after dispatch", async (t) => {
  let connected = true;
  let terminateShouldThrow = false;
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    sdk: {
      hosts: {
        list: async () => [hostRecord(connected ? "connected" : "disconnected")],
      },
    },
    experimental_callHostRpc: ({ method }) => {
      if (method === "inspectProcessTermination") return preparedProcess();
      if (method === "terminateProcess" && terminateShouldThrow) {
        throw new Error("connection dropped");
      }
      return { outcome: "signal-sent", message: "Signal sent." };
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const first = preparedTerminationSchema.parse(
    await fake.harness.behavior.callRpc("prepareProcessTermination", {
      hostId: "host-alpha",
      pid: 42,
      identity,
      mode: "graceful",
    }),
  );
  assert.equal(first.outcome, "ready");
  if (first.outcome !== "ready") return;
  connected = false;
  const preflight = executeTerminationResultSchema.parse(
    await fake.harness.behavior.callRpc("executeProcessTermination", {
      confirmationToken: first.confirmationToken,
    }),
  );
  assert.equal(preflight.outcome, "signal-failed");

  connected = true;
  const second = preparedTerminationSchema.parse(
    await fake.harness.behavior.callRpc("prepareProcessTermination", {
      hostId: "host-alpha",
      pid: 42,
      identity,
      mode: "graceful",
    }),
  );
  assert.equal(second.outcome, "ready");
  if (second.outcome !== "ready") return;
  terminateShouldThrow = true;
  const uncertain = executeTerminationResultSchema.parse(
    await fake.harness.behavior.callRpc("executeProcessTermination", {
      confirmationToken: second.confirmationToken,
    }),
  );
  assert.equal(uncertain.outcome, "outcome-unknown");
});
