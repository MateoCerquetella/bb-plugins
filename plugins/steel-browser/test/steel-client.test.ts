import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { afterEach, test } from "node:test";
import { normalizeBaseUrl, SteelClient, SteelClientError } from "../steel-client.ts";

let server: Server | null = null;

afterEach(async () => {
  if (server === null) return;
  await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  server = null;
});

async function fixture(initialStatus = "idle"): Promise<string> {
  let live = false;
  server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/v1/health") {
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (request.url === "/v1/sessions" && request.method === "GET") {
      response.end(JSON.stringify({ sessions: [{ ...upstreamSession(), status: live ? "live" : initialStatus }] }));
      return;
    }
    if (request.url === "/v1/sessions" && request.method === "POST") {
      live = true;
      response.end(JSON.stringify({ ...upstreamSession(), status: "live" }));
      return;
    }
    if (request.url === `/v1/sessions/${SESSION_ID}/release` && request.method === "POST") {
      response.end(JSON.stringify({ ...upstreamSession(), status: "released", success: true }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

const SESSION_ID = "0de0be06-1758-4672-a3c2-945f99c41fa3";

function upstreamSession() {
  return {
    id: SESSION_ID,
    createdAt: "2026-10-01T16:21:55.631Z",
    status: "idle",
    duration: 1234,
    eventCount: 2,
    websocketUrl: "ws://localhost:3100/",
    debugUrl: "http://localhost:3100/v1/sessions/debug",
    debuggerUrl: "http://localhost:3100/v1/devtools/inspector.html",
    sessionViewerUrl: "http://localhost:3100/",
    dimensions: { width: 1440, height: 900 },
    creditsUsed: 0,
    timeout: 0,
    proxyTxBytes: 0,
    proxyRxBytes: 0,
  };
}

test("normalizes a safe endpoint and rejects unsupported URL forms", () => {
  assert.equal(normalizeBaseUrl(" http://127.0.0.1:3100/ ").toString(), "http://127.0.0.1:3100/");
  assert.throws(() => normalizeBaseUrl("file:///tmp/steel"), SteelClientError);
  assert.throws(() => normalizeBaseUrl("https://user:pass@example.com"), SteelClientError);
  assert.throws(() => normalizeBaseUrl("https://example.com?token=secret"), SteelClientError);
});

test("loads a normalized dashboard", async () => {
  const client = new SteelClient(await fixture());
  const dashboard = await client.dashboard();
  assert.equal(dashboard.connected, true);
  assert.equal(dashboard.sessions.length, 1);
  assert.deepEqual(dashboard.sessions[0]?.dimensions, { width: 1440, height: 900 });
  assert.equal(dashboard.sessions[0]?.durationMs, 1234);
});

test("creates and releases an exact session", async () => {
  const client = new SteelClient(await fixture("released"));
  const created = await client.createSession({ blockAds: true, width: 1440, height: 900 });
  assert.equal(created.id, SESSION_ID);
  await assert.rejects(client.createSession({ blockAds: true, width: 1440, height: 900 }), /already live/);
  await assert.rejects(client.releaseSession("not-an-id"), /UUID/);
  await assert.rejects(client.releaseSession("d861f927-392a-4b2b-88e2-1c53933f78e9"), /not live/);
  assert.deepEqual(await client.releaseSession(SESSION_ID), { sessionId: SESSION_ID, success: true });
});

test("idle sessions can be released and block duplicate creation", async () => {
  const client = new SteelClient(await fixture());
  await assert.rejects(client.createSession({ blockAds: true, width: 1440, height: 900 }), /already live/);
  assert.deepEqual(await client.releaseSession(SESSION_ID), { sessionId: SESSION_ID, success: true });
});

test("returns a stable unavailable dashboard", async () => {
  const client = new SteelClient("http://127.0.0.1:1", fetch, 100);
  const dashboard = await client.dashboard();
  assert.equal(dashboard.connected, false);
  assert.equal(dashboard.sessions.length, 0);
  assert.equal(dashboard.error, "Steel is unavailable at the configured endpoint.");
});
