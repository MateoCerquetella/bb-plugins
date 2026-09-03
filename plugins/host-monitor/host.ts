import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";

import { hostContract } from "./contract.ts";
import { collectMachineSnapshot } from "./lib/metrics.ts";

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    snapshot: ({ cpuSampleMs }, context) => collectMachineSnapshot({
      cpuSampleMs,
      signal: context.signal,
    }),
  },
});
