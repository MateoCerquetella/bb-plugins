import { z } from 'zod';
import { bbProjectIdSchema } from './credential-contract.js';
import { DEFAULT_WORKFLOW_STATUS_ORDER } from './browse.js';
import { trackerViewSchema } from './work-schemas.js';
export { DEFAULT_WORKFLOW_STATUS_ORDER } from './browse.js';
export { trackerViewSchema } from './work-schemas.js';
export type { TrackerView } from './work-schemas.js';

export const workItemFilterFieldSchema = z.enum([
  'state',
  'status',
  'assignee',
  'priority',
  'project',
  'labels'
]);
export type WorkItemFilterField = z.infer<typeof workItemFilterFieldSchema>;

export const DEFAULT_WORK_ITEM_FILTER_FIELDS: readonly WorkItemFilterField[] = [
  'state',
  'status',
  'assignee',
  'priority',
  'project',
  'labels'
];

function uniqueNormalizedStrings(values: readonly string[]): boolean {
  return (
    new Set(values.map(value => value.trim().toLocaleLowerCase())).size ===
    values.length
  );
}

export const projectBoardSettingsSchema = z
  .object({
    projectId: bbProjectIdSchema,
    defaultView: trackerViewSchema,
    enabledFilters: z.array(workItemFilterFieldSchema),
    statusOrder: z.array(z.string().trim().min(1).max(80)).min(1).max(50)
  })
  .strict()
  .superRefine((settings, context) => {
    if (new Set(settings.enabledFilters).size !== settings.enabledFilters.length) {
      context.addIssue({
        code: 'custom',
        path: ['enabledFilters'],
        message: 'Filter fields must be unique'
      });
    }
    if (!uniqueNormalizedStrings(settings.statusOrder)) {
      context.addIssue({
        code: 'custom',
        path: ['statusOrder'],
        message: 'Workflow statuses must be unique'
      });
    }
  });
export type ProjectBoardSettings = z.infer<typeof projectBoardSettingsSchema>;

export function defaultProjectBoardSettings(
  projectId: string
): ProjectBoardSettings {
  return projectBoardSettingsSchema.parse({
    projectId,
    defaultView: 'list',
    enabledFilters: [...DEFAULT_WORK_ITEM_FILTER_FIELDS],
    statusOrder: [...DEFAULT_WORKFLOW_STATUS_ORDER]
  });
}
