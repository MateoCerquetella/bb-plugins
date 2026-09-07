import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const MAIN = "a63ff36722fac30a1845eb1abf988fa7e8d49b02";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

run("git", ["merge-base", "--is-ancestor", MAIN, "HEAD"]);
assert.equal(run("git", ["ls-files", "-u"]), "", "unmerged index entries");

const merges = run("git", [
  "rev-list",
  "--merges",
  "--ancestry-path",
  `${MAIN}..HEAD`,
]).split("\n").filter(Boolean);
const merge = merges.find((candidate) =>
  run("git", ["show", "-s", "--format=%P", candidate])
    .split(" ")
    .includes(MAIN),
);
assert.ok(merge, "normal merge commit with the current main parent is present");
const mergeParents = run("git", ["show", "-s", "--format=%P", merge]).split(" ");
assert.ok(mergeParents.includes(MAIN), "merge contains current main parent");

for (const plugin of [
  "action-topbar",
  "dockside",
  "host-monitor",
  "save-my-model",
  "taskboard",
  "touchbar",
  "usage-tracker",
]) {
  assert.equal(
    run("git", ["ls-files", `plugins/${plugin}/package.json`]),
    `plugins/${plugin}/package.json`,
  );
}

const trackedPlugins = run("git", ["ls-files", "plugins/*/package.json"])
  .split("\n")
  .filter(Boolean)
  .map((path) => path.split("/")[1])
  .sort();
assert.deepEqual(trackedPlugins, [
  "action-topbar",
  "dockside",
  "host-monitor",
  "save-my-model",
  "taskboard",
  "touchbar",
  "usage-tracker",
]);
assert.equal(run("git", ["ls-files", "plugins/t3sidebar"]), "");
assert.equal(run("git", ["ls-files", "bun.lock"]), "");
assert.equal(run("git", ["ls-files", "package-lock.json"]), "package-lock.json");
for (const retired of [
  "GEMINI.md",
  ".gemini/settings.json",
  ".windsurf/skills/empirical/SKILL.md",
]) {
  assert.equal(run("git", ["ls-files", retired]), "", `${retired} was restored`);
}

const collection = JSON.parse(await readFile(".bb/plugins.json", "utf8"));
assert.deepEqual(
  collection.plugins.map((plugin) => plugin.name).sort(),
  trackedPlugins,
);
const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
assert.deepEqual(rootPackage.workspaces, ["plugins/*"]);
assert.match(rootPackage.scripts.check, /check:dockside/);
assert.equal(
  rootPackage.scripts.ci,
  "node .github/run-npm-check.mjs",
);
const npmAdapter = await readFile(".github/run-npm-check.mjs", "utf8");
assert.match(npmAdapter, /spawnSync\("npm", \["run", "check"\]/);
assert.match(npmAdapter, /shell: false/);
const docksideCheck = await readFile(".github/check-dockside.mjs", "utf8");
assert.match(docksideCheck, /bb-plugin-dockside/);
const policy = JSON.parse(await readFile(".empirical/policy.json", "utf8"));
const promotion = policy.verification.commands.find(
  (command) => command.id === "repo-full-ci",
);
assert.deepEqual(promotion?.argv, ["bun", "run", "ci"]);
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
assert.ok(lock.packages["plugins/dockside"]);

const familyStatus = await readFile(
  "plugins/dockside/lib/family-status.ts",
  "utf8",
);
for (const state of [
  "failed",
  "needs-you",
  "working",
  "unread",
  "inactive",
  "stale",
]) {
  assert.match(familyStatus, new RegExp(`kind: "${state}"|${state}:`));
}
for (const activity of ["workflow", "agent", "command", "plan", "goal"]) {
  assert.match(familyStatus, new RegExp(`${activity}:`));
}
const familyOrder = await readFile(
  "plugins/dockside/lib/family-order.ts",
  "utf8",
);
assert.match(familyOrder, /cross-project/);
assert.match(familyOrder, /pinned-boundary/);
assert.match(familyOrder, /FAMILY_ORDER_STORAGE_KEY/);
const projectOrder = await readFile(
  "plugins/dockside/lib/project-order.ts",
  "utf8",
);
assert.match(projectOrder, /PROJECT_ORDER_STORAGE_KEY/);
assert.match(projectOrder, /keyboardProjectMove/);
const threadCard = await readFile(
  "plugins/dockside/components/inbox/thread-card.tsx",
  "utf8",
);
assert.match(threadCard, /grid-rows-\[1rem_1rem\]/);
assert.match(threadCard, /draggable=\{reorderEnabled\}/);
assert.doesNotMatch(threadCard, /ReorderHandle|group\/reorder/);
const projectGroup = await readFile(
  "plugins/dockside/components/inbox/project-group.tsx",
  "utf8",
);
assert.match(projectGroup, /application\/x-dockside-project/);
assert.doesNotMatch(projectGroup, /name="Drag|name="Grip|name="Move/);
const familyStatusView = await readFile(
  "plugins/dockside/components/inbox/family-status.tsx",
  "utf8",
);
assert.match(familyStatusView, /w-14/);
assert.match(familyStatusView, /px-0/);
const prMetadata = await readFile(
  "plugins/dockside/components/inbox/row-metadata.tsx",
  "utf8",
);
assert.match(prMetadata, /backgroundColor: `color-mix/);

const conflicts = spawnSync(
  "git",
  ["grep", "-n", "^<<<<<<<\\|^=======\\|^>>>>>>>"],
  { encoding: "utf8" },
);
assert.equal(conflicts.status, 1, conflicts.stdout || conflicts.stderr);

console.log(
  "Dockside system check passed: normal main merge, six-plugin npm inventory, six semantic states, live activity colors, two-row cards, persistent guarded family order, semantic PR backgrounds, and no stale t3sidebar or conflict markers.",
);
