import type { ExecutionSelection, SelectionResolutionError } from "../contract.js";

export interface ModelOption {
  model: string;
  isDefault: boolean;
  defaultReasoningEffort: ExecutionSelection["reasoningLevel"];
  supportedReasoningEfforts: ReadonlyArray<{
    reasoningEffort: ExecutionSelection["reasoningLevel"];
  }>;
}

export interface ProviderOption { id: string; available: boolean; }
export interface ExecutionOptions {
  providers: readonly ProviderOption[];
  models: readonly ModelOption[];
  modelLoadError: { code: string; providerId: string } | null;
}
export interface SelectionResolverSdk {
  executionOptions(args: { hostId: string; providerId?: string }): Promise<ExecutionOptions>;
}
export interface SelectionResolution {
  selection: ExecutionSelection | null;
  error: SelectionResolutionError | null;
}

function resolutionError(code: SelectionResolutionError["code"], message: string): SelectionResolution {
  return { selection: null, error: { code, message } };
}

export async function resolveSupportedSelection(
  sdk: SelectionResolverSdk,
  hostId: string,
  preferred: ExecutionSelection | null,
): Promise<SelectionResolution> {
  try {
    const initial = await sdk.executionOptions({
      hostId,
      ...(preferred === null ? {} : { providerId: preferred.providerId }),
    });
    const preferredProvider = preferred === null ? undefined : initial.providers.find(
      (provider) => provider.id === preferred.providerId && provider.available,
    );
    const provider = preferredProvider ?? initial.providers.find((candidate) => candidate.available);
    if (provider === undefined) {
      return resolutionError("no-providers", "No available providers were reported for this machine.");
    }

    const options = preferredProvider !== undefined
      ? initial
      : await sdk.executionOptions({ hostId, providerId: provider.id });
    const preferredModel = preferred?.providerId === provider.id
      ? options.models.find((model) => model.model === preferred.model)
      : undefined;
    const model = preferredModel ?? options.models.find((candidate) => candidate.isDefault) ?? options.models[0];
    if (model === undefined) {
      const unavailable = options.modelLoadError !== null;
      return resolutionError(
        unavailable ? "host-unavailable" : "no-models",
        unavailable
          ? "This machine's provider catalog is currently unavailable."
          : "No models were reported for this machine and provider.",
      );
    }

    const supportsPreferred = model.supportedReasoningEfforts.some(
      (option) => option.reasoningEffort === preferred?.reasoningLevel,
    );
    return {
      selection: {
        providerId: provider.id,
        model: model.model,
        reasoningLevel: supportsPreferred ? preferred!.reasoningLevel : model.defaultReasoningEffort,
      },
      error: null,
    };
  } catch {
    return resolutionError("failed", "BB could not load this machine's model catalog.");
  }
}
