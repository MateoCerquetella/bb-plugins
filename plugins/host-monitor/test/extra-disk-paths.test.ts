import assert from "node:assert/strict";
import test from "node:test";
import { MAX_EXTRA_DISK_PATHS } from "../contract.ts";
import {
  parseExtraDiskPaths,
  sameExtraDiskPaths,
} from "../lib/extra-disk-paths.ts";

test("an empty or missing setting yields no extra paths", () => {
  assert.deepEqual(parseExtraDiskPaths(""), []);
  assert.deepEqual(parseExtraDiskPaths("  \n\n "), []);
  assert.deepEqual(parseExtraDiskPaths(undefined), []);
});

test("keeps trimmed absolute paths once and drops relative entries", () => {
  assert.deepEqual(
    parseExtraDiskPaths(
      " /mnt/HC_Volume_106978058 \r\nrelative/path\n/srv\n/srv\nD:\\\n",
    ),
    ["/mnt/HC_Volume_106978058", "/srv", "D:\\"],
  );
});

test("bounds the number of extra paths", () => {
  const lines = Array.from({ length: 12 }, (_, index) => `/mnt/v${index}`);
  assert.equal(
    parseExtraDiskPaths(lines.join("\n")).length,
    MAX_EXTRA_DISK_PATHS,
  );
});

test("compares parsed path lists by order and content", () => {
  assert.equal(sameExtraDiskPaths(["/a", "/b"], ["/a", "/b"]), true);
  assert.equal(sameExtraDiskPaths(["/a", "/b"], ["/b", "/a"]), false);
  assert.equal(sameExtraDiskPaths([], ["/a"]), false);
});
