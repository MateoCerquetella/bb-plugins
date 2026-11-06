import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("keeps a non-default FACTORY_URL on the start command", () => {
  assert.equal(
    startCommand(
      parseMcpConfig({
        ...VALID,
        env: { FACTORY_URL: "http://127.0.0.1:9090" },
      }),
    ),
    "FACTORY_URL=http://127.0.0.1:9090 node /opt/factory/dist/main.js up",
  );
  assert.equal(
    startCommand(
      parseMcpConfig({
        ...VALID,
        env: { FACTORY_URL: "http://my factory:8080" },
      }),
    ),
    "FACTORY_URL='http://my factory:8080' node /opt/factory/dist/main.js up",
  );
});

test("redacts credentials from a displayed FACTORY_URL", () => {
  assert.equal(
    startCommand(
      parseMcpConfig({
        ...VALID,
        env: { FACTORY_URL: "http://user:secret@127.0.0.1:9090" },
      }),
    ),
    "FACTORY_URL=http://127.0.0.1:9090 node /opt/factory/dist/main.js up",
  );
});

test("shell quotes only when needed", () => {
  assert.equal(shellQuote("/opt/factory/main.js"), "/opt/factory/main.js");
  assert.equal(shellQuote("/opt/my factory/main.js"), "'/opt/my factory/main.js'");
  assert.equal(shellQuote("it's"), "'it'\\''s'");
});

test("uses the configured Factory checkout while preserving MCP args and URL", async () => {
  const loaded = await loadMcpConfig({
    moduleUrl: "file:///opt/plugin/server.ts",
    env: {},
    factoryCheckoutPath: "/opt/new factory",
    readFile: async () => JSON.stringify({
      command: "node",
      args: ["--enable-source-maps", "/opt/old/dist/main.js", "mcp"],
      env: { FACTORY_URL: "http://127.0.0.1:9090", EXTRA: "kept" },
    }),
    exists: async (path) => {
      assert.equal(path, "/opt/new factory/dist/main.js");
      return true;
    },
  });
  assert.equal(loaded.error, null);
  assert.deepEqual(loaded.config, {
    command: "node",
    args: ["--enable-source-maps", "/opt/new factory/dist/main.js", "mcp"],
    env: { FACTORY_URL: "http://127.0.0.1:9090", EXTRA: "kept" },
  });
});

test("rejects a checkout whose entry point is not a readable file", async (t) => {
  const checkout = await mkdtemp(join(tmpdir(), "factory-bots-config-"));
  t.after(() => rm(checkout, { recursive: true, force: true }));
  await mkdir(join(checkout, "dist", "main.js"), { recursive: true });

  const loaded = await loadMcpConfig({
    moduleUrl: "file:///opt/plugin/server.ts",
    env: {},
    factoryCheckoutPath: checkout,
    readFile: async () => JSON.stringify(VALID),
  });
  assert.equal(loaded.config, null);
  assert.match(loaded.error ?? "", /No readable Factory MCP script/);
});

test("rejects relative Factory checkout paths", async () => {
  const loaded = await loadMcpConfig({
    moduleUrl: "file:///opt/plugin/server.ts",
    env: {},
    factoryCheckoutPath: "../factory",
    readFile: async () => JSON.stringify(VALID),
  });
  assert.equal(loaded.config, null);
  assert.match(loaded.error ?? "", /must be an absolute directory path/);
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
    exists: async (path) => {
      assert.equal(path, "/opt/factory/dist/main.js");
      return true;
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
    exists: async () => true,
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

test("reports a missing MCP script as an actionable config error", async () => {
  const loaded = await loadMcpConfig({
    moduleUrl: "file:///opt/plugin/server.ts",
    env: {},
    readFile: async () => JSON.stringify(VALID),
    exists: async () => false,
  });
  assert.equal(loaded.config, null);
  assert.match(loaded.error ?? "", /No readable Factory MCP script at \/opt\/factory\/dist\/main\.js/);
  assert.match(loaded.error ?? "", /Factory checkout path in Settings/);
  assert.match(loaded.error ?? "", /FACTORY_BOTS_MCP_CONFIG/);
  assert.match(loaded.error ?? "", /reload the Factory Bots plugin/);
});

test("finds the script after a runtime flag and when it is the command", async () => {
  const flagged = await loadMcpConfig({
    moduleUrl: "file:///opt/plugin/server.ts",
    env: {},
    readFile: async () =>
      JSON.stringify({
        command: "node",
        args: ["--enable-source-maps", "/missing/main.js", "mcp"],
      }),
    exists: async (path) => path !== "/missing/main.js",
  });
  assert.equal(flagged.config, null);
  assert.match(flagged.error ?? "", /\/missing\/main\.js/);

  const asCommand = await loadMcpConfig({
    moduleUrl: "file:///opt/plugin/server.ts",
    env: {},
    readFile: async () =>
      JSON.stringify({ command: "/missing/main.mjs", args: ["mcp"] }),
    exists: async (path) => path !== "/missing/main.mjs",
  });
  assert.equal(asCommand.config, null);
  assert.match(asCommand.error ?? "", /\/missing\/main\.mjs/);
});

test("resolves a relative script against the config directory", async () => {
  const loaded = await loadMcpConfig({
    moduleUrl: "file:///opt/plugin/server.ts",
    env: {},
    readFile: async () =>
      JSON.stringify({ command: "node", args: ["./dist/main.js", "mcp"] }),
    exists: async (path) => {
      assert.equal(path, "/opt/plugin/dist/main.js");
      return true;
    },
  });
  assert.equal(loaded.config?.cwd, "/opt/plugin");
  assert.equal(loaded.error, null);
});
