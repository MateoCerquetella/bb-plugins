import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract, scopeSchema, type CreateOptions, type Scope, type EnginePolicy } from "./contract.ts";
import { normalizeBaseUrl, SteelClient, SteelClientError } from "./steel-client.ts";
import { ProjectBrowsers } from "./projects.ts";
import { runBrowser } from "./engines.ts";
import { verifyProjectInstance } from "./provisioning.ts";

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
  const projects = new ProjectBrowsers(bb.storage.kv);
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
    jevCheckout: {
      type: "string",
      label: "jev-ultrafast checkout",
      description: "Absolute checkout path on the Steel host, with uv sync completed. Paid runs require --allow-paid.",
      default: "",
    },
    jevEnvFile: {
      type: "string",
      label: "jev-ultrafast credentials file",
      description: "Private (0600) host dotenv file containing TYPESAFE_API_KEY and TEXT_MODEL_API_KEY. Enter a path, never a key.",
      default: "",
    },
    jevTextModel: {
      type: "string",
      label: "jev-ultrafast text model",
      description: "Model identifier for the text helper. Live Jev runs require potentially billable external API calls.",
      default: "inception/mercury-2.5",
    },
  });

  async function resolve(input: Scope) {
    const scope = scopeSchema.parse(input);
    const projectId = scope.threadId
      ? (await bb.sdk.threads.get({ threadId: scope.threadId })).projectId
      : scope.projectId!;
    if (scope.projectId && scope.projectId !== projectId) throw new Error("Thread and project do not match.");
    const project = await bb.sdk.projects.get({ projectId });
    return { projectId, projectName: project.name };
  }

  async function client(scope: Scope): Promise<SteelClient> {
    const { projectId } = await resolve(scope);
    return new SteelClient((await projects.require(projectId)).apiUrl);
  }

  let mutating = false;
  async function mutate<T>(operation: () => Promise<T>): Promise<T> {
    if (mutating) throw new SteelClientError("A session operation is already in progress.");
    mutating = true;
    try { return await operation(); }
    finally { mutating = false; }
  }

  const handlers = {
    async project(scope: Scope) {
      const project = await resolve(scope);
      return { ...project, binding: await projects.binding(project.projectId), policy: await projects.policy(project.projectId) };
    },
    async setEngine({ scope, policy }: { scope: Scope; policy: EnginePolicy }) {
      const { projectId } = await resolve(scope);
      await projects.setPolicy(projectId, policy);
      return handlers.project(scope);
    },
    async dashboard(scope: Scope) {
      try {
        const { projectId } = await resolve(scope);
        const binding = await projects.require(projectId);
        const result = await new SteelClient(binding.apiUrl).dashboard();
        const base = normalizeBaseUrl(binding.viewerUrl).toString();
        result.uiUrl = new URL("ui", base).toString();
        result.docsUrl = new URL("documentation/", base).toString();
        return result;
      } catch (error) {
        if (error instanceof SteelClientError) throw error;
        throw new SteelClientError(message(error));
      }
    },
    async createSession({ scope, options }: { scope: Scope; options: CreateOptions }) {
      return mutate(async () => (await client(scope)).createSession(options));
    },
    async releaseSession({ scope, sessionId }: { scope: Scope; sessionId: string }) {
      return mutate(async () => (await client(scope)).releaseSession(sessionId));
    },
  };

  bb.rpc.register(rpcContract, handlers);

  const usage = [
    "bb steel-browser status",
    "bb steel-browser sessions",
    "bb steel-browser create",
    "bb steel-browser release <session-id>",
    "bb steel-browser project",
    "bb steel-browser bind <api-url> <cdp-url> <viewer-origin>",
    "bb steel-browser engine <playwright|jev|auto> <fallback-on|fallback-off>",
    "bb steel-browser run <url> [goal] [--allow-paid]",
  ].join("\n");

  bb.cli.register({
    name: "steel-browser",
    summary: "Inspect and manage self-hosted Steel browser sessions",
    commands: [
      { name: "status", summary: "Print Steel connection status", usage: "bb steel-browser status" },
      { name: "sessions", summary: "List active Steel sessions", usage: "bb steel-browser sessions" },
      { name: "create", summary: "Create a browser session", usage: "bb steel-browser create" },
      { name: "release", summary: "Release one exact browser session", usage: "bb steel-browser release <session-id>" },
      { name: "project", summary: "Show this project's browser and engine policy", usage: "bb steel-browser project" },
      { name: "bind", summary: "Assign a dedicated browser to this project", usage: "bb steel-browser bind <api-url> <cdp-url> <viewer-origin>" },
      { name: "engine", summary: "Set project engine and fallback policy", usage: "bb steel-browser engine <playwright|jev|auto> <fallback-on|fallback-off>" },
      { name: "run", summary: "Execute or hand off a project browser task", usage: "bb steel-browser run <url> [goal] [--allow-paid]" },
    ],
    async run(argv, context) {
      const [command, ...args] = argv;
      try {
        const scope = scopeSchema.parse(context.threadId ? { threadId: context.threadId } : { projectId: context.projectId });
        if (command === "run") {
          const allowPaid = args.at(-1) === "--allow-paid";
          const inputs = allowPaid ? args.slice(0, -1) : args;
          if (inputs.length < 1 || inputs.length > 2 || (inputs[1]?.length ?? 0) > 8000) {
            return { exitCode: 1, stderr: usage };
          }
          const { projectId } = await resolve(scope);
          const binding = await projects.require(projectId);
          const policy = await projects.policy(projectId);
          const config = await settings.get();
          const result = await mutate(() => runBrowser(binding, policy, config, {
            url: inputs[0]!, goal: inputs[1], allowPaid,
          }, context.signal));
          return { exitCode: 0, stdout: JSON.stringify(result, null, 2) };
        }
        if (command === "project" && args.length === 0) {
          return { exitCode: 0, stdout: JSON.stringify(await handlers.project(scope), null, 2) };
        }
        if (command === "bind" && args.length === 3) {
          const { projectId } = await resolve(scope);
          const binding = { apiUrl: args[0]!, cdpUrl: args[1]!, viewerUrl: args[2]! };
          await verifyProjectInstance(projectId, binding);
          await projects.bind(projectId, binding);
          return { exitCode: 0, stdout: JSON.stringify(await handlers.project(scope), null, 2) };
        }
        if (command === "engine" && args.length === 2 && ["playwright", "jev", "auto"].includes(args[0]!)
          && ["fallback-on", "fallback-off"].includes(args[1]!)) {
          const policy: EnginePolicy = { engine: args[0] as EnginePolicy["engine"], fallback: args[1] === "fallback-on" };
          return { exitCode: 0, stdout: JSON.stringify(await handlers.setEngine({ scope, policy }), null, 2) };
        }
        if (command === "status" && args.length === 0) {
          const value = await handlers.dashboard(scope);
          return {
            exitCode: value.connected ? 0 : 1,
            stdout: JSON.stringify(value, null, 2),
          };
        }
        if (command === "sessions" && args.length === 0) {
          const value = await handlers.dashboard(scope);
          return {
            exitCode: value.connected ? 0 : 1,
            stdout: JSON.stringify(value.sessions, null, 2),
          };
        }
        if (command === "create" && args.length === 0) {
          return {
            exitCode: 0,
            stdout: JSON.stringify(await handlers.createSession({ scope, options: DEFAULT_OPTIONS }), null, 2),
          };
        }
        if (command === "release" && args.length === 1) {
          return {
            exitCode: 0,
            stdout: JSON.stringify(await handlers.releaseSession({ scope, sessionId: args[0]! }), null, 2),
          };
        }
        return { exitCode: 1, stderr: usage };
      } catch (error) {
        return { exitCode: 1, stderr: message(error) };
      }
    },
  });
}
