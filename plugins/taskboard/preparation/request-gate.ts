export type PreparationIdentity = { id: string; projectId: string };

/** Invalidates obsolete reads after selection changes, newer reads, or a mutation. */
export function preparationRequestGate() {
  let generation = 0;
  return {
    begin(scope: PreparationIdentity) {
      const request = ++generation;
      return (response?: PreparationIdentity) =>
        request === generation &&
        (!response ||
          (response.id === scope.id && response.projectId === scope.projectId));
    },
    invalidate() {
      generation++;
    }
  };
}
