import type {
  AssigneeConfirmation,
  CreateIssueMetadata,
  WorkItem,
  WorkItemDetail,
  WorkSource,
  WorkStatusOption
} from '../contract.js';

export type ExternalWorkItem = Omit<WorkItem, 'bbProjectId'>;
export type ExternalWorkItemDetail = Omit<WorkItemDetail, 'bbProjectId'>;
export type ExternalWorkStatusOption = WorkStatusOption;

export interface ExternalWorkItemCreateInput {
  title: string;
  description: string;
  destinationId: string;
  issueType: string | null;
  statusId: string | null;
  assigneeId: string | null;
  priorityId: string | null;
  labelIds: string[];
  dueDate: string | null;
  milestoneId: string | null;
}

export interface ExternalWorkItemCreateMetadataInput {
  destinationId: string;
  issueType: string | null;
}

export interface ExternalWorkItemCreateResult {
  item: ExternalWorkItemDetail;
  warnings: string[];
  assigneeConfirmation: AssigneeConfirmation;
}

export interface ExternalWorkItemSelectionOption {
  id: string | null;
  label: string;
  current: boolean;
}

export interface ExternalWorkItemInspectorOptions {
  priority: {
    supported: boolean;
    options: ExternalWorkItemSelectionOption[];
  };
  assignee: {
    supported: boolean;
    options: ExternalWorkItemSelectionOption[];
  };
  project: {
    supported: boolean;
    options: ExternalWorkItemSelectionOption[];
  };
  comments: { supported: boolean };
}

export type ExternalWorkItemFieldMutation =
  | { field: 'priority'; optionId: string | null }
  | { field: 'assignee'; optionId: string | null }
  | { field: 'project'; optionId: string | null };

export function withoutComments(
  item: ExternalWorkItemDetail
): ExternalWorkItem {
  const { comments: _comments, ...summary } = item;
  return summary;
}

export interface WorkSourceAdapter {
  uploadImage?(image: { name: string; bytes: Uint8Array; mimeType: string }): Promise<string>;
  readonly source: WorkSource;
  configured(): boolean;
  configurationMessage(): string | null;
  list(options?: { refresh?: boolean }): Promise<ExternalWorkItem[]>;
  get(locator: string): Promise<ExternalWorkItemDetail>;
  statusOptions(locator: string): Promise<ExternalWorkStatusOption[]>;
  createMetadata(
    input: ExternalWorkItemCreateMetadataInput
  ): Promise<CreateIssueMetadata>;
  create(
    input: ExternalWorkItemCreateInput
  ): Promise<ExternalWorkItemCreateResult>;
  updateStatus(
    locator: string,
    statusId: string
  ): Promise<ExternalWorkItemDetail>;
  inspectorOptions?(
    locator: string
  ): Promise<ExternalWorkItemInspectorOptions>;
  updateField?(
    locator: string,
    mutation: ExternalWorkItemFieldMutation
  ): Promise<ExternalWorkItemDetail>;
  addComment?(
    locator: string,
    body: string
  ): Promise<ExternalWorkItemDetail>;
}
