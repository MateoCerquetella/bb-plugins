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
}
