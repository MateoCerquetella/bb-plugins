import { defineRpcContract } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import {
  bbProjectIdSchema,
  jiraBaseUrlSchema,
  projectCredentialsInteractionPayloadSchema,
  projectCredentialsInteractionResponseSchema,
  secretMutationSchema
} from './credential-contract.js';
import { projectBoardSettingsSchema } from './board-settings.js';
import { boardFilterStateSchema } from './filter-state.js';
import {
  workSourceSchema,
  workStateCategorySchema,
  type WorkSource
} from './work-schemas.js';
export {
  workSourceSchema,
  workStateCategorySchema
} from './work-schemas.js';
export type { WorkSource, WorkStateCategory } from './work-schemas.js';
export {
  DEFAULT_WORK_ITEM_FILTER_FIELDS,
  DEFAULT_WORKFLOW_STATUS_ORDER,
  defaultProjectBoardSettings,
  projectBoardSettingsSchema,
  trackerViewSchema,
  workItemFilterFieldSchema
} from './board-settings.js';
export type {
  ProjectBoardSettings,
  TrackerView,
  WorkItemFilterField
} from './board-settings.js';
export {
  ACROSS_PROJECTS_SCOPE_ID,
  ALL_SOURCES_FILTER,
  boardFilterStateFingerprint,
  boardFilterStateSchema,
  defaultBoardFilterState,
  filterStateScopeId,
  normalizeBoardFilterState,
  sourceFilterSchema
} from './filter-state.js';
export type {
  BoardFilterState,
  SourceFilterValue
} from './filter-state.js';
export {
  bbProjectIdSchema,
  jiraBaseUrlSchema,
  projectCredentialsInteractionPayloadSchema,
  projectCredentialsInteractionResponseSchema,
  secretMutationSchema
} from './credential-contract.js';
export type {
  ProjectCredentialsInteractionPayload,
  ProjectCredentialsInteractionResponse,
  SecretMutation
} from './credential-contract.js';

export const trackerProjectSchema = z
  .object({
    id: bbProjectIdSchema,
    name: z.string()
  })
  .strict();
export type TrackerProject = z.infer<typeof trackerProjectSchema>;

export const projectSourceConfigSchema = z
  .object({
    projectId: bbProjectIdSchema,
    source: workSourceSchema,
    linearTeamKey: z.string().trim(),
    jiraBaseUrl: jiraBaseUrlSchema,
    jiraEmail: z.string().trim(),
    jiraJql: z.string().trim().min(1)
  })
  .strict();
export type ProjectSourceConfig = z.infer<typeof projectSourceConfigSchema>;

export const projectConfigViewSchema = projectSourceConfigSchema
  .extend({
    githubRepos: z.array(z.string()),
    linearCredentialConfigured: z.boolean(),
    jiraCredentialConfigured: z.boolean()
  })
  .strict();
export type ProjectConfigView = z.infer<typeof projectConfigViewSchema>;

export const projectConfigMutationSchema = projectSourceConfigSchema
  .extend({
    linearCredential: secretMutationSchema,
    jiraCredential: secretMutationSchema
  })
  .strict()
  .superRefine((config, context) => {
    if (config.source === 'linear' && !config.linearTeamKey) {
      context.addIssue({
        code: 'custom',
        path: ['linearTeamKey'],
        message: 'Linear team key is required when Linear is selected'
      });
    }
  });
export type ProjectConfigMutation = z.infer<typeof projectConfigMutationSchema>;

export const workStatusOptionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    stateCategory: workStateCategorySchema,
    current: z.boolean()
  })
  .strict();
export type WorkStatusOption = z.infer<typeof workStatusOptionSchema>;

export const workItemSchema = z
  .object({
    bbProjectId: bbProjectIdSchema,
    source: workSourceSchema,
    locator: z.string().min(1),
    key: z.string().min(1),
    title: z.string(),
    description: z.string(),
    url: z.string(),
    status: z.string(),
    stateCategory: workStateCategorySchema,
    priority: z.string().nullable(),
    assignee: z.string().nullable(),
    project: z.string().nullable(),
    labels: z.array(z.string()),
    updatedAt: z.string()
  })
  .strict();
export type WorkItem = z.infer<typeof workItemSchema>;

