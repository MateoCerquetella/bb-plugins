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
