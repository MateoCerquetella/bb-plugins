import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract, scopeSchema, type CreateOptions, type Scope, type EnginePolicy, type ServiceId } from "./contract.ts";
import { normalizeBaseUrl, SteelClient, SteelClientError } from "./steel-client.ts";
import { ProjectBrowsers } from "./projects.ts";
import { runBrowser } from "./engines.ts";
import { bindingReady, ensureViewerShare, provisionProjectInstance, verifyProjectInstance } from "./provisioning.ts";
import { actOnProject, parseBrowserAction } from "./actions.ts";
import { SignIns } from "./sign-ins.ts";
import { DashboardCache } from "./dashboard-cache.ts";
import type { Dashboard } from "./contract.ts";

const DEFAULT_OPTIONS: CreateOptions = {
  blockAds: true,
  width: 1440,
  height: 900,
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function steelBrowserPlugin(bb: BbPluginApi): void {
  bb.agents.contributeInstructions(() => [
    "Steel Browser is installed in this BB environment and is available through the terminal CLI, even without a browser-specific tool in your tool list.",
    "For any browser task (including AWS Console, website sign-in, screenshots, scraping, or navigation between web apps), read the steel-browser skill and first run `bb steel-browser project` in the current thread.",
    "Never claim Steel is unavailable merely because no dedicated browser tool is exposed. Check the CLI result and report the exact binding or connection error.",
    "The `bb steel-browser project` command automatically provisions and binds a dedicated Steel browser if missing. Run it and continue, instead of stopping at 'no binding'. Use `bb steel-browser run <url>` or Playwright attached to the returned project CDP endpoint. Do not launch a separate browser or use another project's binding or cookies.",
    "Before visible browser work, emit ::steel-browser{} on its own line in this thread. Keep navigation in that same Steel session so the user can watch. Never open Safari, local Chrome, an external window, or an external viewer link.",
    "Let the user enter website credentials and MFA directly into the embedded browser, never chat. If viewer authentication is blocked, report it without an external-browser fallback.",
    "Do not use --allow-paid without explicit permission. Inspect and verify results; an agent-handoff response is not task completion.",
    "If the project CDP loopback is on another host, use bb steel-browser tabs/inspect/click/fill/press/screenshot. Routed actions default to the newest tab; use --tab <index> to target an older one. Do not enter credentials in CLI arguments.",
  ].join("\n"));
  const projects = new ProjectBrowsers(bb.storage.kv);
  const signIns = new SignIns(bb.storage.kv);
  const dashboards = new DashboardCache<Dashboard>();
  const settings = bb.settings.define({
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
    dnsServers: {
      type: "string",
      label: "Steel container DNS servers",
      description: "Comma-separated IPv4 resolvers used for new or repaired project containers. Changes apply on the next provision or repair.",
      default: "1.1.1.1,8.8.8.8",
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

  async function client(scope: Scope, ensure = false): Promise<SteelClient> {
    const { projectId } = await resolve(scope);
    const binding = ensure ? await ensureBinding(projectId) : await projects.require(projectId);
    return new SteelClient(binding.apiUrl);
  }

  async function ensureBinding(projectId: string) {
    return projects.ensure(projectId, async (id, existing) => {
      const config = await settings.get();
      const dns = String(config.dnsServers || "1.1.1.1,8.8.8.8").split(",").map(value => value.trim()).filter(Boolean);
      const binding = await provisionProjectInstance(id, { dns, existing });
      await verifyProjectInstance(id, binding);
      return binding;
    }, async binding => {
      if (!await bindingReady(binding)) return false;
      await ensureViewerShare(projectId, binding);
      return true;
    });
  }

  let mutating = false;
  async function mutate<T>(operation: () => Promise<T>): Promise<T> {
    if (mutating) throw new SteelClientError("A session operation is already in progress.");
    mutating = true;
    try { return await operation(); }
    finally { mutating = false; }
  }

  const handlers = {
    async signIns(scope: Scope) {
      return signIns.list((await resolve(scope)).projectId);
    },
    async confirmSignIn({ scope, service, label }: { scope: Scope; service: ServiceId; label: string }) {
      return signIns.confirm((await resolve(scope)).projectId, service, label);
    },
    async forgetSignIn({ scope, service }: { scope: Scope; service: ServiceId }) {
      return signIns.forget((await resolve(scope)).projectId, service);
    },
    async openSignIn({ scope, service }: { scope: Scope; service: ServiceId }) {
      const { projectId } = await resolve(scope);
      const binding = await ensureBinding(projectId);
      await mutate(() => actOnProject(binding, { kind: "openSignIn", service }));
      return { opened: true };
    },
    async allProjects() {
      const available = await bb.sdk.projects.list({ includePersonal: true });
      return Promise.all(available.map(async project => {
        const binding = await projects.binding(project.id);
        if (!binding) return { projectId: project.id, projectName: project.name, configured: false, connected: false, activeSessions: 0 };
        try {
          const dashboard = await new SteelClient(binding.apiUrl).dashboard();
          return {
            projectId: project.id,
            projectName: project.name,
            configured: true,
            connected: dashboard.connected,
            activeSessions: dashboard.sessions.filter(session => ["idle", "live"].includes(session.status)).length,
          };
        } catch {
          return { projectId: project.id, projectName: project.name, configured: true, connected: false, activeSessions: 0 };
        }
      }));
    },
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
        return await dashboards.read(projectId, async () => {
        const binding = await ensureBinding(projectId);
        const result = await new SteelClient(binding.apiUrl).dashboard();
        const base = normalizeBaseUrl(binding.viewerUrl).toString();
        result.uiUrl = new URL("ui", base).toString();
        result.docsUrl = new URL("documentation/", base).toString();
        return result;
        });
      } catch (error) {
        if (error instanceof SteelClientError) throw error;
        throw new SteelClientError(message(error));
      }
    },
    async createSession({ scope, options }: { scope: Scope; options: CreateOptions }) {
      const { projectId } = await resolve(scope);
      try { return await mutate(async () => (await client(scope, true)).createSession(options)); }
      finally { dashboards.invalidate(projectId); }
    },
    async releaseSession({ scope, sessionId }: { scope: Scope; sessionId: string }) {
      const { projectId } = await resolve(scope);
      try { return await mutate(async () => (await client(scope)).releaseSession(sessionId)); }
      finally { dashboards.invalidate(projectId); }
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
    "bb steel-browser tabs",
    "bb steel-browser inspect",
    "bb steel-browser click <role> <exact-name>",
    "bb steel-browser fill <role> <exact-name> <value>",
    "bb steel-browser press <key>",
    "bb steel-browser screenshot",
  ].join("\n");

  bb.cli.register({
    name: "steel-browser",
    summary: "Inspect and manage self-hosted Steel browser sessions",
    commands: [
      { name: "status", summary: "Print Steel connection status", usage: "bb steel-browser status" },
      { name: "sessions", summary: "List active Steel sessions", usage: "bb steel-browser sessions" },
      { name: "create", summary: "Create a browser session", usage: "bb steel-browser create" },
      { name: "release", summary: "Release one exact browser session", usage: "bb steel-browser release <session-id>" },
      { name: "project", summary: "Ensure this project's isolated browser and show its engine policy", usage: "bb steel-browser project" },
      { name: "bind", summary: "Assign a dedicated browser to this project", usage: "bb steel-browser bind <api-url> <cdp-url> <viewer-origin>" },
      { name: "engine", summary: "Set project engine and fallback policy", usage: "bb steel-browser engine <playwright|jev|auto> <fallback-on|fallback-off>" },
      { name: "run", summary: "Execute or hand off a project browser task", usage: "bb steel-browser run <url> [goal] [--allow-paid]" },
      { name: "tabs", summary: "List open project tabs by index", usage: "bb steel-browser tabs" },
      { name: "inspect", summary: "Read the current page's accessibility tree", usage: "bb steel-browser inspect" },
      { name: "click", summary: "Click one exactly named accessible element", usage: "bb steel-browser click <role> <exact-name>" },
      { name: "fill", summary: "Fill one exactly named accessible field", usage: "bb steel-browser fill <role> <exact-name> <value>" },
      { name: "press", summary: "Press a key in the active page", usage: "bb steel-browser press <key>" },
      { name: "screenshot", summary: "Return a base64 PNG of the active page", usage: "bb steel-browser screenshot" },
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
          const binding = await ensureBinding(projectId);
          const policy = await projects.policy(projectId);
          const config = await settings.get();
          const result = await mutate(() => runBrowser(binding, policy, config, {
            url: inputs[0]!, goal: inputs[1], allowPaid,
          }, context.signal));
          return { exitCode: 0, stdout: JSON.stringify(result, null, 2) };
        }
        if (["tabs", "inspect", "click", "fill", "press", "screenshot"].includes(command)) {
          const action = parseBrowserAction(command, args);
          const { projectId } = await resolve(scope);
          const binding = await ensureBinding(projectId);
          const result = await mutate(() => actOnProject(binding, action, context.signal));
          return { exitCode: 0, stdout: JSON.stringify(result, null, 2) };
        }
        if (command === "project" && args.length === 0) {
          const { projectId } = await resolve(scope);
          await ensureBinding(projectId);
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
