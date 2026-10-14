import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (args.length === 0) throw new Error('Pass a bb CLI command.');

const dataDir = await mkdtemp(join(tmpdir(), 'taskboard-bb-cli-'));
const env = { ...process.env, BB_DATA_DIR: dataDir };
delete env.BB_CLI;

try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn('bb', args, { env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (status, signal) => {
      if (signal) reject(new Error(`bb CLI exited from ${signal}.`));
      else resolve(status ?? 1);
    });
  });
  process.exitCode = code;
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
