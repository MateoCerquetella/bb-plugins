import type { Snapshot } from "./contract";

export type Box = { x: number; y: number; w: number; h: number };
type Thread = Snapshot["threads"][number];

export function connectedThreads(base: Thread[], all: Thread[]) {
  const included = new Set(base.map((pane) => pane.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const pane of all) {
      if (included.has(pane.id) && pane.parentThreadId && !included.has(pane.parentThreadId)) {
        included.add(pane.parentThreadId); changed = true;
      }
      if (pane.parentThreadId && included.has(pane.parentThreadId) && !included.has(pane.id)) {
        included.add(pane.id); changed = true;
      }
    }
  }
  return all.filter((pane) => included.has(pane.id));
}

// Parent-first traversal keeps automatic positions stable under status updates.
export function autoBoxes(threads: Thread[]) {
  const boxes = new Map<string, Box>();
  const visited = new Set<string>();
  const ids = new Set(threads.map((thread) => thread.id));
  const ordered = [...threads].sort((a, b) => a.id.localeCompare(b.id));
  const roots = ordered.filter((thread) => !thread.parentThreadId || !ids.has(thread.parentThreadId));
  const rootColumns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(roots.length))));
  const visit = (thread: Thread, depth: number, family: number, familyRow: { value: number }) => {
    if (visited.has(thread.id)) return;
    visited.add(thread.id);
    const column = family % rootColumns;
    const row = Math.floor(family / rootColumns);
    boxes.set(thread.id, {
      x: 32 + column * 1920 + depth * 640,
      y: 32 + row * 1420 + familyRow.value++ * 470,
      w: 520,
      h: 420,
    });
    ordered
      .filter((child) => child.parentThreadId === thread.id)
      .forEach((child) => visit(child, depth + 1, family, familyRow));
  };
  roots.forEach((thread, family) => visit(thread, 0, family, { value: 0 }));
  // Defensive cycle handling for corrupt persisted parent links.
  ordered.forEach((thread, family) => visit(thread, 0, roots.length + family, { value: 0 }));
  return boxes;
}

export function edgePath(from: Box, to: Box) {
  const x1 = from.x + from.w, y1 = from.y + 54;
  const x2 = to.x, y2 = to.y + 54;
  const bend = Math.max(56, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

export function browserNodeId(browser: Snapshot["browsers"][number]) {
  return `browser:${browser.threadId}:${browser.id}`;
}

export function workspaceId(thread: Thread) {
  return thread.projectId;
}

export type WorkspaceGroup = Box & { id: string; title: string; project: string; color: string; threadIds: string[]; nodeIds: string[] };
export function freeBox(box: Box): Box {
  return {
    x: Math.max(-100000, Math.min(100000, box.x)),
    y: Math.max(-100000, Math.min(100000, box.y)),
    w: Math.max(320, Math.min(900, box.w)),
    h: Math.max(260, Math.min(900, box.h)),
  };
}
function workspaceHue(id: string) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return (hash >>> 0) % 360;
}
export function workspaceColor(id: string) {
  return `hsl(${workspaceHue(id)} 55% 48%)`;
}

// Pack complete workspace squares, not fixed-size families that can overlap.
export function workspaceLayout(threads: Thread[], browsers: Snapshot["browsers"]) {
  const nodes = new Map<string, Box>();
  const members = new Map<string, Thread[]>();
  for (const thread of threads) {
    const key = workspaceId(thread);
    members.set(key, [...(members.get(key) ?? []), thread]);
  }
  const usedHues: number[] = [];
  const groups: WorkspaceGroup[] = [...members].sort(([a], [b]) => a.localeCompare(b)).map(([id, items]) => {
    const ordered = [...autoBoxes(items).keys()];
    const nodeIds = ordered.flatMap((threadId) => [
      threadId, ...browsers.filter((browser) => browser.threadId === threadId)
        .sort((a, b) => a.id.localeCompare(b.id)).map(browserNodeId),
    ]);
    const columns = Math.ceil(Math.sqrt(nodeIds.length));
    const side = Math.max(640, columns * 584 + 48);
    let hue = workspaceHue(id);
    for (let attempt = 0; attempt < 12 && usedHues.some((other) => Math.min(Math.abs(hue - other), 360 - Math.abs(hue - other)) < 35); attempt++) hue = (hue + 137) % 360;
    usedHues.push(hue);
    const count = new Set(items.map((item) => item.environmentId)).size;
    return { id, title: items[0].project, project: `${count} ${count === 1 ? "worktree" : "worktrees"}`, color: `hsl(${hue} 55% 48%)`,
      threadIds: ordered, nodeIds, x: 0, y: 0, w: side, h: side };
  });
  const target = Math.max(1280, Math.sqrt(groups.reduce((area, group) => area + (group.w + 48) ** 2, 0)));
  let x = 32, y = 32, rowHeight = 0;
  for (const group of groups) {
    if (x > 32 && x + group.w > target) { x = 32; y += rowHeight + 48; rowHeight = 0; }
    group.x = x; group.y = y;
    const columns = Math.ceil(Math.sqrt(group.nodeIds.length));
    group.nodeIds.forEach((id, index) => nodes.set(id, {
      x: x + 24 + (index % columns) * 584, y: y + 64 + Math.floor(index / columns) * 490,
      w: 536, h: 420,
    }));
    x += group.w + 48; rowHeight = Math.max(rowHeight, group.h);
  }
  return { groups, nodes };
}
