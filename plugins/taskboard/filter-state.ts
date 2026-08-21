import { z } from 'zod';
import {
  trackerViewSchema,
  workSourceSchema,
  workStateCategorySchema
} from './work-schemas.ts';

export const ALL_SOURCES_FILTER = 'all';
export const ACROSS_PROJECTS_SCOPE_ID = 'proj_across_projects';
export const ACROSS_PROJECTS_SCOPE_KEY = 'across-projects';
export const RIGHT_PANEL_SCOPE_PREFIX = 'right-panel:';

export const sourceFilterSchema = z.union([
  z.literal(ALL_SOURCES_FILTER),
  workSourceSchema
]);
export type SourceFilterValue = z.infer<typeof sourceFilterSchema>;

export const boardFilterStateSchema = z
  .object({
    source: sourceFilterSchema,
    stateCategories: z.array(workStateCategorySchema),
    statuses: z.array(z.string()),
    assignees: z.array(z.string()),
    priorities: z.array(z.string()),
    externalProjects: z.array(z.string()),
    labels: z.array(z.string()),
    query: z.string(),
    view: trackerViewSchema
  })
  .strict();
export type BoardFilterState = z.infer<typeof boardFilterStateSchema>;

export function defaultBoardFilterState(): BoardFilterState {
  return {
    source: ALL_SOURCES_FILTER,
    stateCategories: [],
    statuses: [],
    assignees: [],
    priorities: [],
    externalProjects: [],
    labels: [],
    query: '',
    view: 'list'
  };
}

/**
 * The three surfaces rendering TrackerList use different in-memory scope
 * keys, but filter state is persisted per project. The right panel and the
 * main panel for one project share a row.
 *
 * An empty scope is deliberately left unaliased: it is rejected downstream
 * by bbProjectIdSchema, the same as any other malformed scope, rather than
 * silently overwriting the shared across-projects row.
 *
 * Note: a real bb project literally named `proj_across_projects` would
 * collide with the across-projects row. No guard for that today.
 */
export function filterStateScopeId(scope: string): string {
  const bare = scope.startsWith(RIGHT_PANEL_SCOPE_PREFIX)
    ? scope.slice(RIGHT_PANEL_SCOPE_PREFIX.length)
    : scope;
  return bare === ACROSS_PROJECTS_SCOPE_KEY ? ACROSS_PROJECTS_SCOPE_ID : bare;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

/**
 * Filter arrays are sets, so order carries no meaning. Canonicalizing them
 * keeps stored rows stable and stops a reorder from looking like a change.
 */
export function normalizeBoardFilterState(
  state: BoardFilterState
): BoardFilterState {
  return {
    source: state.source,
    stateCategories: uniqueSorted(state.stateCategories),
    statuses: uniqueSorted(state.statuses),
    assignees: uniqueSorted(state.assignees),
    priorities: uniqueSorted(state.priorities),
    externalProjects: uniqueSorted(state.externalProjects),
    labels: uniqueSorted(state.labels),
    query: state.query.trim(),
    view: state.view
  };
}

export function boardFilterStateFingerprint(state: BoardFilterState): string {
  return JSON.stringify(normalizeBoardFilterState(state));
}
