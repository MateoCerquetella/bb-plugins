import { ZodError } from 'zod';

const labels: Record<string, string> = {
  repository: 'Repository',
  branch: 'Implementation branch',
  baseBranch: 'Base branch',
  baseRevision: 'Base revision',
  plan: 'Approved plan',
  acceptanceCriteria: 'Acceptance criteria',
  verificationRequirements: 'Required checks'
};

export function formatExecutionError(
  failure: unknown,
  fallback = 'Execution action failed'
): string {
  if (failure instanceof ZodError) {
    const issue = failure.issues[0];
    if (!issue) return fallback;
    const field = issue.path.find(value => typeof value === 'string');
    return `${typeof field === 'string' ? labels[field] || field : 'Request'}: ${issue.message}`;
  }
  return failure instanceof Error ? failure.message : fallback;
}