export const workCommentSchema = z
  .object({
    author: z.string(),
    body: z.string(),
    createdAt: z.string()
  })
  .strict();

export const workItemDetailSchema = workItemSchema
  .extend({ comments: z.array(workCommentSchema) })
  .strict();
export type WorkItemDetail = z.infer<typeof workItemDetailSchema>;

export const workSourceStatusSchema = z
  .object({
    source: workSourceSchema,
    configured: z.boolean(),
    available: z.boolean(),
    message: z.string().nullable(),
    lastSyncedAt: z.string().nullable(),
    itemCount: z.number().int().nonnegative()
  })
  .strict();
export type WorkSourceStatus = z.infer<typeof workSourceStatusSchema>;

export const createIssueDestinationSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1)
  })
  .strict();
export type CreateIssueDestination = z.infer<
  typeof createIssueDestinationSchema
>;

export const createIssueContextSchema = z
  .object({
    projectId: bbProjectIdSchema,
    projectName: z.string().min(1),
    source: workSourceSchema,
    available: z.boolean(),
    message: z.string().nullable(),
    destinationLabel: z.enum(['Repository', 'Team', 'Project key']),
    destinations: z.array(createIssueDestinationSchema),
    defaultDestinationId: z.string().nullable(),
    allowsCustomDestination: z.boolean(),
    defaultIssueType: z.string().nullable()
  })
  .strict();
export type CreateIssueContext = z.infer<typeof createIssueContextSchema>;

export const createIssueInputSchema = z
  .object({
    projectId: bbProjectIdSchema,
    expectedSource: workSourceSchema,
    title: z.string().trim().min(1).max(500),
    description: z.string().max(100_000).default(''),
    destinationId: z.string().trim().min(1).max(500),
    issueType: z.string().trim().min(1).max(100).nullable().default(null)
  })
  .strict();
export type CreateIssueInput = z.infer<typeof createIssueInputSchema>;

export const issueDraftRequestIdSchema = z.string().uuid();

const issueDraftBaseSchema = z
  .object({
    requestId: issueDraftRequestIdSchema,
    helperThreadId: z.string().min(1),
    createdAt: z.number().int().nonnegative()
  })
  .strict();

export const runningIssueDraftSchema = issueDraftBaseSchema
  .extend({ status: z.literal('running') })
  .strict();

export const issueDraftRecordSchema = z.discriminatedUnion('status', [
  runningIssueDraftSchema,
  issueDraftBaseSchema
    .extend({
      status: z.literal('complete'),
      title: z.string().trim().min(1).max(500),
      description: z.string().trim().min(1).max(100_000),
      completedAt: z.number().int().nonnegative()
    })
    .strict(),
  issueDraftBaseSchema
    .extend({
      status: z.literal('failed'),
      error: z.string().min(1),
      completedAt: z.number().int().nonnegative()
    })
    .strict()
]);
export type IssueDraftRecord = z.infer<typeof issueDraftRecordSchema>;
export type RunningIssueDraft = z.infer<typeof runningIssueDraftSchema>;

const listInputSchema = z
  .object({
    projectId: bbProjectIdSchema.optional(),
    source: workSourceSchema.optional(),
    query: z.string().optional(),
    stateCategories: z.array(workStateCategorySchema).optional(),
    limit: z.number().int().min(1).max(500).default(200)
  })
  .strict();

