import assert from "node:assert/strict";
import { test } from "node:test";
import { ProjectBrowsers } from "../projects.ts";
import { chooseEngine } from "../engines.ts";

function store() {
  const data = new Map<string, unknown>();
  return new ProjectBrowsers({
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async set(key, value) { data.set(key, value); },
    async delete(key) { data.delete(key); },
    async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
  });
}
const binding = { apiUrl: "http://127.0.0.1:3200", cdpUrl: "http://127.0.0.1:9300", viewerUrl: "https://project.test" };

test("project bindings are isolated, immutable and fail closed", async () => {
  const projects = store();
  await assert.rejects(projects.require("missing"), /no browser/);
  await projects.bind("a", binding);
  assert.equal((await projects.require("a")).apiUrl, binding.apiUrl);
  assert.equal(await projects.binding("b"), null);
  await assert.rejects(projects.bind("b", binding), /another project/);
  await assert.rejects(projects.bind("a", { ...binding, apiUrl: "http://127.0.0.1:3201" }), /replacement/);
  await assert.rejects(projects.bind("b", { ...binding, apiUrl: "https://remote.test" }), /127/);
});
test("engine preferences do not leak between projects", async () => {
  const projects = store();
  await projects.setPolicy("a", { engine: "auto", fallback: true });
  assert.deepEqual(await projects.policy("b"), { engine: "playwright", fallback: false });
  assert.deepEqual(await projects.policy("a"), { engine: "auto", fallback: true });
});

test("automatic setup serializes projects, coalesces duplicates, and revalidates bindings", async () => {
  const projects = store();
  const calls: string[] = [];
  let active = 0;
  const provision = async (id: string) => {
    calls.push(id);
    assert.equal(++active, 1);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return id === "a" ? binding : { apiUrl: "http://127.0.0.1:3202", cdpUrl: "http://127.0.0.1:9302", viewerUrl: "https://b.test" };
  };
  const [a, repeated, b] = await Promise.all([
    projects.ensure("a", provision), projects.ensure("a", provision), projects.ensure("b", provision),
  ]);
  assert.deepEqual(a, repeated);
  assert.notEqual(a.apiUrl, b.apiUrl);
  assert.deepEqual(calls, ["a", "b"]);
  assert.deepEqual(await projects.ensure("a", provision), a);
  assert.deepEqual(calls, ["a", "b", "a"]);
});

test("failed provisioning persists nothing and a later request can retry", async () => {
  const projects = store();
  await assert.rejects(projects.ensure("a", async () => { throw new Error("Docker offline"); }), /Docker offline/);
  assert.equal(await projects.binding("a"), null);
  assert.deepEqual(await projects.ensure("a", async () => binding), binding);
  await assert.rejects(projects.ensure("b", async () => binding), /another project/);
  assert.equal(await projects.binding("b"), null);
});

test("healthy stored bindings coalesce probes and bypass provisioning", async () => {
  const projects = store();
  await projects.bind("a", binding);
  let probes = 0;
  const ready = async () => { probes++; return true; };
  const provision = async () => { throw new Error("must not provision"); };
  const results = await Promise.all([
    projects.ensure("a", provision, ready), projects.ensure("a", provision, ready),
  ]);
  assert.deepEqual(results, [binding, binding]);
  assert.equal(probes, 1);
});

test("recent healthy bindings avoid repeated probes but expire for recovery", async () => {
  let now = 0;
  const data = new Map<string, unknown>();
  const projects = new ProjectBrowsers({
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async set(key, value) { data.set(key, value); },
    async delete(key) { data.delete(key); },
    async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
  }, () => now);
  await projects.bind("a", binding);
  let probes = 0;
  let repairs = 0;
  const ready = async () => ++probes < 2;
  const provision = async (_id: string, existing: typeof binding | null) => {
    repairs++;
    return existing!;
  };
  await projects.ensure("a", provision, ready);
  now = 9_999;
  await projects.ensure("a", provision, ready);
  assert.equal(probes, 1);
  now = 10_000;
  await projects.ensure("a", provision, ready);
  assert.equal(probes, 2);
  assert.equal(repairs, 1);
});

test("failed readiness repairs only the stored project and preserves its binding", async () => {
  const projects = store();
  await projects.bind("a", binding);
  let repairs = 0;
  assert.deepEqual(await projects.ensure("a", async (id, existing) => {
    assert.equal(id, "a");
    assert.deepEqual(existing, binding);
    repairs++;
    return existing!;
  }, async () => false), binding);
  assert.equal(repairs, 1);
});

test("viewer readiness errors are not cached and never enter container provisioning", async () => {
  const projects = store();
  await projects.bind("a", binding);
  let attempts = 0;
  const ready = async () => {
    if (++attempts === 1) throw new Error("Connect unavailable");
    return true;
  };
  const provision = async () => { assert.fail("share failures must not recreate containers"); };
  await assert.rejects(projects.ensure("a", provision, ready), /Connect unavailable/);
  assert.deepEqual(await projects.require("a"), binding);
  assert.deepEqual(await projects.ensure("a", provision, ready), binding);
  await projects.ensure("a", provision, ready);
  assert.equal(attempts, 2);
});

test("healthy projects do not wait for another project's slow setup", async () => {
  const projects = store();
  await projects.bind("a", binding);
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const pending = projects.ensure("b", async () => {
    await gate;
    return { apiUrl: "http://127.0.0.1:3202", cdpUrl: "http://127.0.0.1:9302", viewerUrl: "https://b.test" };
  });
  try {
    assert.deepEqual(await projects.ensure("a", async () => { throw new Error("unexpected repair"); }, async () => true), binding);
  } finally {
    finish();
    await pending;
  }
});

test("existing bindings are passed into recovery and retained after a failed check", async () => {
  const projects = store();
  await projects.bind("a", binding);
  await assert.rejects(projects.ensure("a", async (_id, existing) => {
    assert.deepEqual(existing, binding);
    throw new Error("CDP unavailable");
  }), /CDP unavailable/);
  assert.deepEqual(await projects.binding("a"), binding);
  assert.deepEqual(await projects.ensure("a", async (_id, existing) => existing!), binding);
});
test("fallback is opt-in and only selects an engine during preflight", async () => {
  const calls: string[] = [];
  const preflight = async (engine: string) => { calls.push(engine); if (engine === "jev") throw new Error("no key"); };
  await assert.rejects(chooseEngine({ engine: "jev", fallback: false }, preflight), /No browser action/);
  assert.deepEqual(calls, ["jev"]);
  const selected = await chooseEngine({ engine: "auto", fallback: true }, preflight);
  assert.equal(selected.engine, "playwright");
  assert.equal(selected.fallbackReason, "jev unavailable before execution");
});

test("cancellation during preflight never dispatches fallback", async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  await assert.rejects(chooseEngine({ engine: "auto", fallback: true }, async engine => {
    calls.push(engine);
    controller.abort();
    throw new Error("Cancelled");
  }, controller.signal), { name: "AbortError" });
  assert.deepEqual(calls, ["jev"]);
});
