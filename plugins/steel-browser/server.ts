import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract, type CreateOptions } from "./contract.ts";
import { normalizeBaseUrl, SteelClient, SteelClientError } from "./steel-client.ts";

const DEFAULT_ENDPOINT = "http://127.0.0.1:3100";
const DEFAULT_OPTIONS: CreateOptions = {
  blockAds: true,
  width: 1440,
  height: 900,
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function steelBrowserPlugin(bb: BbPluginApi): void {
  const settings = bb.settings.define({
    viewerBaseUrl: {
      type: "string",
      label: "Browser-accessible Steel URL",
      description: "Optional authenticated BB Connect URL for UI and documentation links.",
      default: "",
    },
    baseUrl: {
      type: "string",
      label: "Steel endpoint",
      description: "HTTP(S) endpoint for the self-hosted Steel Browser API.",
      default: DEFAULT_ENDPOINT,
    },
  });

  async function client(): Promise<SteelClient> {
    const current = await settings.get();
    return new SteelClient(current.baseUrl);
  }

  let mutating = false;
  async function mutate<T>(operation: () => Promise<T>): Promise<T> {
    if (mutating) throw new SteelClientError("A session operation is already in progress.");
    mutating = true;
    try { return await operation(); }
    finally { mutating = false; }
  }

  const handlers = {
    async dashboard() {
      try {
        const result = await (await client()).dashboard();
        const { viewerBaseUrl } = await settings.get();
        if (viewerBaseUrl.trim()) {
          const base = normalizeBaseUrl(viewerBaseUrl).toString().replace(/\/?$/u, "/");
          result.uiUrl = new URL("ui", base).toString();
          result.docsUrl = new URL("documentation/", base).toString();
        }
        return result;
      } catch (error) {
        if (error instanceof SteelClientError) throw error;
        throw new SteelClientError(message(error));
      }
    },
    async createSession(options: CreateOptions) {
      return mutate(async () => (await client()).createSession(options));
    },
    async releaseSession({ sessionId }: { sessionId: string }) {
      return mutate(async () => (await client()).releaseSession(sessionId));
    },
  };

  bb.rpc.register(rpcContract, handlers);

  const usage = [
    "bb steel-browser status",
    "bb steel-browser sessions",
    "bb steel-browser create",
    "bb steel-browser release <session-id>",
  ].join("\n");

  bb.cli.register({
    name: "steel-browser",
    summary: "Inspect and manage self-hosted Steel browser sessions",
    commands: [
      { name: "status", summary: "Print Steel connection status", usage: "bb steel-browser status" },
      { name: "sessions", summary: "List active Steel sessions", usage: "bb steel-browser sessions" },
      { name: "create", summary: "Create a browser session", usage: "bb steel-browser create" },
      { name: "release", summary: "Release one exact browser session", usage: "bb steel-browser release <session-id>" },
    ],
    async run(argv) {
      const [command, ...args] = argv;
      try {
        if (command === "status" && args.length === 0) {
          const value = await handlers.dashboard();
          return {
            exitCode: value.connected ? 0 : 1,
            stdout: JSON.stringify(value, null, 2),
          };
        }
        if (command === "sessions" && args.length === 0) {
          const value = await handlers.dashboard();
          return {
            exitCode: value.connected ? 0 : 1,
            stdout: JSON.stringify(value.sessions, null, 2),
          };
        }
        if (command === "create" && args.length === 0) {
          return {
            exitCode: 0,
            stdout: JSON.stringify(await handlers.createSession(DEFAULT_OPTIONS), null, 2),
          };
        }
        if (command === "release" && args.length === 1) {
          return {
            exitCode: 0,
            stdout: JSON.stringify(await handlers.releaseSession({ sessionId: args[0]! }), null, 2),
          };
        }
        return { exitCode: 1, stderr: usage };
      } catch (error) {
        return { exitCode: 1, stderr: message(error) };
      }
    },
  });
}
