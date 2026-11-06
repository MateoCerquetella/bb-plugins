import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { rpcContract } from "./contract.js";
import { factoryEntryPoint, loadMcpConfig, startCommand, type LoadedFactoryMcpConfig } from "./lib/config.js";
import { FactoryMcpClient } from "./lib/mcp-client.js";
import { FactoryService } from "./lib/service.js";
import { CapabilityService } from "./lib/capability-service.js";
import { SoulService } from "./lib/soul-service.js";

/**
 * Factory Bots owns one Factory MCP child. The board and chat use the read
 * tools plus the single Orchestrator write; the Souls view has its own
 * four-tool allowlist and writes only through factory_soul_set.
 */
interface FactoryRuntime {
  loaded: LoadedFactoryMcpConfig;
  client: FactoryMcpClient | null;
  service: FactoryService;
  souls: SoulService;
  capabilities: CapabilityService;
}

function createRuntime(bb: BbPluginApi, loaded: LoadedFactoryMcpConfig): FactoryRuntime {
  const client = loaded.config === null
    ? null
    : new FactoryMcpClient(loaded.config, {
        onStderr: (line) => bb.log.debug(`factory mcp: ${line}`),
      });
  const start = loaded.config === null ? null : startCommand(loaded.config);
  return {
    loaded,
    client,
    service: new FactoryService({ caller: client, startCommand: start, configError: loaded.error }),
    souls: new SoulService({ caller: client, startCommand: start, configError: loaded.error }),
    capabilities: new CapabilityService({ caller: client, startCommand: start, configError: loaded.error }),
  };
}

export default async function plugin(bb: BbPluginApi): Promise<void> {
  const settings = bb.settings.define({
    factoryCheckoutPath: {
      type: "string",
      label: "Factory checkout path",
      description:
        "Absolute path to the Factory checkout containing dist/main.js. Changes apply immediately; leave empty to use the bundled factory.mcp.json default.",
      default: "",
    },
  });
  let configuredPath = (await settings.get()).factoryCheckoutPath;
  let runtime = createRuntime(bb, await loadMcpConfig({
    moduleUrl: import.meta.url,
    factoryCheckoutPath: configuredPath,
  }));
  let pathError = runtime.loaded.config === null ? runtime.loaded.error : null;
  let changeVersion = 0;
  let disposed = false;

  const pathStatus = () => ({
    configuredPath,
    entryPoint: runtime.loaded.config === null
      ? null
      : factoryEntryPoint(runtime.loaded.config),
    error: pathError,
  });
  const publishPathStatus = () => bb.realtime.publish("factory-bots:settings", null);

  settings.onChange((next) => {
    const version = ++changeVersion;
    configuredPath = next.factoryCheckoutPath;
    void loadMcpConfig({
      moduleUrl: import.meta.url,
      factoryCheckoutPath: configuredPath,
    }).then((loaded) => {
      if (disposed || version !== changeVersion) return;
      if (loaded.config === null && configuredPath.trim() !== "") {
        pathError = loaded.error ?? "The Factory checkout path could not be loaded.";
        publishPathStatus();
        return;
      }
      const previous = runtime;
      runtime = createRuntime(bb, loaded);
      pathError = loaded.error;
      previous.client?.dispose();
      const target = loaded.config === null ? null : factoryEntryPoint(loaded.config);
      bb.log.info(`Factory connection switched to ${target ?? loaded.path ?? "unknown"}.`);
      publishPathStatus();
    }).catch((cause: unknown) => {
      if (disposed || version !== changeVersion) return;
      pathError = cause instanceof Error ? cause.message : String(cause);
      publishPathStatus();
    });
  });

  bb.rpc.register(rpcContract, {
    getFactoryPathStatus: () => pathStatus(),
    getBoard: () => runtime.service.getBoard(),
    getTicket: ({ linearId }) => runtime.service.getTicket(linearId),
    sendMessage: ({ message, provider, model, reasoningLevel }) =>
      runtime.service.sendMessage(message, { provider, model, reasoningLevel }),
    getSouls: () => runtime.souls.getSouls(),
    getStatus: () => runtime.souls.getStatus(),
    getAudit: () => runtime.souls.getAudit(),
    saveSoul: ({ bot, soul, author }) => runtime.souls.saveSoul(bot, soul, author),
    getCapabilities: () => runtime.capabilities.getCapabilities(),
    getCapabilityAudit: () => runtime.capabilities.getCapabilityAudit(),
    setCapability: ({ bot, enabled }) => runtime.capabilities.setCapability(bot, enabled),
  });

  bb.onDispose(() => {
    disposed = true;
    changeVersion++;
    runtime.client?.dispose();
  });

  if (runtime.loaded.config === null) {
    bb.log.warn(`Factory MCP is not configured: ${runtime.loaded.error ?? "unknown error"}`);
  } else {
    bb.log.info(`Reading the factory through MCP config ${runtime.loaded.path ?? "unknown"}.`);
  }
}
