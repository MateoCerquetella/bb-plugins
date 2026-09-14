import { experimental_defineHostEntry } from '@get-bb/plugin-sdk/host';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { hostContract } from './preparation/contract.js';
import { collectContext } from './preparation/context.js';
export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    collect: (input) => collectContext(input.root, input.request),
    async workspace(input, ctx) {
      const path = join(
        ctx.experimental_paths.dataDir,
        'preparations',
        input.id
      );
      await mkdir(path, { recursive: true, mode: 0o700 });
      return { path };
    }
  }
});
