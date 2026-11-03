import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { rpcContract } from "./contract.js";
import { loadMcpConfig, startCommand } from "./lib/config.js";
import { FactoryMcpClient } from "./lib/mcp-client.js";
import { FactoryService } from "./lib/service.js";

/**
 * Factory Bots is an observer. Its backend owns one Factory MCP child process,
 * exposes two read-only RPCs, and never writes to the factory.
 */
export default async function plugin(bb: BbPluginApi): Promise<void> {
  const loaded = await loadMcpConfig({ moduleUrl: import.meta.url });
  const client =
    loaded.config === null
      ? null
      : new FactoryMcpClient(loaded.config, {
          onStderr: (line) => bb.log.debug(`factory mcp: ${line}`),
        });

  const service = new FactoryService({
    caller: client,
    startCommand: loaded.config === null ? null : startCommand(loaded.config),
    configError: loaded.error,
  });

  bb.rpc.register(rpcContract, {
    getBoard: () => service.getBoard(),
    getTicket: ({ linearId }) => service.getTicket(linearId),
    sendMessage: ({ message, provider, model, reasoningLevel }) =>
      service.sendMessage(message, { provider, model, reasoningLevel }),
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
