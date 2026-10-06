import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { hostname } from "node:os";
import { promisify } from "node:util";
import type { Binding } from "./contract.ts";

const exec = promisify(execFile);
const IMAGE = "ghcr.io/steel-dev/steel-browser@sha256:f5cd68fbc2cb27e5d7766269860fd0fb29cbe5fe506245a49c82f85ba210e7da";
export const DEFAULT_DNS_SERVERS = ["1.1.1.1", "8.8.8.8"] as const;
type Runner = (command: string, args: string[]) => Promise<string>;
const run: Runner = async (command, args) => (await exec(command, args, {
  timeout: 120000, maxBuffer: 262144,
})).stdout;

async function portAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

export function viewerOrigin(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.username || url.password
    || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("BB Connect did not return an authenticated HTTPS viewer origin.");
  }
  return url.origin;
}

export async function ensureViewerShare(projectId: string, binding: Binding, dependencies: {
  run?: Runner;
  host?: string;
  verify?: typeof verifyProjectInstance;
} = {}): Promise<void> {
  const command = dependencies.run ?? run;
  const host = dependencies.host ?? hostname();
  const expected = viewerOrigin(binding.viewerUrl);
  const api = new URL(binding.apiUrl);
  if (api.protocol !== "http:" || api.hostname !== "127.0.0.1" || !api.port
    || api.username || api.password || api.pathname !== "/" || api.search || api.hash
    || api.port === new URL(binding.cdpUrl).port) {
    throw new Error("Viewer share requires a dedicated loopback API port distinct from CDP.");
  }
  const shares = JSON.parse(await command("bb", ["connect", "shares", "--host", host, "--json"]));
  const share = shares.shares.find((entry: { port: number }) => entry.port === Number(api.port));
  if (share) {
    if (viewerOrigin(share.url) !== expected) {
      throw new Error("Existing project viewer differs from BB Connect; refusing rebinding.");
    }
    return;
  }
  // A healthy local API does not imply its authenticated viewer is still shared.
  await (dependencies.verify ?? verifyProjectInstance)(projectId, binding);
  const actual = viewerOrigin(await command("bb", ["connect", "expose", api.port, "--host", host]));
  if (actual !== expected) {
    throw new Error("Restored project viewer differs from its saved binding; refusing rebinding.");
  }
}

