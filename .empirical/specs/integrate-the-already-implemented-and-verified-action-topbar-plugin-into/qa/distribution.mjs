import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path) => readFileSync(path, "utf8");
const manifest = JSON.parse(read("plugins/action-topbar/package.json"));
const collection = JSON.parse(read(".bb/plugins.json"));
const rootReadme = read("README.md");
const pluginReadme = read("plugins/action-topbar/README.md");

assert.equal(manifest.name, "bb-plugin-action-topbar");
assert.equal(manifest.engines.bbPluginSdk, ">=0.4.33");
assert.equal(manifest.bb.server, "./server.ts");
assert.equal(manifest.bb.app, "./app.tsx");
assert.ok(collection.plugins.some((plugin) => plugin.name === "action-topbar" && plugin.source === "./plugins/action-topbar"));
assert.match(rootReadme, /Action Topbar requires the matching BB core changes/);
assert.match(pluginReadme, /Action split-drag API introduced in Plugin SDK 0\.4\.33/);
assert.match(pluginReadme, /git:https:\/\/github\.com\/MateoCerquetella\/bb-plugins\.git@\^0\.1\.0/);
assert.match(pluginReadme, /--tag-prefix action-topbar\//);
assert.match(pluginReadme, /path:\/absolute\/path\/to\/bb-plugins\/plugins\/action-topbar/);
assert.match(pluginReadme, /docs\/media\/action-topbar-light\.png/);
assert.match(pluginReadme, /docs\/media\/action-topbar-dark\.png/);
assert.doesNotMatch(manifest.description, /orca/i);
assert.doesNotMatch(manifest.bb.description, /orca/i);

for (const path of ["docs/media/action-topbar-light.png", "docs/media/action-topbar-dark.png"]) {
  const png = readFileSync(path);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1450);
  assert.equal(png.readUInt32BE(20), 720);
}

const textExtensions = new Set([".css", ".json", ".md", ".mjs", ".ts", ".tsx"]);
const authoredFiles = [];
const visit = (path) => {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if ([".empirical", ".git", "dist", "node_modules"].includes(entry.name)) continue;
    const child = path === "." ? entry.name : `${path}/${entry.name}`;
    if (entry.isDirectory()) visit(child);
    else if (textExtensions.has(child.slice(child.lastIndexOf(".")))) authoredFiles.push(child);
  }
};
visit(".");
for (const path of authoredFiles) assert.doesNotMatch(read(path), /orca/i, path);

const built = spawnSync("npm", ["run", "build", "--workspace=bb-plugin-action-topbar"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
assert.equal(built.status, 0, built.stderr || built.stdout);

const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--workspace=bb-plugin-action-topbar"], {
  cwd: process.cwd(),
  encoding: "utf8"
});

assert.equal(packed.status, 0, packed.stderr);
const packReport = JSON.parse(packed.stdout);
const packedPaths = new Set(packReport[0].files.map((file) => file.path));
for (const path of ["dist/app.js", "dist/server.js", "assets/icon.svg", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  assert.ok(packedPaths.has(path), `missing packed file: ${path}`);
}

process.stdout.write("Action Topbar distribution contract passed.\n");
