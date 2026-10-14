// A structural subset of empirical-sdd's RepositoryOverview. Keep the
// projection independent of the host transport and persisted factory record.
export interface EmpiricalOverview {
  schemaVersion: number;
  root: string;
  truncated: boolean;
  worktrees: Array<{
    root: string;
    selectedFeature: string | null;
    selection: 'valid' | 'unavailable';
  }>;
  specs: Array<{
    feature: string;
    owners: string[];
    ownership: 'selected' | 'unclaimed' | 'conflict' | 'unknown';
    copies: Array<{
      root: string;
      phase: string | null;
      status: string | null;
      revision: number | null;
      completionLevel: string;
      verification: 'verified' | 'skipped' | 'pending' | 'unknown';
      nextAction: string;
      merged: boolean;
      valid: boolean;
    }>;
  }>;
  issues: Array<{ root: string; feature?: string; code: string; message: string }>;
}

export type EmpiricalCheckoutState =
  | { kind: 'none'; root: string; issues: string[] }
  | { kind: 'invalid'; root: string; issues: string[] }
  | {
      kind: 'feature';
      root: string;
      feature: string;
      owners: string[];
      ownership: EmpiricalOverview['specs'][number]['ownership'];
      phase: string;
      status: string;
      revision: number;
      completionLevel: string;
      verification: EmpiricalOverview['specs'][number]['copies'][number]['verification'];
      nextAction: string;
      mergedButUnclosed: boolean;
      verifiedDone: boolean;
      issues: string[];
    };

export function projectEmpiricalCheckout(
  overview: EmpiricalOverview,
  checkoutRoot: string
): EmpiricalCheckoutState {
  if (overview.schemaVersion !== 1 || overview.root !== checkoutRoot) {
    throw new Error('Empirical overview does not match the requested checkout.');
  }
  const worktree = overview.worktrees.find(entry => entry.root === checkoutRoot);
  if (!worktree) {
    throw new Error('Empirical overview omitted the requested checkout.');
  }
  const issues = overview.issues
    .filter(entry => entry.root === checkoutRoot || entry.feature === worktree.selectedFeature)
    .slice(0, 10)
    .map(entry => `${entry.code}: ${entry.message}`);
  if (overview.truncated || worktree.selection === 'unavailable') {
    return { kind: 'invalid', root: checkoutRoot, issues };
  }
  if (!worktree.selectedFeature) {
    return { kind: 'none', root: checkoutRoot, issues };
  }
  const spec = overview.specs.find(entry => entry.feature === worktree.selectedFeature);
  const copy = spec?.copies.find(entry => entry.root === checkoutRoot);
  if (!spec || !copy?.valid || copy.phase === null || copy.status === null ||
    copy.revision === null) {
    return {
      kind: 'invalid',
      root: checkoutRoot,
      issues: issues.length ? issues : ['Selected Empirical feature is unavailable.']
    };
  }
  return {
    kind: 'feature',
    root: checkoutRoot,
    feature: spec.feature,
    owners: spec.owners,
    ownership: spec.ownership,
    phase: copy.phase,
    status: copy.status,
    revision: copy.revision,
    completionLevel: copy.completionLevel,
    verification: copy.verification,
    nextAction: copy.nextAction,
    mergedButUnclosed: copy.merged,
    verifiedDone: copy.phase === 'done' && copy.status === 'done' &&
      copy.verification === 'verified' && !copy.merged,
    issues
  };
}

export interface EmpiricalObservationIdentity {
  hostId: string;
  environmentId: string;
  checkoutRoot: string;
}

export type EmpiricalLiveObservation =
  | { kind: 'unobserved'; identity: EmpiricalObservationIdentity }
  | {
      kind: 'observed' | 'stale';
      identity: EmpiricalObservationIdentity;
      observedAt: number;
      state: EmpiricalCheckoutState;
      reason?: string;
    };

function sameIdentity(
  left: EmpiricalObservationIdentity,
  right: EmpiricalObservationIdentity
): boolean {
  return left.hostId === right.hostId &&
    left.environmentId === right.environmentId &&
    left.checkoutRoot === right.checkoutRoot;
}

export function receiveEmpiricalObservation(
  current: EmpiricalLiveObservation,
  identity: EmpiricalObservationIdentity,
  overview: EmpiricalOverview,
  observedAt: number
): EmpiricalLiveObservation {
  if (!sameIdentity(current.identity, identity) ||
    !Number.isFinite(observedAt) ||
    (current.kind !== 'unobserved' && observedAt < current.observedAt)) {
    throw new Error('Empirical observation identity or time does not match.');
  }
  return {
    kind: 'observed',
    identity,
    observedAt,
    state: projectEmpiricalCheckout(overview, identity.checkoutRoot)
  };
}

export function empiricalObservationAt(
  current: EmpiricalLiveObservation,
  identity: EmpiricalObservationIdentity,
  now: number,
  maxAgeMs: number,
  failure?: string
): EmpiricalLiveObservation {
  if (!sameIdentity(current.identity, identity)) {
    throw new Error('Empirical observation identity does not match.');
  }
  if (current.kind === 'unobserved') return current;
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
    throw new Error('Invalid Empirical observation clock.');
  }
  if (failure || current.kind === 'stale' || now - current.observedAt > maxAgeMs) {
    return {
      ...current,
      kind: 'stale',
      reason: failure ?? current.reason ?? 'Observation is older than the refresh interval.'
    };
  }
  return current;
}
