export type ReasoningLevel =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "ultracode"
  | "max"
  | "ultra";

export interface Preference {
  /** Empty means the browser-wide fallback scope. */
  hostId: string;
  providerId: string;
  model: string;
  reasoningLevel: ReasoningLevel;
}

export interface SavedSelection {
  hostId: string;
  providerId: string;
  model: string | null;
  reasoningLevel: ReasoningLevel | null;
}

const PREFIX = "bb.save-my-model.v3";
const PREVIOUS_PREFIX = "bb.save-my-model.v2";
const PROVIDER_RECORD = "provider";
const EXECUTION_RECORD = "execution";
const LEGACY_PROVIDER_KEY = "bb.promptbox.provider";
const LEGACY_MODEL_KEY = "bb.promptbox.model";
const LEGACY_REASONING_KEY = "bb.promptbox.reasoning";
const LEGACY_PROVIDER_VERSION = "1";
const MAX_HOST_ID = 128;
const MAX_PROVIDER_ID = 128;
const MAX_MODEL = 256;
const MAX_STORED_VALUE = 2_048;
const MAX_LISTED_PREFERENCES = 200;
const MAX_SCANNED_PREFERENCE_RECORDS = 1_000;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const validReasoning = new Set<ReasoningLevel>([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "ultracode",
  "max",
  "ultra",
]);

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function boundedIdentity(value: string, maxLength: number): string | null {
  const normalized = value.trim();
  return normalized.length > 0 &&
    normalized.length <= maxLength &&
    !CONTROL_CHARACTER.test(normalized)
    ? normalized
    : null;
}

function normalizeHostId(hostId: string | null | undefined): string {
  return boundedIdentity(hostId ?? "", MAX_HOST_ID) ?? "";
}

function providerKey(hostId: string): string {
  return `${PREFIX}:${PROVIDER_RECORD}:${encodeURIComponent(hostId)}`;
}

function executionKey(hostId: string, providerId: string): string {
  return `${PREFIX}:${EXECUTION_RECORD}:${encodeURIComponent(hostId)}:${encodeURIComponent(providerId)}`;
}

function legacyProviderKey(storageKey: string, providerId: string): string {
  return `${storageKey}-${encodeURIComponent(providerId)}-${LEGACY_PROVIDER_VERSION}`;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function validModel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_MODEL &&
    !CONTROL_CHARACTER.test(value)
  );
}

function validProvider(value: unknown): value is string {
  return (
    typeof value === "string" &&
    boundedIdentity(value, MAX_PROVIDER_ID) === value
  );
}

function validReasoningLevel(value: unknown): value is ReasoningLevel {
  return typeof value === "string" && validReasoning.has(value as ReasoningLevel);
}

function readCurrentValue(raw: string | null): {
  model: string;
  reasoningLevel: ReasoningLevel;
} | null {
  if (raw === null || raw.length > MAX_STORED_VALUE) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return validModel(value.model) && validReasoningLevel(value.reasoningLevel)
      ? { model: value.model, reasoningLevel: value.reasoningLevel }
      : null;
  } catch {
    return null;
  }
}

function readLegacyValue(
  localStorage: Storage,
  providerId: string,
): { model: string; reasoningLevel: ReasoningLevel } | null {
  const providerModel = localStorage.getItem(
    legacyProviderKey(LEGACY_MODEL_KEY, providerId),
  );
  const providerReasoning = localStorage.getItem(
    legacyProviderKey(LEGACY_REASONING_KEY, providerId),
  );
  const ownsUnscoped = localStorage.getItem(LEGACY_PROVIDER_KEY) === providerId;
  const unscopedModel = ownsUnscoped
    ? localStorage.getItem(LEGACY_MODEL_KEY)
    : null;
  const unscopedReasoning = ownsUnscoped
    ? localStorage.getItem(LEGACY_REASONING_KEY)
    : null;
  const model = providerModel ?? unscopedModel;
  const storedReasoning = providerReasoning ?? unscopedReasoning;
  if (model === null && storedReasoning === null) return null;
  const reasoningLevel = storedReasoning === null || storedReasoning === ""
    ? "none"
    : storedReasoning;
  return validModel(model ?? "") && validReasoningLevel(reasoningLevel)
    ? { model: model ?? "", reasoningLevel }
    : null;
}

export function providerPreferenceKey(hostId: string): string {
  return providerKey(normalizeHostId(hostId));
}

