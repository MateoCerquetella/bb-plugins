import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract } from "./contract.js";
import { collectMachineSnapshot } from "./lib/metrics.js";
import {
  collectProcessList,
  inspectProcessTermination,
  terminateProcess,
} from "./lib/processes.js";

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    snapshot: ({ cpuSampleMs, extraDiskPaths }, context) =>
      collectMachineSnapshot({
        cpuSampleMs,
        extraDiskPaths,
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
