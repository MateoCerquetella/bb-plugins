import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** Calls the plugin server makes on each machine's `bb.host` entry. */
export const hostContract = defineRpcContract({
  readCodexResets: {
    input: z.null(),
    output: z
      .object({
        availableCount: z.number().int().min(0).nullable(),
        accountEmail: z.string().nullable(),
      })
      .strict(),
  },
});
