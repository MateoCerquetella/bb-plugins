import { z } from 'zod';
import {
  CREATE_OUTCOME_UNCERTAIN_MARKER,
  type WorkStateCategory
} from '../contract.js';
import type {
  ExternalWorkItemCreateInput,
  ExternalWorkItemDetail,
  ExternalWorkItemFieldMutation,
  ExternalWorkItemInspectorOptions,
  ExternalWorkStatusOption,
  WorkSourceAdapter
} from './types.js';
import { withoutComments } from './types.js';

const LINEAR_API = 'https://api.linear.app/graphql';

const issueFields = `
  id
  identifier
  title
  description
  url
  priority
  priorityLabel
  updatedAt
  state { id name type }
  assignee { id name }
  team { key name }
  project { id name }
  labels(first: 100) { nodes { name } }
`;

const teamIssuesQuery = `
  query TeamIssues($teamKey: String!, $after: String) {
    issues(
      first: 100
      after: $after
      orderBy: updatedAt
      filter: {
        team: { key: { eqIgnoreCase: $teamKey } }
        state: { type: { nin: ["completed", "canceled"] } }
      }
    ) {
      nodes { ${issueFields} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const teamIssuesWithRecentlyFinishedQuery = `
  query TeamIssuesWithRecentlyFinished(
    $teamKey: String!
    $after: String
    $finishedSince: DateTimeOrDuration!
  ) {
    issues(
      first: 100
      after: $after
      orderBy: updatedAt
      filter: {
        team: { key: { eqIgnoreCase: $teamKey } }
        or: [
          { state: { type: { nin: ["completed", "canceled"] } } }
          { completedAt: { gte: $finishedSince } }
          { canceledAt: { gte: $finishedSince } }
        ]
      }
    ) {
      nodes { ${issueFields} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const issueQuery = `
  query TaskboardLinearIssue($id: String!) {
    issue(id: $id) {
      ${issueFields}
      comments(first: 50) {
        nodes { body createdAt user { name } }
      }
    }
  }
`;

const issueStatusOptionsQuery = `
  query TaskboardLinearStatusOptions($id: String!) {
    issue(id: $id) {
      id
      state { id name type }
      team {
        key
        states { nodes { id name type } }
      }
    }
  }
`;

const updateIssueStatusMutation = `
  mutation TaskboardLinearUpdateStatus($id: String!, $stateId: String!) {
    issueUpdate(id: $id, input: { stateId: $stateId }) {
      success
      issue { ${issueFields} }
    }
  }
`;

const issueInspectorOptionsQuery = `
  query TaskboardLinearInspectorOptions(
    $id: String!
    $membersAfter: String
    $projectsAfter: String
  ) {
    issue(id: $id) {
      id
      priority
      assignee { id }
      project { id }
      team {
        key
        members(first: 50, after: $membersAfter) {
          nodes { id name }
          pageInfo { hasNextPage endCursor }
        }
        projects(first: 50, after: $projectsAfter) {
          nodes { id name }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const updateIssueFieldMutation = `
  mutation TaskboardLinearUpdateField($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue { ${issueFields} }
    }
  }
`;

const createCommentMutation = `
  mutation TaskboardLinearCreateComment($input: CommentCreateInput!) {
    commentCreate(input: $input) {
      success
      comment { id issue { id team { key } } }
    }
  }
`;

const teamForCreateQuery = `
  query TaskboardLinearCreateTeam($teamKey: String!) {
    teams(filter: { key: { eqIgnoreCase: $teamKey } }, first: 2) {
      nodes { id key name }
    }
  }
`;

const createMetadataQuery = `
  query TaskboardLinearCreateMetadata(
    $teamKey: String!
    $statesAfter: String
    $membersAfter: String
    $labelsAfter: String
  ) {
    teams(filter: { key: { eqIgnoreCase: $teamKey } }, first: 2) {
      nodes {
        id
        key
        name
        states(first: 50, after: $statesAfter) {
          nodes { id name type }
          pageInfo { hasNextPage endCursor }
        }
        members(first: 50, after: $membersAfter) {
          nodes { id name }
          pageInfo { hasNextPage endCursor }
        }
        labels(first: 50, after: $labelsAfter) {
          nodes { id name }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const createIssueMutation = `
  mutation TaskboardLinearCreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { ${issueFields} }
    }
  }
`;

const namedSchema = z.object({ name: z.string() }).strict();
const identifiedNamedSchema = z
  .object({ id: z.string().min(1), name: z.string() })
  .strict();
const assigneeSchema = z
  .object({ id: z.string().min(1), name: z.string() })
  .strict();
const stateSchema = z
  .object({ id: z.string().min(1), name: z.string(), type: z.string() })
  .strict();
const createOptionSchema = z
  .object({ id: z.string().min(1), name: z.string().min(1) })
  .strict();
const createMetadataPageInfoSchema = z
  .object({
    hasNextPage: z.boolean(),
    endCursor: z.string().nullable()
  })
  .strict();
function createMetadataConnectionSchema<T extends z.ZodTypeAny>(nodeSchema: T) {
  return z
    .object({
      nodes: z.array(nodeSchema),
      pageInfo: createMetadataPageInfoSchema
    })
    .strict();
}
const createMetadataTeamSchema = z
  .object({
    id: z.string().min(1),
    key: z.string().min(1),
    name: z.string(),
    states: createMetadataConnectionSchema(stateSchema),
    members: createMetadataConnectionSchema(createOptionSchema),
    labels: createMetadataConnectionSchema(createOptionSchema)
  })
  .strict();
const issueSchema = z
  .object({
    id: z.string().min(1),
    identifier: z.string().min(1),
    title: z.string(),
    description: z.string().nullable(),
    url: z.string(),
    priority: z.number().int().min(0).max(4).optional(),
    priorityLabel: z.string(),
    updatedAt: z.string(),
    state: stateSchema,
    assignee: assigneeSchema.nullable(),
    team: z.object({ key: z.string(), name: z.string() }).strict(),
    project: z
      .object({ id: z.string().min(1).optional(), name: z.string() })
      .strict()
      .nullable(),
    labels: z.object({ nodes: z.array(namedSchema) }).strict(),
    comments: z
      .object({
        nodes: z.array(
          z
            .object({
              body: z.string(),
              createdAt: z.string(),
              user: namedSchema.nullable()
            })
            .strict()
        )
      })
      .strict()
      .optional()
  })
  .strict();

const issueConnectionSchema = z
  .object({
    nodes: z.array(issueSchema),
    pageInfo: z
      .object({
        hasNextPage: z.boolean(),
        endCursor: z.string().nullable()
      })
      .strict()
  })
  .strict();

function stateCategory(type: string): WorkStateCategory {
  if (type === 'started') return 'in_progress';
  if (type === 'completed') return 'done';
  if (type === 'canceled') return 'canceled';
  if (type === 'backlog') return 'backlog';
  return 'todo';
}

function toItem(value: z.infer<typeof issueSchema>): ExternalWorkItemDetail {
  return {
    source: 'linear',
    locator: value.id,
    key: value.identifier,
    title: value.title,
    description: value.description ?? '',
    url: value.url,
    status: value.state.name,
    stateCategory: stateCategory(value.state.type),
    priority: value.priorityLabel || null,
    assignee: value.assignee?.name ?? null,
    project: value.project?.name ?? null,
    labels: value.labels.nodes.map(label => label.name),
    updatedAt: value.updatedAt,
    comments: (value.comments?.nodes ?? []).map(comment => ({
      author: comment.user?.name ?? 'Unknown',
      body: comment.body,
      createdAt: comment.createdAt
    }))
  };
}

async function requestLinear(
  apiKey: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(LINEAR_API, {
      method: 'POST',
      headers: {
        authorization: apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    throw new Error('Could not reach Linear');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Linear returned HTTP ${response.status}`);
  const envelope = z
    .object({
      data: z.unknown().optional(),
      errors: z.array(z.unknown()).optional()
    })
    .passthrough()
    .parse(payload);
  if (envelope.errors && envelope.errors.length > 0) {
    throw new Error('Linear rejected the request');
  }
  return envelope.data;
}

export function createLinearAdapter(options: {
  enabled: boolean;
  apiKey: string | undefined;
  teamKey: string;
  finishedDays: number;
}): WorkSourceAdapter {
  const teamKey = options.teamKey.trim();
  const listQuery =
    options.finishedDays > 0
      ? teamIssuesWithRecentlyFinishedQuery
      : teamIssuesQuery;
  const listVariables =
    options.finishedDays > 0
      ? { teamKey, finishedSince: `-P${options.finishedDays}D` }
      : { teamKey };
  const apiKey = options.apiKey?.trim() ?? '';
  const hasApiKey = Boolean(apiKey);
  const configured = options.enabled && hasApiKey && Boolean(teamKey);

  async function loadIssue(locator: string): Promise<ExternalWorkItemDetail> {
    const data = await requestLinear(apiKey, issueQuery, { id: locator });
    const issue = z.object({ issue: issueSchema }).strict().parse(data).issue;
    if (issue.id !== locator) {
      throw new Error(`Linear returned the wrong issue for ${locator}`);
    }
    if (issue.team.key.toLowerCase() !== teamKey.toLowerCase()) {
      throw new Error(
        `Linear issue ${locator} is outside the configured scope`
      );
    }
    return toItem(issue);
  }

  async function statusOptions(
    locator: string
  ): Promise<ExternalWorkStatusOption[]> {
    const data = await requestLinear(apiKey, issueStatusOptionsQuery, {
      id: locator
    });
    const result = z
      .object({
        issue: z
          .object({
            id: z.string().min(1),
            state: stateSchema,
            team: z
              .object({
                key: z.string(),
                states: z.object({ nodes: z.array(stateSchema) }).strict()
              })
              .strict()
          })
          .strict()
      })
      .strict()
      .parse(data).issue;
    if (result.id !== locator) {
      throw new Error(`Linear returned the wrong issue for ${locator}`);
    }
    if (result.team.key.toLowerCase() !== teamKey.toLowerCase()) {
      throw new Error(
        `Linear issue ${locator} is outside the configured scope`
      );
    }
    return [
      ...new Map(
        result.team.states.nodes.map(state => [state.id, state])
      ).values()
    ].map(state => ({
      id: state.id,
      name: state.name,
      stateCategory: stateCategory(state.type),
      current: state.id === result.state.id
    }));
  }

  async function inspectorOptions(
    locator: string
  ): Promise<ExternalWorkItemInspectorOptions> {
    const members = new Map<string, z.infer<typeof identifiedNamedSchema>>();
    const projects = new Map<string, z.infer<typeof identifiedNamedSchema>>();
    const seenMemberCursors = new Set<string>();
    const seenProjectCursors = new Set<string>();
    let membersAfter: string | undefined;
    let projectsAfter: string | undefined;
    let loadMembers = true;
    let loadProjects = true;
    let currentPriority = 0;
    let currentAssigneeId: string | null = null;
    let currentProjectId: string | null = null;

    while (loadMembers || loadProjects) {
      const data = await requestLinear(apiKey, issueInspectorOptionsQuery, {
        id: locator,
        ...(membersAfter ? { membersAfter } : {}),
        ...(projectsAfter ? { projectsAfter } : {})
      });
      const issue = z
        .object({
          issue: z
            .object({
              id: z.string().min(1),
              priority: z.number().int().min(0).max(4),
              assignee: z.object({ id: z.string().min(1) }).strict().nullable(),
              project: z.object({ id: z.string().min(1) }).strict().nullable(),
              team: z
                .object({
                  key: z.string(),
                  members: createMetadataConnectionSchema(identifiedNamedSchema),
                  projects: createMetadataConnectionSchema(identifiedNamedSchema)
                })
                .strict()
            })
            .strict()
        })
        .strict()
        .parse(data).issue;
      if (issue.id !== locator) {
        throw new Error(`Linear returned the wrong issue for ${locator}`);
      }
      if (issue.team.key.toLowerCase() !== teamKey.toLowerCase()) {
        throw new Error(`Linear issue ${locator} is outside the configured scope`);
      }
      currentPriority = issue.priority;
      currentAssigneeId = issue.assignee?.id ?? null;
      currentProjectId = issue.project?.id ?? null;

      if (loadMembers) {
        for (const member of issue.team.members.nodes) {
          members.set(member.id, member);
        }
        if (!issue.team.members.pageInfo.hasNextPage) {
          loadMembers = false;
        } else {
          const cursor = issue.team.members.pageInfo.endCursor;
          if (!cursor || seenMemberCursors.has(cursor)) {
            throw new Error('Linear returned an invalid members pagination cursor');
          }
          seenMemberCursors.add(cursor);
          membersAfter = cursor;
        }
      }
      if (loadProjects) {
        for (const project of issue.team.projects.nodes) {
          projects.set(project.id, project);
        }
        if (!issue.team.projects.pageInfo.hasNextPage) {
          loadProjects = false;
        } else {
          const cursor = issue.team.projects.pageInfo.endCursor;
          if (!cursor || seenProjectCursors.has(cursor)) {
            throw new Error('Linear returned an invalid projects pagination cursor');
          }
          seenProjectCursors.add(cursor);
          projectsAfter = cursor;
        }
      }
    }

    const priorities = [
      { id: null, label: 'No priority', value: 0 },
      { id: '1', label: 'Urgent', value: 1 },
      { id: '2', label: 'High', value: 2 },
      { id: '3', label: 'Medium', value: 3 },
      { id: '4', label: 'Low', value: 4 }
    ];
    return {
      priority: {
        supported: true,
        options: priorities.map(option => ({
          id: option.id,
          label: option.label,
          current: option.value === currentPriority
        }))
      },
      assignee: {
        supported: true,
        options: [
          { id: null, label: 'Unassigned', current: currentAssigneeId === null },
          ...[...members.values()].map(member => ({
            id: member.id,
            label: member.name,
            current: member.id === currentAssigneeId
          }))
        ]
      },
      project: {
        supported: true,
        options: [
          { id: null, label: 'No project', current: currentProjectId === null },
          ...[...projects.values()].map(project => ({
            id: project.id,
            label: project.name,
            current: project.id === currentProjectId
          }))
        ]
      },
      comments: { supported: true }
    };
  }

  function issueUpdateInput(mutation: ExternalWorkItemFieldMutation) {
    if (mutation.field === 'priority') {
      const priority = mutation.optionId === null ? 0 : Number(mutation.optionId);
      if (!Number.isInteger(priority) || priority < 0 || priority > 4) {
        throw new Error('Linear priority is not available for this issue');
      }
      return { priority };
    }
    if (mutation.field === 'assignee') {
      return { assigneeId: mutation.optionId };
    }
    return { projectId: mutation.optionId };
  }

  async function createMetadata() {
    const states = new Map<string, z.infer<typeof stateSchema>>();
    const members = new Map<string, z.infer<typeof createOptionSchema>>();
    const labels = new Map<string, z.infer<typeof createOptionSchema>>();
    const seenStateCursors = new Set<string>();
    const seenMemberCursors = new Set<string>();
    const seenLabelCursors = new Set<string>();
    let statesAfter: string | undefined;
    let membersAfter: string | undefined;
    let labelsAfter: string | undefined;
    let loadStates = true;
    let loadMembers = true;
    let loadLabels = true;
    let expectedTeamId: string | undefined;

    while (loadStates || loadMembers || loadLabels) {
      const data = await requestLinear(apiKey, createMetadataQuery, {
        teamKey,
        ...(statesAfter ? { statesAfter } : {}),
        ...(membersAfter ? { membersAfter } : {}),
        ...(labelsAfter ? { labelsAfter } : {})
      });
      const teams = z
        .object({
          teams: z
            .object({ nodes: z.array(createMetadataTeamSchema) })
            .strict()
        })
        .strict()
        .parse(data).teams.nodes;
      const team = teams.find(
        candidate => candidate.key.toLowerCase() === teamKey.toLowerCase()
      );
      if (!team) throw new Error(`Linear team ${teamKey} was not found`);
      if (expectedTeamId && team.id !== expectedTeamId) {
        throw new Error('Linear returned inconsistent creation metadata');
      }
      expectedTeamId = team.id;

      if (loadStates) {
        for (const state of team.states.nodes) states.set(state.id, state);
        if (!team.states.pageInfo.hasNextPage) {
          loadStates = false;
        } else {
          const cursor = team.states.pageInfo.endCursor;
          if (!cursor || seenStateCursors.has(cursor)) {
            throw new Error('Linear returned an invalid states pagination cursor');
          }
          seenStateCursors.add(cursor);
          statesAfter = cursor;
        }
      }
      if (loadMembers) {
        for (const member of team.members.nodes) members.set(member.id, member);
        if (!team.members.pageInfo.hasNextPage) {
          loadMembers = false;
        } else {
          const cursor = team.members.pageInfo.endCursor;
          if (!cursor || seenMemberCursors.has(cursor)) {
            throw new Error(
              'Linear returned an invalid members pagination cursor'
            );
          }
          seenMemberCursors.add(cursor);
          membersAfter = cursor;
        }
      }
      if (loadLabels) {
        for (const label of team.labels.nodes) labels.set(label.id, label);
        if (!team.labels.pageInfo.hasNextPage) {
          loadLabels = false;
        } else {
          const cursor = team.labels.pageInfo.endCursor;
          if (!cursor || seenLabelCursors.has(cursor)) {
            throw new Error('Linear returned an invalid labels pagination cursor');
          }
          seenLabelCursors.add(cursor);
          labelsAfter = cursor;
        }
      }
    }

    return {
      statusOptions: [...states.values()].map(state => ({
        id: state.id,
        label: state.name
      })),
      assigneeOptions: [...members.values()].map(member => ({
        id: member.id,
        label: member.name
      })),
      priorityOptions: [
        { id: '1', label: 'Urgent' },
        { id: '2', label: 'High' },
        { id: '3', label: 'Medium' },
        { id: '4', label: 'Low' },
        { id: '0', label: 'No priority' }
      ],
      labelOptions: [...labels.values()].map(label => ({
        id: label.id,
        label: label.name
      })),
      milestoneOptions: [],
      issueTypeOptions: [],
      defaultStatusId: null,
      defaultIssueTypeId: null,
      supportsDueDate: true
    };
  }

  return {
    source: 'linear',
    configured: () => configured,
    async uploadImage(image) {
      if (!configured) throw new Error('Linear is not configured');
      const data = await requestLinear(apiKey, `
        mutation TaskboardUploadImage($contentType: String!, $filename: String!, $size: Int!) {
          fileUpload(contentType: $contentType, filename: $filename, size: $size) {
            success uploadFile { uploadUrl assetUrl headers { key value } }
          }
        }`, { contentType: image.mimeType, filename: image.name, size: image.bytes.byteLength });
      const result = z.object({ fileUpload: z.object({
        success: z.boolean(),
        uploadFile: z.object({
          uploadUrl: z.string().url(), assetUrl: z.string().url(),
          headers: z.array(z.object({ key: z.string(), value: z.string() }))
        }).nullable()
      }) }).parse(data).fileUpload;
      if (!result.success || !result.uploadFile) throw new Error('Linear could not prepare the image upload.');
      const { uploadUrl, assetUrl, headers } = result.uploadFile;
      if (new URL(uploadUrl).protocol !== 'https:' || new URL(assetUrl).protocol !== 'https:') {
        throw new Error('Linear returned an invalid upload destination.');
      }
      const response = await fetch(uploadUrl, {
        method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(60_000),
        headers: { 'Content-Type': image.mimeType, ...Object.fromEntries(headers.map(header => [header.key, header.value])) },
        body: new Blob([new Uint8Array(image.bytes)], { type: image.mimeType })
      });
      if (!response.ok) throw new Error('Linear image upload failed. Your issue has not been created.');
      return assetUrl;
    },
    configurationMessage: () =>
      !options.enabled
        ? 'Enable Linear for this BB project in Manage.'
        : !teamKey
          ? 'Choose a Linear team key for this BB project in Manage.'
          : hasApiKey
            ? null
            : 'Add a Linear personal API key for this BB project in Manage.',
    async list() {
      if (!configured) throw new Error('Linear is not configured');
      const issues: z.infer<typeof issueSchema>[] = [];
      const seenCursors = new Set<string>();
      let after: string | undefined;
      for (;;) {
        const data = await requestLinear(apiKey, listQuery, {
          ...listVariables,
          ...(after ? { after } : {})
        });
        const connection = z
          .object({ issues: issueConnectionSchema })
          .strict()
          .parse(data).issues;
        if (
          connection.nodes.some(
            issue => issue.team.key.toLowerCase() !== teamKey.toLowerCase()
          )
        ) {
          throw new Error(
            'Linear returned an issue outside the configured team'
          );
        }
        issues.push(...connection.nodes);
        if (!connection.pageInfo.hasNextPage) break;
        const cursor = connection.pageInfo.endCursor;
        if (!cursor || seenCursors.has(cursor)) {
          throw new Error('Linear returned an invalid pagination cursor');
        }
        seenCursors.add(cursor);
        after = cursor;
      }
      return issues.map(issue => withoutComments(toItem(issue)));
    },
    async get(locator) {
      if (!configured) throw new Error('Linear is not configured');
      return loadIssue(locator);
    },
    async statusOptions(locator) {
      if (!configured) throw new Error('Linear is not configured');
      return statusOptions(locator);
    },
    async inspectorOptions(locator) {
      if (!configured) throw new Error('Linear is not configured');
      return inspectorOptions(locator);
    },
    async createMetadata(input) {
      if (!configured) throw new Error('Linear is not configured');
      if (input.destinationId.toLowerCase() !== teamKey.toLowerCase()) {
        throw new Error(
          `Linear team ${input.destinationId} is outside the configured scope`
        );
      }
      return createMetadata();
    },
    async create(input: ExternalWorkItemCreateInput) {
      if (!configured) throw new Error('Linear is not configured');
      if (input.destinationId.toLowerCase() !== teamKey.toLowerCase()) {
        throw new Error(
          `Linear team ${input.destinationId} is outside the configured scope`
        );
      }
      const teamData = await requestLinear(apiKey, teamForCreateQuery, {
        teamKey
      });
      const teams = z
        .object({
          teams: z
            .object({
              nodes: z.array(
                z
                  .object({
                    id: z.string().min(1),
                    key: z.string().min(1),
                    name: z.string()
                  })
                  .strict()
              )
            })
            .strict()
        })
        .strict()
        .parse(teamData).teams.nodes;
      const team = teams.find(
        candidate => candidate.key.toLowerCase() === teamKey.toLowerCase()
      );
      if (!team) throw new Error(`Linear team ${teamKey} was not found`);
      const priority =
        input.priorityId === null ? null : Number(input.priorityId);
      if (
        priority !== null &&
        (!Number.isInteger(priority) || priority < 0 || priority > 4)
      ) {
        throw new Error('Linear priority is invalid');
      }
      if (input.milestoneId !== null) {
        throw new Error('Linear issues use a due date instead of a milestone');
      }
      let data: unknown;
      try {
        data = await requestLinear(apiKey, createIssueMutation, {
          input: {
            teamId: team.id,
            title: input.title,
            description: input.description,
            ...(input.statusId ? { stateId: input.statusId } : {}),
            ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
            ...(priority !== null ? { priority } : {}),
            ...(input.labelIds.length > 0 ? { labelIds: input.labelIds } : {}),
            ...(input.dueDate ? { dueDate: input.dueDate } : {})
          }
        });
      } catch {
        throw new Error(
          `${CREATE_OUTCOME_UNCERTAIN_MARKER} Linear may have created the issue, but Taskboard could not confirm the response. Refresh the board and check for it before trying again.`
        );
      }
      const acknowledgement = z
        .object({
          issueCreate: z
            .object({
              success: z.boolean(),
              issue: z.unknown().nullable().optional()
            })
            .passthrough()
        })
        .passthrough()
        .safeParse(data);
      if (
        acknowledgement.success &&
        acknowledgement.data.issueCreate.success === false &&
        acknowledgement.data.issueCreate.issue == null
      ) {
        throw new Error('Linear rejected the new issue');
      }
      try {
        const created = z
          .object({
            issueCreate: z
              .object({ success: z.literal(true), issue: issueSchema })
              .strict()
          })
          .strict()
          .parse(data).issueCreate;
        if (created.issue.team.key.toLowerCase() !== teamKey.toLowerCase()) {
          throw new Error('Linear created the issue outside the configured team');
        }
        return {
          item: toItem(created.issue),
          warnings: [],
          assigneeConfirmation: {
            confirmed: true,
            id: created.issue.assignee?.id ?? null
          }
        };
      } catch {
        throw new Error(
          `${CREATE_OUTCOME_UNCERTAIN_MARKER} Linear may have created the issue, but Taskboard could not confirm its details. Refresh the board and check for it before trying again.`
        );
      }
    },
    async updateStatus(locator, statusId) {
      if (!configured) throw new Error('Linear is not configured');
      const available = await statusOptions(locator);
      const target = available.find(option => option.id === statusId);
      if (!target) {
        throw new Error('Linear status is not available for this issue');
      }
      if (target.current) return loadIssue(locator);
      const data = await requestLinear(apiKey, updateIssueStatusMutation, {
        id: locator,
        stateId: statusId
      });
      const update = z
        .object({
          issueUpdate: z
            .object({ success: z.boolean(), issue: issueSchema })
            .strict()
        })
        .strict()
        .parse(data).issueUpdate;
      if (!update.success) throw new Error('Linear rejected the status update');
      if (
        update.issue.id !== locator ||
        update.issue.state.id !== statusId ||
        update.issue.team.key.toLowerCase() !== teamKey.toLowerCase()
      ) {
        throw new Error('Linear returned an invalid status update result');
      }
      return toItem(update.issue);
    },
    async updateField(locator, mutation) {
      if (!configured) throw new Error('Linear is not configured');
      const available = await inspectorOptions(locator);
      const target = available[mutation.field].options.find(
        option => option.id === mutation.optionId
      );
      if (!target) {
        throw new Error(`Linear ${mutation.field} is not available for this issue`);
      }
      if (target.current) return loadIssue(locator);
      const data = await requestLinear(apiKey, updateIssueFieldMutation, {
        id: locator,
        input: issueUpdateInput(mutation)
      });
      const update = z
        .object({
          issueUpdate: z
            .object({ success: z.boolean(), issue: issueSchema })
            .strict()
        })
        .strict()
        .parse(data).issueUpdate;
      if (!update.success) {
        throw new Error(`Linear rejected the ${mutation.field} update`);
      }
      if (
        update.issue.id !== locator ||
        update.issue.team.key.toLowerCase() !== teamKey.toLowerCase()
      ) {
        throw new Error(`Linear returned an invalid ${mutation.field} update result`);
      }
      return toItem(update.issue);
    },
    async addComment(locator, body) {
      if (!configured) throw new Error('Linear is not configured');
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Comment cannot be empty');
      await loadIssue(locator);
      const data = await requestLinear(apiKey, createCommentMutation, {
        input: { issueId: locator, body: trimmed }
      });
      const result = z
        .object({
          commentCreate: z
            .object({
              success: z.boolean(),
              comment: z
                .object({
                  id: z.string().min(1),
                  issue: z.object({
                    id: z.string().min(1),
                    team: z.object({ key: z.string() }).strict()
                  }).strict()
                })
                .strict()
                .nullable()
            })
            .strict()
        })
        .strict()
        .parse(data).commentCreate;
      if (!result.success || !result.comment) {
        throw new Error('Linear rejected the comment');
      }
      if (
        result.comment.issue.id !== locator ||
        result.comment.issue.team.key.toLowerCase() !== teamKey.toLowerCase()
      ) {
        throw new Error('Linear returned an invalid comment result');
      }
      return loadIssue(locator);
    }
  };
}