export function preferenceKey(hostId: string, providerId: string): string {
  const provider = boundedIdentity(providerId, MAX_PROVIDER_ID) ?? "";
  return executionKey(normalizeHostId(hostId), provider);
}

export function readProviderPreference(hostId: string): string | null {
  const localStorage = storage();
  if (localStorage === null) return null;
  const current = localStorage.getItem(providerKey(normalizeHostId(hostId)));
  if (validProvider(current)) return current;
  const legacy = localStorage.getItem(LEGACY_PROVIDER_KEY);
  return validProvider(legacy) ? legacy : null;
}

export function writeProviderPreference(
  hostId: string,
  providerId: string,
): void {
  const localStorage = storage();
  const provider = boundedIdentity(providerId, MAX_PROVIDER_ID);
  if (localStorage === null || provider === null) return;
  localStorage.setItem(providerKey(normalizeHostId(hostId)), provider);
}

export function readPreference(
  hostId: string,
  providerId?: string,
): Preference | null {
  const localStorage = storage();
  if (localStorage === null) return null;
  const host = normalizeHostId(hostId);
  const explicitProvider =
    providerId === undefined
      ? undefined
      : boundedIdentity(providerId, MAX_PROVIDER_ID);
  if (providerId !== undefined && explicitProvider === null) return null;
  const provider = explicitProvider ?? readProviderPreference(host);
  if (provider === null) return null;
  const value =
    readCurrentValue(localStorage.getItem(executionKey(host, provider))) ??
    readLegacyValue(localStorage, provider);
  return value === null
    ? null
    : { hostId: host, providerId: provider, ...value };
}

export function writePreference(preference: Preference): void {
  const localStorage = storage();
  const provider = boundedIdentity(preference.providerId, MAX_PROVIDER_ID);
  if (
    localStorage === null ||
    provider === null ||
    !validModel(preference.model) ||
    !validReasoningLevel(preference.reasoningLevel)
  ) {
    return;
  }
  const host = normalizeHostId(preference.hostId);
  localStorage.setItem(providerKey(host), provider);
  localStorage.setItem(
    executionKey(host, provider),
    JSON.stringify({
      model: preference.model,
      reasoningLevel: preference.reasoningLevel,
    }),
  );
}

export function clearPreferences(): void {
  const localStorage = storage();
  if (localStorage === null) return;
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const storedKey = localStorage.key(index);
    if (
      storedKey?.startsWith(`${PREFIX}:`) ||
      storedKey?.startsWith(`${PREVIOUS_PREFIX}:`)
    ) {
      localStorage.removeItem(storedKey);
    }
  }
}

export function listPreferences(): SavedSelection[] {
  const localStorage = storage();
  const result = new Map<string, SavedSelection>();
  let examinedRecords = 0;
  if (localStorage === null) return [];
  for (
    let index = 0;
    index < localStorage.length &&
    examinedRecords < MAX_SCANNED_PREFERENCE_RECORDS;
    index += 1
  ) {
    const storedKey = localStorage.key(index);
    if (
      !storedKey?.startsWith(`${PREFIX}:${EXECUTION_RECORD}:`) &&
      !storedKey?.startsWith(`${PREFIX}:${PROVIDER_RECORD}:`)
    ) {
      continue;
    }
    examinedRecords += 1;
    const parts = storedKey.split(":");
    const host = safeDecode(parts[2] ?? "");
    if (
      host === null ||
      (host !== "" && boundedIdentity(host, MAX_HOST_ID) !== host)
    ) {
      continue;
    }
    if (parts[1] === PROVIDER_RECORD) {
      if (parts.length !== 3 || providerKey(host) !== storedKey) continue;
      const provider = localStorage.getItem(storedKey);
      if (!validProvider(provider)) continue;
      const identity = `${host}\u0000${provider}`;
      if (!result.has(identity) && result.size < MAX_LISTED_PREFERENCES) {
        result.set(identity, {
          hostId: host,
          providerId: provider,
          model: null,
          reasoningLevel: null,
        });
      }
      continue;
    }
    if (parts.length !== 4) continue;
    const provider = safeDecode(parts[3]);
    if (
      provider === null ||
      !validProvider(provider) ||
      executionKey(host, provider) !== storedKey
    ) {
      continue;
    }
    const value = readCurrentValue(localStorage.getItem(storedKey));
    if (value === null) continue;
    const identity = `${host}\u0000${provider}`;
    if (result.has(identity) || result.size < MAX_LISTED_PREFERENCES) {
      result.set(identity, { hostId: host, providerId: provider, ...value });
    }
  }
  return [...result.values()];
}
