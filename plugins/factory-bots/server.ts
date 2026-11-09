import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { rpcContract } from "./contract.js";
import { DEFAULT_FACTORY_URL, loadMcpConfig, startCommand, type LoadedFactoryMcpConfig } from "./lib/config.js";
import {
  FACTORIES_KEY,
  parseFactories,
  seedFactories,
  uniqueFactoryId,
  type Factory,
} from "./lib/factories.js";
import { FactoryMcpClient } from "./lib/mcp-client.js";
import { FactoryService } from "./lib/service.js";
import { CapabilityService } from "./lib/capability-service.js";
import { SoulService } from "./lib/soul-service.js";

/**
 * Foreman owns one Factory MCP child per configured factory, started on
 * first use. The board and chat use the read tools plus the single
 * Orchestrator write; the Souls view has its own four-tool allowlist and
 * writes only through factory_soul_set.
 */
interface FactoryRuntime {
  client: FactoryMcpClient | null;
  service: FactoryService;
  souls: SoulService;
  capabilities: CapabilityService;
}

function createRuntime(bb: BbPluginApi, factory: Factory, loaded: LoadedFactoryMcpConfig): FactoryRuntime {
  const client = loaded.config === null
    ? null
    : new FactoryMcpClient(loaded.config, {
        onStderr: (line) => bb.log.debug(`factory mcp [${factory.id}]: ${line}`),
      });
  const options = {
    caller: client,
    startCommand: loaded.config === null ? null : startCommand(loaded.config),
    configError: loaded.error,
  };
  return {
    client,
    service: new FactoryService(options),
    souls: new SoulService(options),
    capabilities: new CapabilityService(options),
  };
}

export default async function plugin(bb: BbPluginApi): Promise<void> {
  const load = (factory: Pick<Factory, "checkoutPath" | "url">) =>
    loadMcpConfig({
      moduleUrl: import.meta.url,
      factoryCheckoutPath: factory.checkoutPath,
      factoryUrl: factory.url,
    });

  let list = parseFactories(await bb.storage.kv.get(FACTORIES_KEY));
  if (list === null) {
    const bundled = await loadMcpConfig({ moduleUrl: import.meta.url });
    list = seedFactories(bundled.config?.env.FACTORY_URL ?? DEFAULT_FACTORY_URL);
    await bb.storage.kv.set(FACTORIES_KEY, list);
  }
  let factories: Factory[] = list;

  const runtimes = new Map<string, Promise<FactoryRuntime>>();
  const runtime = (factoryId: string): Promise<FactoryRuntime> => {
    const existing = runtimes.get(factoryId);
    if (existing !== undefined) return existing;
    const factory = factories.find((entry) => entry.id === factoryId);
    if (factory === undefined) return Promise.reject(new Error(`Unknown factory ${factoryId}`));
    const created = load(factory).then((loaded) => {
      if (loaded.config === null) {
        bb.log.warn(`Factory ${factory.id} is not configured: ${loaded.error ?? "unknown error"}`);
      }
      return createRuntime(bb, factory, loaded);
    });
    runtimes.set(factoryId, created);
    return created;
  };
  const retire = (factoryId: string): void => {
    const existing = runtimes.get(factoryId);
    runtimes.delete(factoryId);
    void existing?.then((value) => value.client?.dispose(), () => {});
  };

  // Saves and removals replace the whole list; one at a time keeps both.
  let writes: Promise<unknown> = Promise.resolve();
  const serialized = <T>(work: () => Promise<T>): Promise<T> => {
    const next = writes.then(work, work);
    writes = next.catch(() => {});
    return next;
  };
  // The list swap and the retirement of the changed factory's child happen
  // together, so no request can pick up a runtime built from the old entry.
  const commit = async (next: Factory[], changedId: string): Promise<void> => {
    await bb.storage.kv.set(FACTORIES_KEY, next);
    factories = next;
    retire(changedId);
    bb.realtime.publish("factory-bots:factories", null);
  };

  bb.rpc.register(rpcContract, {
    listFactories: () => ({ factories }),
    saveFactory: (input) =>
      serialized(async () => {
        if (input.id !== undefined && !factories.some((entry) => entry.id === input.id)) {
          return { ok: false as const, message: `Unknown factory ${input.id}` };
        }
        const loaded = await load(input);
        if (loaded.config === null) {
          return { ok: false as const, message: loaded.error ?? "The Factory MCP config could not be loaded." };
        }
        const factory: Factory = {
          id: input.id ?? uniqueFactoryId(input.name, factories.map((entry) => entry.id)),
          name: input.name,
          url: input.url,
          checkoutPath: input.checkoutPath,
        };
        await commit(
          input.id === undefined
            ? [...factories, factory]
            : factories.map((entry) => (entry.id === factory.id ? factory : entry)),
          factory.id,
        );
        return { ok: true as const, factory };
      }),
    removeFactory: ({ id }) =>
      serialized(async () => {
        if (!factories.some((entry) => entry.id === id)) throw new Error(`Unknown factory ${id}`);
        if (factories.length === 1) {
          throw new Error("Keep at least one factory: add another before removing this one.");
        }
        await commit(factories.filter((entry) => entry.id !== id), id);
        return { factories };
      }),
    getBoard: async ({ factoryId }) => (await runtime(factoryId)).service.getBoard(),
    getTicket: async ({ factoryId, linearId }) => (await runtime(factoryId)).service.getTicket(linearId),
    sendMessage: async ({ factoryId, message, provider, model, reasoningLevel }) =>
      (await runtime(factoryId)).service.sendMessage(message, { provider, model, reasoningLevel }),
    getSouls: async ({ factoryId }) => (await runtime(factoryId)).souls.getSouls(),
    getStatus: async ({ factoryId }) => (await runtime(factoryId)).souls.getStatus(),
    getAudit: async ({ factoryId }) => (await runtime(factoryId)).souls.getAudit(),
    saveSoul: async ({ factoryId, bot, soul, author }) =>
      (await runtime(factoryId)).souls.saveSoul(bot, soul, author),
    getCapabilities: async ({ factoryId }) => (await runtime(factoryId)).capabilities.getCapabilities(),
    getCapabilityAudit: async ({ factoryId }) => (await runtime(factoryId)).capabilities.getCapabilityAudit(),
    setCapability: async ({ factoryId, bot, enabled }) =>
      (await runtime(factoryId)).capabilities.setCapability(bot, enabled),
  });

  bb.onDispose(() => {
    for (const id of [...runtimes.keys()]) retire(id);
  });

  bb.log.info(`Foreman knows ${factories.length} ${factories.length === 1 ? "factory" : "factories"}.`);
}