export const taskboardRpcContract = defineRpcContract({
  listProjects: {
    input: z.null(),
    output: z.object({ projects: z.array(trackerProjectSchema) }).strict()
  },
  threadProject: {
    input: z.object({ threadId: z.string().min(1) }).strict(),
    output: z.object({ projectId: bbProjectIdSchema }).strict()
  },
  status: {
    input: z.object({ projectId: bbProjectIdSchema }).strict(),
    output: z.object({ sources: z.array(workSourceStatusSchema) }).strict()
  },
  listItems: {
    input: listInputSchema,
    output: z.object({ items: z.array(workItemSchema) }).strict()
  },
  refresh: {
    input: z
      .object({
        projectId: bbProjectIdSchema,
        source: workSourceSchema.optional()
      })
      .strict(),
    output: z
      .object({
        sources: z.array(workSourceStatusSchema),
        itemCount: z.number().int().nonnegative()
      })
      .strict()
  },
  getItem: {
    input: z
      .object({
        projectId: bbProjectIdSchema,
        source: workSourceSchema,
        locator: z.string().min(1)
      })
      .strict(),
    output: z.object({ item: workItemDetailSchema }).strict()
  },
  statusOptions: {
    input: z
      .object({
        projectId: bbProjectIdSchema,
        source: workSourceSchema,
        locator: z.string().min(1)
      })
      .strict(),
    output: z.object({ options: z.array(workStatusOptionSchema) }).strict()
  },
  updateItemStatus: {
    input: z
      .object({
        projectId: bbProjectIdSchema,
        source: workSourceSchema,
        locator: z.string().min(1),
        statusId: z.string().min(1)
      })
      .strict(),
    output: z.object({ item: workItemSchema }).strict()
  },
  getCreateIssueContext: {
    input: z.object({ projectId: bbProjectIdSchema }).strict(),
    output: z.object({ context: createIssueContextSchema }).strict()
  },
  startIssueDraft: {
    input: z
      .object({
        requestId: issueDraftRequestIdSchema,
        projectId: bbProjectIdSchema,
        prompt: z
          .string()
          .min(1)
          .max(64_000)
          .refine(value => value.trim().length > 0, 'Prompt cannot be blank')
      })
      .strict(),
    output: z
      .object({
        requestId: issueDraftRequestIdSchema,
        helperThreadId: z.string().min(1)
      })
      .strict()
  },
  getIssueDraft: {
    input: z.object({ requestId: issueDraftRequestIdSchema }).strict(),
    output: z.object({ draft: issueDraftRecordSchema.nullable() }).strict()
  },
  cancelIssueDraft: {
    input: z.object({ requestId: issueDraftRequestIdSchema }).strict(),
    output: z.object({ cancelled: z.literal(true) }).strict()
  },
  createIssue: {
    input: createIssueInputSchema,
    output: z
      .object({
        item: workItemSchema,
        mention: z
          .object({
            provider: z.literal('external-work-item'),
            id: z.string().min(1),
            label: z.string().min(1)
          })
          .strict()
      })
      .strict()
  },
  getProjectConfig: {
    input: z.object({ projectId: bbProjectIdSchema }).strict(),
    output: z.object({ config: projectConfigViewSchema }).strict()
  },
  saveProjectConfig: {
    input: projectConfigMutationSchema,
    output: z.object({ config: projectConfigViewSchema }).strict()
  },
  getProjectBoardSettings: {
    input: z.object({ projectId: bbProjectIdSchema }).strict(),
    output: z.object({ settings: projectBoardSettingsSchema }).strict()
  },
  saveProjectBoardSettings: {
    input: projectBoardSettingsSchema,
    output: z.object({ settings: projectBoardSettingsSchema }).strict()
  },
  getBoardFilterState: {
    input: z.object({ projectId: bbProjectIdSchema }).strict(),
    output: z.object({ state: boardFilterStateSchema.nullable() }).strict()
  },
  saveBoardFilterState: {
    input: z
      .object({
        projectId: bbProjectIdSchema,
        state: boardFilterStateSchema
      })
      .strict(),
    output: z.object({ state: boardFilterStateSchema }).strict()
  }
});

export type TaskboardRpcContract = typeof taskboardRpcContract;

export function formatWorkItemContext(item: WorkItemDetail | WorkItem): string {
  const lines = [
    `# ${sourceName(item.source)} issue ${item.key}: ${item.title}`,
    '',
    `- Status: ${item.status}`,
    `- Priority: ${item.priority ?? 'None'}`,
    `- Assignee: ${item.assignee ?? 'Unassigned'}`,
    `- BB project: ${item.bbProjectId}`,
    `- Project: ${item.project ?? 'None'}`,
    `- Labels: ${item.labels.join(', ') || 'None'}`,
    `- URL: ${item.url}`,
    '',
    '## Description',
    '',
    item.description.trim() || 'No description provided.'
  ];
  return lines.join('\n');
}

export function sourceName(source: WorkSource): string {
  if (source === 'github') return 'GitHub';
  if (source === 'jira') return 'Jira';
  return 'Linear';
}
