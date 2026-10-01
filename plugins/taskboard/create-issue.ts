import type {
  CreateIssueMetadataFailure,
  WorkSource
} from './contract.js';

const SOURCE_LABELS: Record<WorkSource, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  jira: 'Jira',
  linear: 'Linear'
};

export function assertExpectedIssueSource(
  expectedSource: WorkSource,
  currentSource: WorkSource
): WorkSource {
  if (currentSource !== expectedSource) {
    throw new Error(
      `Taskboard changed from ${SOURCE_LABELS[expectedSource]} to ${SOURCE_LABELS[currentSource]} while this issue was being reviewed. Reopen the form before creating it.`
    );
  }
  return expectedSource;
}

export function assertExpectedConnectorRevision(
  expectedRevision: number,
  currentRevision: number,
  source: WorkSource
): number {
  if (expectedRevision !== currentRevision) {
    throw new Error(
      `${SOURCE_LABELS[source]} connection changed after the issue form loaded; refresh the form and review the current fields`
    );
  }
  return currentRevision;
}

export function createSafeIssueMetadataFailure(
  source: WorkSource,
  _providerError: unknown
): CreateIssueMetadataFailure {
  return {
    ok: false,
    error: {
      code: 'metadata_unavailable',
      safeMessage: `${SOURCE_LABELS[source]} could not load issue creation options. Check the connection and try again.`
    }
  };
}

export async function reconcileIssueCreation<T>(
  creation: Promise<T>,
  reconcile: (forceRefresh: boolean) => Promise<unknown>
): Promise<void> {
  try {
    await creation;
  } catch {
    await reconcile(true);
    return;
  }
  await reconcile(true);
}
