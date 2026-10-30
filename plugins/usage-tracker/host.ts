import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { readCodexAccountEmail, readCodexResetCredits } from "./lib/codex-reset-credits.ts";
import { hostContract } from "./lib/host-contract.ts";

// Runs on every machine, so each machine reports the Codex login that lives there.
export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    async readCodexResets() {
      const [count, email] = await Promise.allSettled([
        readCodexResetCredits(),
        readCodexAccountEmail(),
      ]);
      return {
        availableCount: count.status === "fulfilled" ? count.value : null,
        accountEmail: email.status === "fulfilled" ? email.value : null,
      };
    },
  },
});
