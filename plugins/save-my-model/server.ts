import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { saveMyModelRpcContract } from "./contract.js";
import { resolveSupportedSelection } from "./lib/selection.js";

export { saveMyModelRpcContract } from "./contract.js";

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
      } catch {
        return { hosts: [], error: "BB could not list machines." };
      }
    },
    async resolveSelection({ hostId, preferred }) {
      try {
        const host = await bb.sdk.hosts.get({ hostId });
        if (host.id !== hostId) throw new Error("Host identity mismatch");
      } catch {
        return {
          selection: null,
          error: {
            code: "host-unavailable" as const,
            message: "This machine is no longer enrolled in BB.",
          },
        };
      }
      return resolveSupportedSelection(bb.sdk.system, hostId, preferred);
    },
  });
}
