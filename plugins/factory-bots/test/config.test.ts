import assert from "node:assert/strict";
import { test } from "node:test";

import {
  loadMcpConfig,
  parseMcpConfig,
  shellQuote,
  startCommand,
} from "../lib/config.js";

const VALID = {
  command: "node",
  args: ["/opt/factory/dist/main.js", "mcp"],
  env: { FACTORY_URL: "http://127.0.0.1:8080" },
};

test("parses the factory MCP command as given", () => {
  assert.deepEqual(parseMcpConfig(VALID), VALID);
});

test("env defaults to an empty object", () => {
  assert.deepEqual(parseMcpConfig({ command: "node", args: [] }).env, {});
});

test("rejects a malformed config instead of starting a bad process", () => {
  assert.throws(() => parseMcpConfig(null), /JSON object/);
  assert.throws(() => parseMcpConfig({ args: [] }), /"command"/);
  assert.throws(() => parseMcpConfig({ command: "node", args: "mcp" }), /array of strings/);
  assert.throws(
    () => parseMcpConfig({ command: "node", args: [], env: { A: 1 } }),
    /env\.A must be a string/,
  );
});

test("derives the start command from the same config", () => {
  assert.equal(startCommand(parseMcpConfig(VALID)), "node /opt/factory/dist/main.js up");
  assert.equal(
    startCommand(parseMcpConfig({ command: "node", args: ["/opt/x.js"] })),
    "node /opt/x.js up",
  );
});

test("shell quotes only when needed", () => {
  assert.equal(shellQuote("/opt/factory/main.js"), "/opt/factory/main.js");
  assert.equal(shellQuote("/opt/my factory/main.js"), "'/opt/my factory/main.js'");
  assert.equal(shellQuote("it's"), "'it'\\''s'");
});

test("loads an explicit FACTORY_BOTS_MCP_CONFIG path", async () => {
  const loaded = await loadMcpConfig({
    moduleUrl: "file:///tmp/plugin/server.ts",
    env: { FACTORY_BOTS_MCP_CONFIG: "custom.json" },
    cwd: "/tmp/work",
    readFile: async (path) => {
      assert.equal(path, "/tmp/work/custom.json");
      return JSON.stringify(VALID);
    },
  });
  assert.equal(loaded.error, null);
  assert.deepEqual(loaded.config, VALID);
});

test("loads the config beside or above the module", async () => {
  const loaded = await loadMcpConfig({
    moduleUrl: "file:///opt/plugin/dist/server.js",
    env: {},
    readFile: async (path) => {
      if (path === "/opt/plugin/factory.mcp.json") return JSON.stringify(VALID);
      throw new Error("missing");
    },
  });
  assert.deepEqual(loaded.config, VALID);
  assert.equal(loaded.path, "/opt/plugin/factory.mcp.json");
});

test("reports a missing config as an unavailable setup", async () => {
  const loaded = await loadMcpConfig({
    moduleUrl: "file:///opt/plugin/server.ts",
    env: {},
    readFile: async () => {
      throw new Error("missing");
    },
  });
  assert.equal(loaded.config, null);
  assert.match(loaded.error ?? "", /No factory\.mcp\.json found/);
});

test("reports invalid JSON with the file path", async () => {
  const loaded = await loadMcpConfig({
    moduleUrl: "file:///opt/plugin/server.ts",
    env: {},
    readFile: async () => "{ nope",
  });
  assert.equal(loaded.config, null);
  assert.match(loaded.error ?? "", /JSON|Unexpected|Expected/);
});
