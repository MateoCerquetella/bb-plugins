export interface ImprovementRandomApi {
  randomUUID?: (() => string) | undefined;
  getRandomValues?: ((array: Uint8Array) => Uint8Array) | undefined;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * `crypto.randomUUID` is unavailable in insecure webviews. The local helper
 * needs only a unique request key, so a v4 UUID built from `getRandomValues`
 * (available in insecure contexts) is sufficient.
 */
export function createImprovementRequestId(
  api: ImprovementRandomApi | null = typeof globalThis.crypto === 'undefined' ? null : globalThis.crypto
): string {
  if (typeof api?.randomUUID === 'function') {
    try {
      const value = api.randomUUID.call(api);
      if (uuid.test(value)) return value;
    } catch {
      // Fall through to getRandomValues.
    }
  }
  const bytes = new Uint8Array(16);
  if (typeof api?.getRandomValues === 'function') {
    api.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
