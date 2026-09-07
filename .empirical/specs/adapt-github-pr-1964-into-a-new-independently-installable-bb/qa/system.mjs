import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const featureRoot = ".empirical/specs/marketplace-plugin-repair";
const screenshot = await readFile(`${featureRoot}/evidence/save-my-model-settings.png`);
assert.equal(screenshot.subarray(1, 4).toString("ascii"), "PNG");
assert.equal(screenshot.readUInt32BE(16), 1440);
assert.equal(screenshot.readUInt32BE(20), 1000);

const live = JSON.parse(
  await readFile(`${featureRoot}/evidence/live-result.json`, "utf8"),
);
assert.equal(live.route, "/settings/plugins/save-my-model");
assert.equal(live.pluginStatus, "running");
assert.equal(live.hostCount, 4);
assert.equal(live.connectedHosts, 3);
assert.equal(live.disconnectedHosts, 1);
assert.equal(live.nativePickerVisible, true);
assert.equal(live.hostRoutedPicker, true);

const runBb = (...args) => {
  const result = spawnSync("bb", args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
};
const plugins = JSON.parse(runBb("plugin", "list", "--json"));
assert.equal(
  plugins.plugins.find((plugin) => plugin.id === "save-my-model")?.status,
  "running",
);

const preferences = await readFile(
  "plugins/save-my-model/lib/preferences.ts",
  "utf8",
);
const app = await readFile("plugins/save-my-model/app.tsx", "utf8");
const readme = await readFile("plugins/save-my-model/README.md", "utf8");
const collection = JSON.parse(await readFile(".bb/plugins.json", "utf8"));
assert.match(preferences, /normalizeHostId/);
assert.match(preferences, /readProviderPreference/);
assert.match(preferences, /writeProviderPreference/);
assert.match(preferences, /bb\.save-my-model\.v3/);
assert.match(preferences, /bb\.promptbox\.model/);
assert.match(preferences, /bb\.promptbox\.reasoning/);
assert.match(preferences, /MAX_LISTED_PREFERENCES = 200/);
assert.match(preferences, /safeDecode/);
assert.match(app, /Machine model preferences/);
assert.match(app, /ProviderModelPicker/);
assert.match(app, /kind: "host", hostId/);
assert.match(app, /Clear saved preferences/);
assert.match(readme, /https:\/\/github\.com\/get-bb\/bb\/pull\/1964/);
assert.ok(
  collection.plugins.some((plugin) => plugin.name === "save-my-model"),
);

console.log(
  "Save My Model system check passed: real BB hosts, host-routed native picker, bounded persistence, live screenshot, package/docs alignment, and running plugin.",
);
