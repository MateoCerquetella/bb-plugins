import assert from "node:assert/strict";
import { test } from "node:test";
import type { PluginKvStorage } from "@get-bb/plugin-sdk";
import type { Dashboard } from "../contract.ts";
import { liveViewerUrl, trustedViewerMessage, validatePaste } from "../viewer-protocol.ts";
import { SignIns } from "../sign-ins.ts";
import { SERVICES } from "../service-catalog.ts";
import { DashboardCache } from "../dashboard-cache.ts";
import { executeBrowserAction } from "../actions.ts";
import type { Page } from "playwright";

test("viewer URL pins the authenticated origin and enables the native bridge", () => {
  const dashboard = { connected: true, uiUrl: "https://project.test/ui",
    sessions: [{ status: "idle", debugUrl: "https://evil.test/v1/sessions/debug" }] } as Dashboard;
  assert.equal(liveViewerUrl(dashboard),
    "https://project.test/v1/sessions/debug?interactive=true&clipboardBridge=true");
  dashboard.sessions[0]!.debugUrl = "https://project.test/v1/sessions/session-id/debug?theme=light";
  assert.equal(liveViewerUrl(dashboard),
    "https://project.test/v1/sessions/session-id/debug?theme=light&interactive=true&clipboardBridge=true");
  dashboard.uiUrl = "http://127.0.0.1:3100/ui";
  assert.equal(liveViewerUrl(dashboard), null);
  assert.equal(liveViewerUrl(null), null);
});

test("clipboard bridge requires exact source and origin; login paste rejects control keys", () => {
  const frame = {} as Window;
  const valid = { source: frame, origin: "https://project.test", data: { type: "clipboardBridgeReady" } };
  assert(trustedViewerMessage(valid, frame, "https://project.test/v1/sessions/debug"));
  assert(!trustedViewerMessage({ ...valid, source: {} as Window }, frame, "https://project.test"));
  assert(!trustedViewerMessage({ ...valid, origin: "https://evil.test" }, frame, "https://project.test"));
  assert(!trustedViewerMessage({ ...valid, data: null }, frame, "https://project.test"));
  assert.equal(validatePaste("dummy password with spaces"), null);
  for (const value of ["", "line\nsubmit", "tab\tfield", "\r", "\u0000", "x".repeat(4097)]) {
    assert(validatePaste(value));
  }
});

test("sign-in labels are scoped, validated and explicitly forgettable without profile access", async () => {
  const values = new Map<string, unknown>();
  const accounts = new SignIns({
    get: async (key: string) => values.get(key),
    set: async (key: string, value: unknown) => { values.set(key, value); },
  } as PluginKvStorage);
  assert.deepEqual(await accounts.list("one"), []);
  const saved = await accounts.confirm("one", "github", " dummy-user ");
  assert.equal(saved[0]!.label, "dummy-user");
  assert(saved[0]!.confirmedAt);
  assert.deepEqual(await accounts.list("two"), []);
  await accounts.confirm("two", "github", "other-user");
  await accounts.forget("one", "github");
  assert.deepEqual(await accounts.list("one"), []);
  assert.equal((await accounts.list("two"))[0]!.label, "other-user");
  await assert.rejects(accounts.confirm("one", "github", " "));
  await assert.rejects(accounts.confirm("one", "github", "bad\nlabel"));
  await assert.rejects(accounts.confirm("one", "github", "x".repeat(121)));
});

test("service login navigates only to the service catalog and never runs a model", async () => {
  const visited: string[] = [];
  const page = {
    goto: async (url: string) => { visited.push(url); },
    bringToFront: async () => {},
  } as unknown as Page;
  for (const service of SERVICES) {
    assert.deepEqual(await executeBrowserAction(page, { kind: "openSignIn", service: service.id }), { opened: true });
  }
  assert.deepEqual(visited, SERVICES.map(service => service.url));
  await assert.rejects(executeBrowserAction(page,
    { kind: "openSignIn", service: "unknown" as "github" }), /Unsupported/);
});

test("dashboard coalesces concurrent reads, expires and invalidates after mutation", async () => {
  let now = 0;
  let calls = 0;
  const cache = new DashboardCache<number>(() => now);
  const load = async () => ++calls;
  assert.deepEqual(await Promise.all([cache.read("one", load), cache.read("one", load)]), [1, 1]);
  assert.equal(await cache.read("one", load), 1);
  assert.equal(await cache.read("two", load), 2);
  now = 2001;
  assert.equal(await cache.read("one", load), 3);
  cache.invalidate("one");
  assert.equal(await cache.read("one", load), 4);
  cache.invalidate("one");
  await assert.rejects(cache.read("one", async () => { throw new Error("unavailable"); }));
  assert.equal(await cache.read("one", load), 5);
});
