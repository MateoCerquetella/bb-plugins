import { execFileSync } from 'node:child_process';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// A reproducible downstream extension, never a patch to BB or to an arbitrary Symphony revision.
const revision = 'be10a1b79df723d6d7612b5651c8522704dafb2e';
const checkout = resolve(process.argv[2] || '');
if (!process.argv[2])
  throw new Error('Usage: node install.mjs /path/to/pinned-symphony-checkout');
const head = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: checkout,
  encoding: 'utf8'
}).trim();
if (head !== revision)
  throw new Error(
    `Expected Symphony ${revision}; refusing to patch another revision`
  );
const source = dirname(fileURLToPath(import.meta.url));
const replacements = [
  [
    'elixir/lib/symphony_elixir/tracker.ex',
    '  @adapters %{',
    '  @adapters %{\n    "taskboard" => SymphonyElixir.Taskboard,'
  ],
  [
    'elixir/lib/symphony_elixir.ex',
    '      SymphonyElixir.StatusDashboard',
    '      SymphonyElixir.TaskboardReporter,\n      SymphonyElixir.StatusDashboard'
  ]
];
for (const [relative, before, after] of replacements) {
  const path = join(checkout, relative);
  const original = await readFile(path, 'utf8');
  if (original.includes(after)) continue;
  if (original.split(before).length !== 2)
    throw new Error(`Unexpected upstream source in ${relative}`);
  await writeFile(path, original.replace(before, after));
}
await copyFile(
  join(source, 'taskboard.ex'),
  join(checkout, 'elixir/lib/symphony_elixir/taskboard.ex')
);
console.log(
  'Installed the pinned Taskboard tracker extension. Build Symphony with mix deps.get && mix compile.'
);
