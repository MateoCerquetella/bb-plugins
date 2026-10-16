import type { ThreadFamily } from "./inbox.ts";
import { familyIsPinned, type ThreadSection } from "./status-groups.ts";

export function groupSidebarFamilies(
  families: readonly ThreadFamily[],
): ThreadSection[] {
  const pinned = families.filter(familyIsPinned);
  const remaining = families.filter((family) => !familyIsPinned(family));
  const sections: ThreadSection[] = pinned.length
    ? [{ kind: "pinned", label: "Pinned", families: pinned }]
    : [];
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
