import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getCachedAntigravityUsage } from "../lib/antigravity-probe.ts";

test("does not respawn agy again within the refresh interval", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agy-probe-"));
  const runs = path.join(dir, "runs");
  const agy = path.join(dir, "agy");
  writeFileSync(
    agy,
    `#!/bin/sh\necho run >> "${runs}"\necho '{"groups":[{"name":"Gemini Models","windows":[{"label":"weekly","remaining_fraction":0.5}]}]}'\n`,
  );
  chmodSync(agy, 0o755);
  process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ""}`;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 300));
  getCachedAntigravityUsage();
  await settle();
  getCachedAntigravityUsage();
  await settle();

  assert.equal(readFileSync(runs, "utf8").trim().split("\n").length, 1);
});
