import { posix as posixPath, win32 as windowsPath } from "node:path";
import {
  MAX_DISK_PATH_LENGTH,
  MAX_EXTRA_DISK_PATHS,
} from "../contract.ts";

/**
 * Convert the multi-line settings field into a bounded list of absolute
 * paths. The server does not know each host's platform, so both POSIX and
 * Windows absolute forms pass; each host re-checks its own form. Blank lines,
 * relative paths, and duplicates are dropped.
 */
export function parseExtraDiskPaths(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const paths: string[] = [];
  for (const line of value.split(/\r?\n/u)) {
    const path = line.trim();
    if (
      path.length === 0 ||
      path.length > MAX_DISK_PATH_LENGTH ||
      !(posixPath.isAbsolute(path) || windowsPath.isAbsolute(path)) ||
      paths.includes(path)
    ) {
      continue;
    }
    paths.push(path);
    if (paths.length === MAX_EXTRA_DISK_PATHS) break;
  }
  return paths;
}

export function sameExtraDiskPaths(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((path, index) => path === right[index])
  );
}
