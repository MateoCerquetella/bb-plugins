const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_UINT64 = (1n << 64n) - 1n;

export interface NetworkInterfaceCounters {
  readonly receivedBytes: bigint;
  readonly sentBytes: bigint;
}

export type NetworkCounterSnapshot = ReadonlyMap<
  string,
  NetworkInterfaceCounters
>;

export interface NetworkThroughput {
  readonly receiveBytesPerSecond: number;
  readonly sendBytesPerSecond: number;
}

export interface NetworkThroughputSample extends NetworkThroughput {
  readonly partial: boolean;
}

/** Keep only explicitly selected address-owning interfaces. */
export function selectNetworkCounters(
  counters: NetworkCounterSnapshot,
  selectedInterfaceNames: ReadonlySet<string>,
): NetworkCounterSnapshot {
  const selected = new Map<string, NetworkInterfaceCounters>();
  for (const [name, value] of counters) {
    if (selectedInterfaceNames.has(name)) selected.set(name, value);
  }
  return selected;
}

function counter(value: string, label: string): bigint {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${label} is not an unsigned integer.`);
  }
  const parsed = BigInt(value);
  if (parsed > MAX_UINT64) {
    throw new Error(`${label} exceeds the unsigned 64-bit range.`);
  }
  return parsed;
}

function normalizedInterfaceName(value: string): string {
  const name = value.trim();
  const hasControlCharacter = Array.from(name).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (
    name.length === 0 ||
    name.length > 256 ||
    hasControlCharacter
  ) {
    throw new Error("Network statistics contain an invalid interface name.");
  }
  return name;
}

function isLoopbackInterface(
  name: string,
  knownLoopbackNames: ReadonlySet<string>,
): boolean {
  return (
    knownLoopbackNames.has(name) ||
    /^lo\d*$/iu.test(name) ||
    /^loopback(?:$|[\s_-])/iu.test(name)
  );
}

/** Parse Linux kernel counters without exposing interface metadata downstream. */
export function parseLinuxNetworkCounters(
  text: string,
  knownLoopbackNames: ReadonlySet<string> = new Set(),
): NetworkCounterSnapshot {
  if (!/^\s*Inter-\|/mu.test(text)) {
    throw new Error("/proc/net/dev is missing its interface header.");
  }

  const parsed = new Map<string, NetworkInterfaceCounters>();
  let dataRows = 0;
  for (const line of text.split(/\r?\n/u)) {
    const separator = line.lastIndexOf(":");
    if (separator < 0) continue;
    dataRows += 1;
    const name = normalizedInterfaceName(line.slice(0, separator));
    const fields = line.slice(separator + 1).trim().split(/\s+/u);
    if (fields.length < 16) {
      throw new Error("/proc/net/dev contains an incomplete counter row.");
    }
    if (parsed.has(name)) {
      throw new Error("/proc/net/dev repeats an interface counter row.");
    }
    if (isLoopbackInterface(name, knownLoopbackNames)) continue;
    parsed.set(name, {
      receivedBytes: counter(fields[0]!, "Linux received-byte counter"),
      sentBytes: counter(fields[8]!, "Linux sent-byte counter"),
    });
  }

  if (dataRows === 0) {
    throw new Error("/proc/net/dev contains no interface counter rows.");
  }
  return parsed;
}

/**
 * Parse `netstat -ibn` output. macOS repeats one interface's totals for each
 * configured address, so the highest counter pair is retained per interface.
 */
export function parseMacNetworkCounters(
  text: string,
  knownLoopbackNames: ReadonlySet<string> = new Set(),
): NetworkCounterSnapshot {
  const lines = text.split(/\r?\n/u);
  const headerIndex = lines.findIndex((line) => {
    const fields = line.trim().split(/\s+/u);
    return (
      fields.some((field) => field.toLowerCase() === "name") &&
      fields.some((field) => field.toLowerCase() === "ibytes") &&
      fields.some((field) => field.toLowerCase() === "obytes")
    );
  });
  if (headerIndex < 0) {
    throw new Error("macOS netstat output is missing its counter header.");
  }

  const header = lines[headerIndex]!.trim().split(/\s+/u);
  const nameIndex = header.findIndex((field) => field.toLowerCase() === "name");
  const receivedIndex = header.findIndex(
    (field) => field.toLowerCase() === "ibytes",
  );
  const sentIndex = header.findIndex(
    (field) => field.toLowerCase() === "obytes",
  );
  const requiredIndex = Math.max(nameIndex, receivedIndex, sentIndex);
  const parsed = new Map<string, NetworkInterfaceCounters>();
  let counterRows = 0;

  for (const line of lines.slice(headerIndex + 1)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const fields = trimmed.split(/\s+/u);
    if (fields.length <= requiredIndex) continue;
    const receivedText = fields[receivedIndex]!;
    const sentText = fields[sentIndex]!;
    if (!/^\d+$/u.test(receivedText) || !/^\d+$/u.test(sentText)) continue;
    counterRows += 1;
    const name = normalizedInterfaceName(fields[nameIndex]!.replace(/\*$/u, ""));
    if (isLoopbackInterface(name, knownLoopbackNames)) continue;
    const next = {
      receivedBytes: counter(receivedText, "macOS received-byte counter"),
      sentBytes: counter(sentText, "macOS sent-byte counter"),
    };
    const previous = parsed.get(name);
    parsed.set(
      name,
      previous === undefined
        ? next
        : {
            receivedBytes:
              next.receivedBytes > previous.receivedBytes
                ? next.receivedBytes
                : previous.receivedBytes,
            sentBytes:
              next.sentBytes > previous.sentBytes
                ? next.sentBytes
                : previous.sentBytes,
          },
    );
  }

  if (counterRows === 0) {
    throw new Error("macOS netstat output contains no usable counter rows.");
  }
  return parsed;
}

interface WindowsCounterJson {
  readonly id: unknown;
  readonly receivedBytes: unknown;
  readonly sentBytes: unknown;
}

function windowsRows(value: unknown): readonly WindowsCounterJson[] {
  if (value === null) return [];
  const rows = Array.isArray(value) ? value : [value];
  if (
    rows.some(
      (row) => row === null || typeof row !== "object" || Array.isArray(row),
    )
  ) {
    throw new Error("Windows network statistics are not an object array.");
  }
  return rows as WindowsCounterJson[];
}

/** Parse the bounded JSON emitted by the built-in Windows network cmdlets. */
export function parseWindowsNetworkCounters(
  text: string,
  knownLoopbackNames: ReadonlySet<string> = new Set(),
): NetworkCounterSnapshot {
  const trimmed = text.replace(/^\uFEFF/u, "").trim();
  if (trimmed.length === 0) return new Map();

  let value: unknown;
  try {
    value = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error("Windows network statistics are not valid JSON.");
  }

  const parsed = new Map<string, NetworkInterfaceCounters>();
  for (const row of windowsRows(value)) {
    if (
      typeof row.id !== "string" ||
      typeof row.receivedBytes !== "string" ||
      typeof row.sentBytes !== "string"
    ) {
      throw new Error("Windows network statistics contain an invalid row.");
    }
    const name = normalizedInterfaceName(row.id).toLowerCase();
    if (isLoopbackInterface(name, knownLoopbackNames)) continue;
    if (parsed.has(name)) {
      throw new Error("Windows network statistics repeat an interface row.");
    }
    parsed.set(name, {
      receivedBytes: counter(
        row.receivedBytes,
        "Windows received-byte counter",
      ),
      sentBytes: counter(row.sentBytes, "Windows sent-byte counter"),
    });
  }
  return parsed;
}

function rateFromDelta(deltaBytes: bigint, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new RangeError("Network sample duration must be positive and finite.");
  }
  const durationMicroseconds = BigInt(
    Math.max(1, Math.round(durationMs * 1_000)),
  );
  const bytesPerSecond =
    (deltaBytes * 1_000_000n + durationMicroseconds / 2n) /
    durationMicroseconds;
  if (bytesPerSecond > MAX_SAFE_BIGINT) {
    throw new RangeError("Network throughput exceeds the JSON-safe range.");
  }
  return Number(bytesPerSecond);
}

/**
 * Calculate current throughput from monotonic per-interface byte counters.
 * Only interfaces present in both snapshots contribute, so newly appearing
 * interfaces never inject their lifetime totals into the current rate.
 */
export function calculateNetworkThroughput(
  before: NetworkCounterSnapshot,
  after: NetworkCounterSnapshot,
  durationMs: number,
): NetworkThroughputSample {
  if (before.size === 0 || after.size === 0) {
    throw new Error("No eligible network interface counters are available.");
  }
  let matchedInterfaces = 0;
  let receivedDelta = 0n;
  let sentDelta = 0n;
  let partial = before.size !== after.size;

  for (const [name, first] of before) {
    const second = after.get(name);
    if (second === undefined) {
      partial = true;
      continue;
    }
    if (
      second.receivedBytes < first.receivedBytes ||
      second.sentBytes < first.sentBytes
    ) {
      partial = true;
      continue;
    }
    matchedInterfaces += 1;
    receivedDelta += second.receivedBytes - first.receivedBytes;
    sentDelta += second.sentBytes - first.sentBytes;
  }

  if (matchedInterfaces === 0) {
    throw new Error("Network interfaces changed during sampling.");
  }

  return {
    receiveBytesPerSecond: rateFromDelta(receivedDelta, durationMs),
    sendBytesPerSecond: rateFromDelta(sentDelta, durationMs),
    partial,
  };
}