export async function provisionProjectInstance(projectId: string, dependencies: {
  run?: Runner;
  available?: (port: number) => Promise<boolean>;
  host?: string;
  dns?: readonly string[];
  existing?: Binding | null;
  ready?: (binding: Binding) => Promise<void>;
} = {}): Promise<Binding> {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(projectId)) throw new Error("Invalid project id.");
  const command = dependencies.run ?? run;
  const available = dependencies.available ?? portAvailable;
  const host = dependencies.host ?? hostname();
  const dns = dependencies.dns?.length ? [...dependencies.dns] : [...DEFAULT_DNS_SERVERS];
  if (!dns.every(value => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)
    && value.split(".").every(part => Number(part) <= 255))) {
    throw new Error("DNS servers must be IPv4 addresses.");
  }
  const hash = createHash("sha256").update(projectId).digest("hex");
  const name = `bb-steel-${hash.slice(0, 24)}`;
  const profile = `${name}-profile`;
  // Explicit host selection is essential when the requesting thread is on a different machine.
  const expose = async (port: string) =>
    viewerOrigin(await command("bb", ["connect", "expose", port, "--host", host]));
  const names = await command("docker", ["ps", "-a", "--filter", `name=^/${name}$`, "--format", "{{.Names}}"]);
  let binding: Binding;
  let existingValidated = false;
  let recreated = false;
  let recreate: (() => Promise<void>) | null = null;
  if (names.trim()) {
    const [instance] = JSON.parse(await command("docker", ["inspect", name]));
    const ports = instance.HostConfig.PortBindings;
    const port = (key: string) => {
      const entries = ports?.[key];
      if (entries?.length !== 1 || entries[0].HostIp !== "127.0.0.1"
        || !/^\d+$/.test(entries[0].HostPort)) throw new Error("Existing project container has unsafe ports.");
      return entries[0].HostPort as string;
    };
    const apiPort = port("3000/tcp");
    const cdpPort = port("9223/tcp");
    const domain = instance.Config.Env?.find((entry: string) => entry.startsWith("DOMAIN="))?.slice(7);
    if (instance.Config.Labels?.["bb.steel.project"] !== projectId || apiPort === cdpPort
      || instance.Config.Image !== IMAGE || !domain
      || !instance.Config.Env.includes("CHROME_USER_DATA_DIR=/profiles/chrome")
      || !instance.Config.Env.includes("USE_SSL=true")
      || !instance.Mounts.some((m: { Type: string; Name: string; Destination: string }) =>
        m.Type === "volume" && m.Name === profile && m.Destination === "/profiles")) {
      throw new Error("Existing project container does not match its dedicated profile; refusing replacement.");
    }
    existingValidated = true;
    const expected = viewerOrigin(`https://${domain}`);
    const actual = await expose(apiPort);
    if (actual !== expected) throw new Error("Existing project viewer differs from BB Connect; refusing rebinding.");
    binding = { apiUrl: `http://127.0.0.1:${apiPort}`, cdpUrl: `http://127.0.0.1:${cdpPort}`, viewerUrl: actual };
    if (dependencies.existing && (Object.keys(binding) as (keyof Binding)[]).some(
      key => binding[key] !== dependencies.existing![key],
    )) throw new Error("Existing project container differs from its saved binding; refusing repair.");
    recreate = async () => {
      const users = (await command("docker", ["ps", "--filter", `volume=${profile}`, "--format", "{{.Names}}"]))
        .trim().split("\n").filter(Boolean);
      if (users.some(user => user !== name)) throw new Error("Project profile is used by another running container; refusing repair.");
      await command("docker", ["stop", name]);
      await command("docker", ["rm", "-f", name]);
      await command("docker", ["run", "--rm", "--entrypoint", "sh", "-v", `${profile}:/profiles`, IMAGE,
        "-lc", "rm -f /profiles/chrome/SingletonLock /profiles/chrome/SingletonCookie /profiles/chrome/SingletonSocket"]);
      await command("docker", dockerRunArgs(name, projectId, apiPort, cdpPort, domain, dns));
      recreated = true;
    };
    const configuredDns = instance.HostConfig.Dns ?? [];
    if (!dns.every(server => configuredDns.includes(server)) || configuredDns.length !== dns.length) {
      await recreate();
    } else if (!instance.State.Running) await command("docker", ["start", name]);
  } else {
    if (dependencies.existing) {
      throw new Error("The bound project container is missing; refusing to replace its saved endpoints or profile automatically.");
    }
    const used = new Set<number>();
    const shares = JSON.parse(await command("bb", ["connect", "shares", "--host", host, "--json"]));
    for (const share of shares.shares) used.add(share.port);
    const containers = (await command("docker", ["ps", "-a", "--format", "{{json .ID}}"]))
      .trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as string);
    if (containers.length) {
      const portMaps = (await command("docker", ["inspect", "--format", "{{json .HostConfig.PortBindings}}", ...containers]))
        .trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
      for (const ports of portMaps) {
        for (const entries of Object.values(ports ?? {})) {
          for (const entry of (entries as { HostPort: string }[] | null) ?? []) used.add(Number(entry.HostPort));
        }
      }
    }
    const start = 20000 + (parseInt(hash.slice(0, 8), 16) % 10000) * 2;
    let apiPort = 0;
    for (let offset = 0; offset < 200; offset += 2) {
      const candidate = start + offset;
      if (!used.has(candidate) && !used.has(candidate + 1)
        && await available(candidate) && await available(candidate + 1)) {
        apiPort = candidate;
        break;
      }
    }
    if (!apiPort) throw new Error("No free project browser ports; no existing browser was changed.");
    const origin = await expose(String(apiPort));
    binding = { apiUrl: `http://127.0.0.1:${apiPort}`, cdpUrl: `http://127.0.0.1:${apiPort + 1}`, viewerUrl: origin };
    // Docker owns the final port reservation. A race fails closed; never remove or replace a profile.
    await command("docker", dockerRunArgs(name, projectId, apiPort, apiPort + 1, new URL(origin).host, dns));
  }
  const ready = dependencies.ready ?? waitForBrowser;
  try {
    await ready(binding);
  } catch (error) {
    if (!existingValidated || recreated || !recreate) throw error;
    await recreate();
    await ready(binding);
  }
  return binding;
}

