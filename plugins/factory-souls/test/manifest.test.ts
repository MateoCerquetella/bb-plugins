import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  name: string;
  files: string[];
  bb: { name: string; server: string; app: string; branding: { icon: string } };
};
const mcp = JSON.parse(
  readFileSync(new URL("../factory.mcp.json", import.meta.url), "utf8"),
) as { command: string; args: string[]; env: Record<string, string> };
const catalog = JSON.parse(
  readFileSync(new URL(".bb/plugins.json", root), "utf8"),
) as { plugins: Array<{ name: string; source: string }> };

test("declares a standalone Factory Souls plugin", () => {
  assert.equal(packageJson.name, "bb-plugin-factory-souls");
  assert.equal(packageJson.bb.name, "Factory Souls");
  assert.equal(packageJson.bb.server, "./server.ts");
  assert.equal(packageJson.bb.app, "./app.tsx");
  assert.equal(packageJson.bb.branding.icon, "./assets/icon.svg");
  for (const file of ["app.css", "contract.ts", "factory.mcp.json", "README.md", "server.ts"]) {
    assert.ok(packageJson.files.includes(file), `missing package file ${file}`);
  }
});

test("uses the documented Factory MCP stdio config", () => {
  assert.equal(mcp.command, "node");
  assert.equal(mcp.args.at(-1), "mcp");
  assert.match(mcp.args[0] ?? "", /empirical-factory\/dist\/main\.js$/);
  assert.equal(mcp.env.FACTORY_URL, "http://127.0.0.1:8080");
});

test("is listed in the workspace catalog", () => {
  assert.ok(
    catalog.plugins.some(
      (entry) => entry.name === "factory-souls" && entry.source === "./plugins/factory-souls",
    ),
  );
});
