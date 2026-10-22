export const nativeError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1000);

export function dispatchRejection(value: string) {
  if (/HTTP 404: Project has no local-path source for (?:host|the primary host)(?:\.|$)/i.test(value)) {
    return 'BB could not find a project checkout on the selected host. Configure the project source with the Git repository folder on that host, then retry.';
  }
  if (/HTTP 400: hostId is required unless workspace\.type is personal/i.test(value)) {
    return 'BB rejected the environment before starting a session. Retry using the project default environment.';
  }
  if (/HTTP 409: This project checkout has no usable git branch\./i.test(value)) {
    return 'BB could not create a worktree because the project checkout has no usable Git branch. Repair the project checkout, then retry.';
  }
  return null;
}

export function executionForDispatch(
  selected: import('./contract.js').FactoryExecution | null,
  defaults: import('./contract.js').FactoryExecution | null
) {
  if (selected) {
    return {
      ...selected,
      executionInputSources: {
        providerId: 'explicit' as const, model: 'explicit' as const, permissionMode: 'explicit' as const,
        reasoningLevel: 'explicit' as const, serviceTier: 'explicit' as const
      }
    };
  }
  if (defaults) return defaults;
  throw new Error('Choose a provider and model in factory settings before starting work.');
}

type ThreadDefaults = Pick<import('./contract.js').FactoryExecution,
  'model' | 'permissionMode' | 'reasoningLevel' | 'serviceTier'>;

export function threadExecution(providerId: string, defaults: ThreadDefaults) {
  return {
    providerId, model: defaults.model, permissionMode: defaults.permissionMode,
    reasoningLevel: defaults.reasoningLevel, serviceTier: defaults.serviceTier
  };
}
