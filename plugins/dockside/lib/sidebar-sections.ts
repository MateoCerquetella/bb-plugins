import type { ThreadFamily } from "./inbox.ts";
import { familyUpdatedAt } from "./thread-management.ts";
import { familyIsPinned, type ThreadSection } from "./status-groups.ts";

export function groupSidebarFamilies(
  families: readonly ThreadFamily[],
  mode: "updated" | "environment",
): ThreadSection[] {
  const pinned = families.filter(familyIsPinned);
  const remaining = families.filter((family) => !familyIsPinned(family));
  const sections: ThreadSection[] = pinned.length
    ? [{ kind: "pinned", label: "Pinned", families: pinned }]
    : [];
  if (mode === "updated") {
    if (remaining.length) sections.push({
      kind: "updated",
      label: "Updated",
      families: [...remaining].sort((a, b) => familyUpdatedAt(b) - familyUpdatedAt(a)),
    });
    return sections;
  }
  const environments = new Map<string, ThreadSection>();
  for (const family of remaining) {
    const { environment, host, projectId } = family.root;
    // IDs keep same-named worktrees on different machines separate.
    const key = JSON.stringify([projectId, host?.id, environment?.id ?? environment?.name]);
    let section = environments.get(key);
    if (!section) {
      const name = environment?.name || environment?.branchName || "No environment";
      section = {
        kind: key,
        label: host?.name ? `${name} · ${host.name}` : name,
        families: [],
      };
      environments.set(key, section);
    }
    section.families.push(family);
  }
  return [...sections, ...environments.values()];
}
