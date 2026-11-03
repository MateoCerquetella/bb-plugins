import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { rpcContract } from "./contract.js";
import { loadMcpConfig, startCommand } from "./lib/config.js";
import { FactoryMcpClient } from "./lib/mcp-client.js";
import { FactoryService } from "./lib/service.js";
import { CapabilityService } from "./lib/capability-service.js";
import { SoulService } from "./lib/soul-service.js";

/**
 * Factory Bots owns one Factory MCP child. The board and chat use the read
 * tools plus the single Orchestrator write; the Souls view has its own
 * four-tool allowlist and writes only through factory_soul_set.
 */
export default async function plugin(bb: BbPluginApi): Promise<void> {
  const loaded = await loadMcpConfig({ moduleUrl: import.meta.url });
  const client =
    loaded.config === null
      ? null
      : new FactoryMcpClient(loaded.config, {
          onStderr: (line) => bb.log.debug(`factory mcp: ${line}`),
        });

  const start = loaded.config === null ? null : startCommand(loaded.config);
  const service = new FactoryService({
    caller: client,
    startCommand: start,
    configError: loaded.error,
  });
  const souls = new SoulService({
    caller: client,
    startCommand: start,
    configError: loaded.error,
  });
  const capabilities = new CapabilityService({
    caller: client,
    startCommand: start,
    configError: loaded.error,
  });

  bb.rpc.register(rpcContract, {
    getBoard: () => service.getBoard(),
    getTicket: ({ linearId }) => service.getTicket(linearId),
    sendMessage: ({ message, provider, model, reasoningLevel }) =>
      service.sendMessage(message, { provider, model, reasoningLevel }),
    getSouls: () => souls.getSouls(),
    getStatus: () => souls.getStatus(),
    getAudit: () => souls.getAudit(),
    saveSoul: ({ bot, soul, author }) => souls.saveSoul(bot, soul, author),
    getCapabilities: () => capabilities.getCapabilities(),
    getCapabilityAudit: () => capabilities.getCapabilityAudit(),
    setCapability: ({ bot, enabled }) => capabilities.setCapability(bot, enabled),
  });

  bb.onDispose(() => {
    client?.dispose();
  });

  if (loaded.config === null) {
    bb.log.warn(`Factory MCP is not configured: ${loaded.error ?? "unknown error"}`);
  } else {
    bb.log.info(`Reading the factory through MCP config ${loaded.path ?? "unknown"}.`);
  }
}