function dockerRunArgs(name: string, projectId: string, apiPort: number | string, cdpPort: number | string, domain: string, dns: readonly string[]): string[] {
  return ["run", "-d", "--init", "--restart", "unless-stopped", "--shm-size", "1g",
    "--name", name, "--label", `bb.steel.project=${projectId}`,
    ...dns.flatMap(server => ["--dns", server]),
    "-p", `127.0.0.1:${apiPort}:3000`, "-p", `127.0.0.1:${cdpPort}:9223`,
    "-e", `DOMAIN=${domain}`, "-e", "USE_SSL=true",
    "-e", "CHROME_USER_DATA_DIR=/profiles/chrome", "-v", `${name}-profile:/profiles`, IMAGE];
}

export async function bindingReady(binding: Binding, request: typeof fetch = fetch): Promise<boolean> {
  try {
    const [health, cdp] = await Promise.all([
      request(`${binding.apiUrl}/v1/health`, { signal: AbortSignal.timeout(900) })
        .then(async response => response.ok && (await response.json()).status === "ok"),
      request(`${binding.cdpUrl}/json/version`, { signal: AbortSignal.timeout(900) })
        .then(async response => response.ok && typeof (await response.json()).webSocketDebuggerUrl === "string"),
    ]);
    return health && cdp;
  } catch {
    return false;
  }
}

async function waitForBrowser(binding: Binding): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${binding.cdpUrl}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (response.ok && typeof (await response.json()).webSocketDebuggerUrl === "string") {
        const health = await fetch(`${binding.apiUrl}/v1/health`, { signal: AbortSignal.timeout(1500) });
        if (health.ok && (await health.json()).status === "ok") return;
      }
    } catch { /* Chromium is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Steel was provisioned but Chromium is not ready. Retry `bb steel-browser project` to resume setup.");
}
export async function verifyProjectInstance(projectId: string, binding: Binding): Promise<void> {
  const hash = createHash("sha256").update(projectId).digest("hex").slice(0, 24);
  const name = `bb-steel-${hash}`;
  try {
    const { stdout } = await exec("docker", ["inspect", name], { timeout: 8000, maxBuffer: 65536 });
    const [instance] = JSON.parse(stdout);
    const ports = instance.NetworkSettings.Ports;
    const apiPort = new URL(binding.apiUrl).port;
    const cdpPort = new URL(binding.cdpUrl).port;
    const matchesPort = (key: string, port: string) => ports[key]?.length === 1
      && ports[key][0].HostIp === "127.0.0.1" && ports[key][0].HostPort === port;
    if (instance.Config.Labels["bb.steel.project"] !== projectId
      || !instance.State.Running
      || !matchesPort("3000/tcp", apiPort) || !matchesPort("9223/tcp", cdpPort)
      || !instance.Config.Env.includes("CHROME_USER_DATA_DIR=/profiles/chrome")
      || !instance.Config.Env.includes(`DOMAIN=${new URL(binding.viewerUrl).host}`)
      || !instance.Mounts.some((mount: { Type: string; Name: string; Destination: string }) =>
        mount.Type === "volume" && mount.Name === `${name}-profile` && mount.Destination === "/profiles")) {
      throw new Error("Mismatch");
    }
  } catch {
    throw new Error("Binding refused: no matching running project container with dedicated profile and loopback ports.");
  }
}
