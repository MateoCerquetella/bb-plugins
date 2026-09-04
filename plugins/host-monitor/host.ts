import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";

import { hostContract } from "./contract.ts";
import { collectMachineSnapshot } from "./lib/metrics.ts";
import {
  collectProcessList,
  inspectProcessTermination,
  terminateProcess,
} from "./lib/processes.ts";

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    snapshot: ({ cpuSampleMs }, context) => collectMachineSnapshot({
      cpuSampleMs,
      signal: context.signal,
    }),
    listProcesses: ({ sortBy, limit }, context) =>
      collectProcessList({ sortBy, limit, signal: context.signal }),
    inspectProcessTermination: (input, context) =>
      inspectProcessTermination(input, context.signal),
    terminateProcess: (input, context) =>
      terminateProcess(input, context.signal),
  },
});
