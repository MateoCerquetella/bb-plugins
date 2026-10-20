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
