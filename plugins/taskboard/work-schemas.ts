import { z } from 'zod';

/**
 * Leaf module for the plugin's primitive enums. It has no local imports of
 * its own, so any module loaded directly by `node --test
 * --experimental-strip-types` (rather than through the bundled plugin) can
 * depend on it without dragging in a chain of `.js` specifiers the raw
 * test runner cannot resolve to their `.ts` sources.
 */

export const workSourceSchema = z.enum(['linear', 'github', 'jira']);
export type WorkSource = z.infer<typeof workSourceSchema>;

export const workStateCategorySchema = z.enum([
  'backlog',
  'todo',
  'in_progress',
  'done',
  'canceled'
]);
export type WorkStateCategory = z.infer<typeof workStateCategorySchema>;

export const trackerViewSchema = z.enum(['list', 'kanban']);
export type TrackerView = z.infer<typeof trackerViewSchema>;
