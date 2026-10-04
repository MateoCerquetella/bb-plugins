import { z } from 'zod';
import {
  CREATE_OUTCOME_UNCERTAIN_MARKER,
  type WorkStateCategory
} from '../contract.js';
import type {
  ExternalWorkItemCreateInput,
  ExternalWorkItemDetail,
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
  priorityLabel
  updatedAt
  state { id name type }
  assignee { id name }
  team { key name }
  project { name }
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
    priorityLabel: z.string(),
    updatedAt: z.string(),
    state: stateSchema,
    assignee: assigneeSchema.nullable(),
    team: z.object({ key: z.string(), name: z.string() }).strict(),
    project: namedSchema.nullable(),
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
    project: value.project?.name ?? value.team.name,
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
    }
  };
}
