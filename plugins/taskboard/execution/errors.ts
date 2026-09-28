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

const corrections: Record<string, string> = {
  branch:
    'use a Git branch name without consecutive slashes, dot segments, trailing dots, or .lock',
  baseBranch:
    'use a Git branch name without consecutive slashes, dot segments, trailing dots, or .lock'
};

export function formatExecutionError(
  failure: unknown,
  fallback = 'Execution action failed'
): string {
  if (failure instanceof ZodError) {
    const issue = failure.issues[0];
    if (!issue) return fallback;
    const field = issue.path.find(value => typeof value === 'string');
    const name = typeof field === 'string' ? field : '';
    const message =
      corrections[name] && issue.message === 'Invalid Git branch'
        ? corrections[name]
        : issue.message;
    return `${labels[name] || name || 'Request'}: ${message}`;
  }
  return failure instanceof Error ? failure.message : fallback;
}
