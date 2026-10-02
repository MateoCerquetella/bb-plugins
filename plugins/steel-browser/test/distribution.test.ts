import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("declares an independent BB app, server, CLI skill, and pinned SDK", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.name, "bb-plugin-steel-browser");
  assert.equal(packageJson.bb.server, "./server.ts");
  assert.equal(packageJson.bb.app, "./app.tsx");
  assert.deepEqual(packageJson.bb.skills, ["./skills/steel-browser"]);
  assert.equal(packageJson.devDependencies["@get-bb/plugin-sdk"], "0.4.21");
  assert.match(packageJson.scripts.build, /^env -u BB_CLI /u);
});

test("contributes Steel discovery instructions to new agent sessions", async () => {
  const server = await readFile(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(server, /bb\.agents\.contributeInstructions/u);
  assert.match(server, /first run `bb steel-browser project`/u);
  assert.match(server, /Never claim Steel is unavailable/u);
  assert.match(server, /emit ::steel-browser\{\}/u);
  assert.match(server, /Do not launch a separate browser/u);
});

test("ships the required operational and responsive UI states", async () => {
  const [app, css, skill] = await Promise.all([
    readFile(new URL("../app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app.css", import.meta.url), "utf8"),
    readFile(new URL("../skills/steel-browser/SKILL.md", import.meta.url), "utf8"),
  ]);
  assert.match(app, /No active sessions/u);
  assert.match(app, /window\.confirm/u);
  assert.match(app, /Steel is not connected/u);
  assert.match(css, /@media \(max-width: 560px\)/u);
  assert.doesNotMatch(css, /#eddb63/u);
  assert.match(css, /width: min\(100%, 560px\)/u);
  assert.match(skill, /instead of KERNEL\.SH/u);
  assert.match(skill, /Never send the user to a/u);
  assert.match(skill, /current thread is the only browser surface/u);
  assert.match(skill, /bb steel-browser release/u);
});
