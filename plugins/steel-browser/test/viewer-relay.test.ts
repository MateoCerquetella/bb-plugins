import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { WebSocketServer } from "ws";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { registerViewerRelay } from "../viewer-relay.ts";

const player = `<script>const baseWsUrl = 'wss://separate-connect.test/v1/sessions/cast';
function cast(pageId) { return pageId === 'tab-discovery'
  ? \`\${baseWsUrl}?tabInfo=true\` : \`\${baseWsUrl}?pageId=\${encodeURIComponent(pageId)}\`; }</script>`;

async function fixture() {
  const requests: { url: string; cookie?: string; authorization?: string }[] = [];
  const server = createServer((req, res) => {
    requests.push({ url: req.url!, cookie: req.headers.cookie, authorization: req.headers.authorization });
    res.writeHead(200, { "content-type": "text/html", "set-cookie": "upstream-only=dummy" });
    res.end(player);
  });
  const sockets = new WebSocketServer({ server });
  sockets.on("connection", (socket, req) => {
    requests.push({ url: req.url! });
    socket.send("ready");
    socket.on("message", (data, binary) => socket.send(data, { binary }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const host = createFakePluginHost({ pluginId: "steel-browser" });
  registerViewerRelay(host.bb, async scope => {
    if (scope.projectId !== "project-one") throw Error("Unknown project");
    return { apiUrl: `http://127.0.0.1:${address.port}`, cdpUrl: "http://127.0.0.1:9222", viewerUrl: "https://separate-connect.test" };
  });
  return { host, requests, sockets, async close() {
    await host.harness.lifecycle.dispose();
    for (const client of sockets.clients) client.terminate();
    sockets.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  } };
}

async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert(check(), "Expected relay event did not arrive");
}

test("viewer uses BB local auth, retains frame protection and never forwards browser credentials", async () => {
  const f = await fixture();
  try {
    const response = await f.host.harness.behavior.fetchHttp("GET", "/viewer?projectId=project-one", {
      headers: { cookie: "bb-session=dummy", authorization: "Bearer dummy" },
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /\/api\/v1\/plugins\/steel-browser\/http\/viewer-cast\?projectId=project-one/u);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.match(response.headers.get("content-security-policy")!, /frame-ancestors 'self'/u);
    assert.deepEqual(f.requests, [{ url: "/v1/sessions/debug?interactive=true&clipboardBridge=true", cookie: undefined, authorization: undefined }]);
    const registrations = f.host.harness.inspection.registrations;
    assert.equal(registrations.httpRoutes[0]!.auth, "local");
    assert.equal(registrations.websocketRoutes[0]!.auth, "local");
    assert.equal((await f.host.harness.behavior.fetchHttp("GET", "/viewer")).status, 400);
    assert.equal((await f.host.harness.behavior.fetchHttp("GET", "/viewer?projectId=one&projectId=two")).status, 400);
    assert.equal((await f.host.harness.behavior.fetchHttp("GET", "/viewer?projectId=unknown")).status, 502);
  } finally { await f.close(); }
});

test("viewer relays text, binary input and scoped tab discovery; disposal closes the upstream", async () => {
  const f = await fixture();
  try {
    const socket = await f.host.harness.behavior.experimental_openWebSocket("/viewer-cast?projectId=project-one&tabInfo=true");
    await until(() => socket.sent.includes("ready"));
    await socket.receive("dummy-input");
    await socket.receive(new Uint8Array([1, 2, 3]));
    await until(() => socket.sent.length === 3);
    assert.equal(socket.sent[1], "dummy-input");
    assert.deepEqual(socket.sent[2], new Uint8Array([1, 2, 3]));
    assert.equal(f.requests[0]!.url, "/v1/sessions/cast?tabInfo=true");
    await f.host.harness.lifecycle.dispose();
    await until(() => f.sockets.clients.size === 0);
    assert(socket.closeCalls.length > 0);
  } finally { await f.close(); }
});

test("unknown projects, malformed page targets and oversized input never reach Steel", async () => {
  const f = await fixture();
  try {
    for (const query of ["projectId=unknown&tabInfo=true", "projectId=project-one&pageId=../json/version", "projectId=project-one"]) {
      const socket = await f.host.harness.behavior.experimental_openWebSocket(`/viewer-cast?${query}`);
      assert(socket.closeCalls.length > 0);
    }
    assert.equal(f.requests.length, 0);
    const socket = await f.host.harness.behavior.experimental_openWebSocket("/viewer-cast?projectId=project-one&tabInfo=true");
    await until(() => socket.sent.includes("ready"));
    await socket.receive("x".repeat(65537));
    assert(socket.closeCalls.length > 0);
  } finally { await f.close(); }
});
