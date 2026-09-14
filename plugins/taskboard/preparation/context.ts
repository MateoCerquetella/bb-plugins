import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Context } from './contract.js';
const exec = promisify(execFile);
export function safeContextPath(path: string): boolean {
  return (
    !isAbsolute(path) &&
    !path.split(/[\\/]/).includes('..') &&
    !/[\x00-\x1f\x7f]/.test(path) &&
    !/(^|\/)(?:node_modules|dist|build|coverage|vendor|\.git|\.bb|\.codex|\.claude|\.cursor|\.gemini|\.windsurf|\.next|\.cache|\.venv|venv|secrets?|credentials?|private|artifacts|evidence)(\/|$)/i.test(
      path
    ) &&
    !/(^|\/)(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.pypirc|\.mcp\.json|(?:access[_-]?token|refresh[_-]?token|auth)\.(?:json|txt)|id_rsa.*|id_ed25519.*|.*(?:credential|secret|password|lockfile).*|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i.test(
      path
    ) &&
    !/\.(?:pem|key|p12|pfx|sqlite|db|map|min\.js|min\.css|png|jpg|jpeg|svg|gif|ico|pdf|zip|woff2?|ttf)$/i.test(
      path
    ) &&
    /\.(?:md|mdx|txt|json|ts|tsx|js|jsx|css|scss|html|vue|svelte|py|go|rs|rb|ya?ml|toml)$|(^|\/)(?:README|LICENSE)$/i.test(
      path
    )
  );
}
export function containsCredential(content: string): boolean {
  if (
    /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:gh[pousr]_|github_pat_|sk-(?:live-|proj-)?)[a-zA-Z0-9_-]{20,}|AKIA[A-Z0-9]{16}|Bearer\s+[A-Za-z0-9_.-]{20,}|https?:\/\/[^\s/:]+:[^\s/@]+@/i.test(
      content
    )
  )
    return true;
  // Conservative: exclude the complete source file when credential-shaped keys
  // have any nonempty value, including unquoted YAML/env values and block scalars.
  return /(?:password|passwd|secret|token|api[_-]?key)["']?\s*[:=]\s*(?:["'][^"'\r\n]+["']|[^\s"',;#}\]][^\r\n]*)/i.test(
    content
  );
}
const hash = (s: string | Buffer) =>
  createHash('sha256').update(s).digest('hex');
export async function collectContext(
  root: string,
  request: string
): Promise<Context> {
  root = await realpath(root);
  const { stdout } = await exec(
    'git',
    [
      '-C',
      root,
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard'
    ],
    { encoding: 'utf8', maxBuffer: 2_000_000, timeout: 10000 }
  );
  const paths = [...new Set(stdout.split('\0').filter(Boolean))]
    .filter(safeContextPath)
    .sort();
  const terms = [
    ...new Set(request.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? [])
  ].slice(0, 40);
  const rank = (p: string) =>
    p
      .split('/')
      .reduce(
        (n, segment) => n + (terms.includes(segment.toLowerCase()) ? 30 : 0),
        0
      ) +
    (/(^|\/)readme/i.test(p) ? 20 : 0) +
    (/package\.json$/.test(p) ? 10 : 0) +
    (/(?:design|tokens|theme|routes|components|features|\.empirical\/(?:context|capabilities))/.test(
      p
    )
      ? 8
      : 0) +
    terms.reduce((n, t) => n + (p.toLowerCase().includes(t) ? 4 : 0), 0);
  const ranked = [...paths].sort(
    (a, b) => rank(b) - rank(a) || a.localeCompare(b)
  );
  const sources: Context['sources'] = [];
  let bytes = 0,
    skipped = 0;
  for (const path of ranked.slice(0, 160)) {
    if (sources.length >= 24 || bytes >= 72000) break;
    let file;
    try {
      const target = resolve(root, path);
      const actual = await realpath(target);
      const rel = relative(root, actual);
      if (rel.startsWith('..' + sep) || isAbsolute(rel) || actual !== target) {
        skipped++;
        continue;
      }
      file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 128000) {
        skipped++;
        continue;
      }
      const data = await file.readFile();
      const content = data.toString('utf8');
      if (
        content.includes('\0') ||
        content.includes('\ufffd') ||
        containsCredential(content)
      ) {
        skipped++;
        continue;
      }
      const lines = content.split('\n');
      const relevant = lines.findIndex((line) =>
        terms.some((t) => line.toLowerCase().includes(t))
      );
      const start =
        content.length > 6000 && relevant > 30 ? Math.max(0, relevant - 10) : 0;
      const excerpt = lines
        .slice(start, start + 120)
        .join('\n')
        .slice(0, Math.min(6000, 72000 - bytes));
      bytes += Buffer.byteLength(excerpt);
      sources.push({
        path,
        start: start + 1,
        end: start + excerpt.split('\n').length,
        sha256: hash(data),
        excerpt
      });
    } catch {
      skipped++;
    } finally {
      await file?.close();
    }
  }
  let commit = 'unknown';
  try {
    commit = (
      await exec('git', ['-C', root, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
        timeout: 5000
      })
    ).stdout.trim();
  } catch {}
  return {
    root,
    commit,
    inventory: paths.slice(0, 400),
    totalPaths: paths.length,
    sources,
    notes: [
      `Working-tree source inventory: ${paths.length} eligible paths; ${sources.length} focused excerpts (${bytes} bytes).`,
      `${skipped} candidate files skipped by size, credential, symlink or readability checks. Includes tracked and untracked non-ignored sources; generated files are omitted.`,
      `Inventory and excerpts are bounded; missing details remain open questions.`
    ],
    digest: hash(JSON.stringify(sources.map((s) => [s.path, s.sha256])))
  };
}
