import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { saveMyModelRpcContract } from "./contract.js";
import { resolveSupportedSelection } from "./lib/selection.js";

export { saveMyModelRpcContract } from "./contract.js";

function boundedMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : "";
  return message.length > 0
    ? `BB could not list machines: ${message.slice(0, 260)}`
    : "BB could not list machines.";
}

export default function plugin(bb: BbPluginApi): void {
  bb.rpc.register(saveMyModelRpcContract, {
    async listHosts() {
      try {
        const hosts = await bb.sdk.hosts.list();
        return {
          hosts: hosts
            .map(({ id, name, status }) => ({ id, name, status }))
            .sort((left, right) =>
              Number(right.status === "connected") - Number(left.status === "connected") ||
              left.name.localeCompare(right.name))
            .slice(0, 500),
          error: null,
        };
      } catch (error) {
        return { hosts: [], error: boundedMessage(error) };
      }
    },
    resolveSelection: ({ hostId, preferred }) =>
      resolveSupportedSelection(bb.sdk.system, hostId, preferred),
  });
}
