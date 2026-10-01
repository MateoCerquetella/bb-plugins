import type { WorkItem } from '../../../contract.js';
import { localPrompt } from '../../request.js';

/** Local execution remains an explicit composer handoff, with no invented runtime status. */
export const localEngine = {
  kind: 'local' as const,
  prepare(item: WorkItem) {
    return { kind: 'composer_handoff' as const, prompt: localPrompt(item) };
  }
};
