import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const REQUIRED_RUNTIME_DEPENDENCIES = {
  "@hugeicons/core-free-icons": "^4.1.3",
  "@hugeicons/react": "^1.1.6",
  "@radix-ui/react-context-menu": "^2.3.3",
  "@radix-ui/react-select": "^2.3.3",
  clsx: "^2.1.1",
  "tailwind-merge": "^3.4.0",
  zod: "^4.3.6",
} as const;

const EXPECTED_RELEASE_VERSION = "0.1.1";

interface PackageRecord {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, "utf8")) as T;
}

test("declares unshimmed runtime imports as production dependencies", async () => {
  const manifest = await readJson<PackageRecord>(
    new URL("../package.json", import.meta.url),
  );
  const lockfile = await readJson<{ packages: Record<string, PackageRecord> }>(
    new URL("../../../package-lock.json", import.meta.url),
  );
  const lockedWorkspace = lockfile.packages["plugins/dockside"];
  assert.ok(lockedWorkspace, "package-lock.json must include Dockside");

  assert.equal(manifest.version, EXPECTED_RELEASE_VERSION);
  assert.equal(lockedWorkspace.version, EXPECTED_RELEASE_VERSION);

  for (const [packageName, expectedRange] of Object.entries(
    REQUIRED_RUNTIME_DEPENDENCIES,
  )) {
    assert.equal(manifest.dependencies?.[packageName], expectedRange);
    assert.equal(lockedWorkspace.dependencies?.[packageName], expectedRange);
    assert.equal(manifest.devDependencies?.[packageName], undefined);
    assert.equal(lockedWorkspace.devDependencies?.[packageName], undefined);
  }
});
