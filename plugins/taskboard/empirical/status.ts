import { resolve } from 'node:path';
import { EmpiricalError, EmpiricalProject, repositoryOverview } from 'empirical-sdd';
import { empiricalOverviewSchema, projectEmpiricalCheckout, type EmpiricalOverview } from './observation.ts';
import type { EmpiricalStatus } from './contract.ts';

type ReadOverview = (root: string) => Promise<EmpiricalOverview>;
type ReadCompletion = (root: string) => Promise<{
  activeFeature: string | null;
  revision: number;
  phase: string;
  status: string;
  completion: { highest: string; verified: boolean };
  completionRecord?: { method: string };
}>;

const readOverview: ReadOverview = async root =>
  empiricalOverviewSchema.parse(await repositoryOverview(root));

const readCompletion: ReadCompletion = async root =>
  (await EmpiricalProject.openReadOnly(root, { selection: 'selected' })).status();

export async function readEmpiricalStatus(
  checkoutRoot: string,
  environmentId: string,
  overview: ReadOverview = readOverview,
  completion: ReadCompletion = readCompletion
): Promise<{ environmentId: string; root: string; status: EmpiricalStatus }> {
  const root = resolve(checkoutRoot);
  const result = (status: EmpiricalStatus) => ({ environmentId, root, status });
  try {
    const current = await completion(root);
    const inventory = await overview(root);
    if (inventory.root !== root) {
      return result({ kind: 'invalid', reason: 'Empirical returned another checkout.' });
    }
    const state = projectEmpiricalCheckout(inventory, root);
    if (state.kind === 'none') {
      return result(current.activeFeature === null ? { kind: 'empty' } :
        { kind: 'invalid', reason: 'Empirical selection changed during observation.' });
    }
    if (state.kind === 'invalid') {
      return result({ kind: 'invalid', reason: state.issues.join(' ').slice(0, 500) ||
        'Selected Empirical copy is invalid.' });
    }
    if (current.activeFeature !== state.feature || current.revision !== state.revision ||
      current.phase !== state.phase || current.status !== state.status ||
      current.completion.highest !== state.completionLevel ||
      (current.completion.verified ? 'verified' : 'pending') !== state.verification &&
        state.verification !== 'skipped') {
      return result({ kind: 'invalid', reason: 'Empirical changed during observation. Refreshing will retry.' });
    }
    return result({
      kind: 'feature',
      feature: state.feature,
      revision: state.revision,
      phase: state.phase.slice(0, 100),
      status: state.status.slice(0, 100),
      nextAction: state.nextAction.slice(0, 1000),
      verification: state.verification,
      completionLevel: state.completionLevel.slice(0, 100),
      completionMethod: current.completionRecord?.method?.slice(0, 200) ?? null,
      ownership: state.ownership,
      owners: state.owners.slice(0, 128),
      mergedButUnclosed: state.mergedButUnclosed
    });
  } catch (error) {
    if (error instanceof EmpiricalError && error.code === 'PROJECT_NOT_INITIALIZED') {
      return result({ kind: 'uninitialized' });
    }
    return result({ kind: 'unavailable', reason: 'Empirical status could not be read.' });
  }
}
