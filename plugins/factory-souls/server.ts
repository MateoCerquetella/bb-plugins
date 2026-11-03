import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { rpcContract } from "./contract.js";
import { loadMcpConfig, startCommand } from "./lib/config.js";
import { FactoryMcpClient } from "./lib/mcp-client.js";
import { SoulService } from "./lib/service.js";

/**
 * Factory Souls owns one Factory MCP child and exposes only the four soul
 * tools. It never opens factory storage or calls ticket/message tools.
 */
export default async function plugin(bb: BbPluginApi): Promise<void> {
  const loaded = await loadMcpConfig({ moduleUrl: import.meta.url });
  const client =
    loaded.config === null
      ? null
      : new FactoryMcpClient(loaded.config, {
          onStderr: (line) => bb.log.debug(`factory souls mcp: ${line}`),
        });

  const service = new SoulService({
    caller: client,
    startCommand: loaded.config === null ? null : startCommand(loaded.config),
    configError: loaded.error,
  });

  bb.rpc.register(rpcContract, {
    getSouls: () => service.getSouls(),
    getStatus: () => service.getStatus(),
    getAudit: () => service.getAudit(),
    saveSoul: ({ bot, soul, author }) => service.saveSoul(bot, soul, author),
  });

  bb.onDispose(() => {
    client?.dispose();
  });

  if (loaded.config === null) {
    bb.log.warn(`Factory MCP is not configured: ${loaded.error ?? "unknown error"}`);
  } else {
    bb.log.info(
      `Reading and writing souls through MCP config ${loaded.path ?? "unknown"}.`,
    );
  }
}
