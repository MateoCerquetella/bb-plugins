import type { PluginKvStorage } from "@get-bb/plugin-sdk";
import { bindingSchema, enginePolicySchema, type Binding, type EnginePolicy } from "./contract.ts";
import { normalizeBaseUrl } from "./steel-client.ts";

export const DEFAULT_POLICY: EnginePolicy = { engine: "playwright", fallback: false };

function localEndpoint(value: string): string {
  const url = normalizeBaseUrl(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/") {
    throw new Error("Project API and CDP must use http://127.0.0.1:<port>.");
  }
  return url.origin;
}

export class ProjectBrowsers {
  private writing = false;
  private provisioning: Promise<unknown> = Promise.resolve();
  constructor(private readonly kv: PluginKvStorage) {}

  async ensure(projectId: string, provision: (projectId: string) => Promise<Binding>): Promise<Binding> {
    const existing = await this.binding(projectId);
    if (existing) return existing;
    // Serialize setup and persistence across projects; recheck after waiting.
    const task = this.provisioning.then(async () => {
      const current = await this.binding(projectId);
      if (current) return current;
      const binding = await provision(projectId);
      await this.bind(projectId, binding);
      return binding;
    });
    this.provisioning = task.catch(() => {});
    return task;
  }

  async policy(projectId: string): Promise<EnginePolicy> {
    const value = await this.kv.get(`policy:${projectId}`);
    return value === undefined ? { ...DEFAULT_POLICY } : enginePolicySchema.parse(value);
  }
  async setPolicy(projectId: string, policy: EnginePolicy): Promise<void> {
    await this.kv.set(`policy:${projectId}`, enginePolicySchema.parse(policy));
  }
  async binding(projectId: string): Promise<Binding | null> {
    const value = await this.kv.get(`profile:${projectId}`);
    return value === undefined ? null : bindingSchema.parse(value);
  }
  async require(projectId: string): Promise<Binding> {
    const binding = await this.binding(projectId);
    if (!binding) throw new Error("This project has no browser. Provision and bind a dedicated Steel instance first.");
    return binding;
  }
  async bind(projectId: string, input: Binding): Promise<void> {
    if (this.writing) throw new Error("Another project binding is being saved. Retry.");
    this.writing = true;
    try {
      const viewer = normalizeBaseUrl(input.viewerUrl);
      if (viewer.protocol !== "https:" || viewer.pathname !== "/") {
        throw new Error("Viewer must be an authenticated HTTPS origin.");
      }
      const binding = {
        apiUrl: localEndpoint(input.apiUrl),
        cdpUrl: localEndpoint(input.cdpUrl),
        viewerUrl: viewer.origin,
      };
      if (binding.apiUrl === binding.cdpUrl) throw new Error("API and CDP need distinct ports.");
      const current = await this.binding(projectId);
      if (current && JSON.stringify(current) !== JSON.stringify(binding)) {
        throw new Error("This project already has a different binding; automatic profile replacement is refused.");
      }
      for (const key of await this.kv.list("profile:")) {
        if (key === `profile:${projectId}`) continue;
        const other = bindingSchema.parse(await this.kv.get(key));
        if ([other.apiUrl, other.cdpUrl].some(url => [binding.apiUrl, binding.cdpUrl].includes(url))
          || other.viewerUrl === binding.viewerUrl) {
          throw new Error("This browser endpoint is already assigned to another project.");
        }
      }
      await this.kv.set(`profile:${projectId}`, binding);
    } finally { this.writing = false; }
  }
}
