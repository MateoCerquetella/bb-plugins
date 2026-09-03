import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const threadIdSchema = z.object({ threadId: z.string().min(1) }).strict();

export const rpcContract = defineRpcContract({
  clearContext: {
    input: threadIdSchema,
    output: z.object({ ok: z.literal(true), threadId: z.string() }).strict(),
  },
});

const usage = [
  "Usage:",
  "  bb clean-my-context clear [thread-id] [--json]",
  "",
  "When thread-id is omitted, the command uses the current BB thread.",
].join("\n");

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ContextClearThreads {
  clearContext(args: { threadId: string }): Promise<{ ok: true }>;
}

function contextClearThreads(bb: BbPluginApi): ContextClearThreads {
  const threads = bb.sdk.threads as typeof bb.sdk.threads &
    Partial<ContextClearThreads>;
  if (typeof threads.clearContext !== "function") {
    throw new Error(
      "This BB version does not provide the thread context-clear API.",
    );
  }
  const clearContext = threads.clearContext;
  return { clearContext: (args) => clearContext(args) };
}

export default function cleanMyContextPlugin(bb: BbPluginApi): void {
  async function clearContext(
    threadId: string,
  ): Promise<{ ok: true; threadId: string }> {
    await contextClearThreads(bb).clearContext({ threadId });
    return { ok: true, threadId };
  }

  bb.rpc.register(rpcContract, {
    clearContext: ({ threadId }) => clearContext(threadId),
  });

  bb.cli.register({
    name: "clean-my-context",
    summary: "Start fresh model context while preserving the BB thread",
    commands: [
      {
        name: "clear",
        summary: "Clear an idle or failed thread's model context",
        usage: "bb clean-my-context clear [thread-id] [--json]",
      },
    ],
    async run(argv, context) {
      const json = argv.includes("--json");
      const positional = argv.filter((argument) => argument !== "--json");
      const [command, explicitThreadId, ...extra] = positional;
      if (command === undefined || command === "help" || command === "--help") {
        return { exitCode: 0, stdout: usage };
      }
      if (command !== "clear" || extra.length > 0) {
        return { exitCode: 1, stderr: usage };
      }
      const threadId = explicitThreadId ?? context.threadId;
      if (threadId === undefined) {
        return {
          exitCode: 1,
          stderr: "Provide a thread id or run this command from a BB thread.",
        };
      }
      try {
        const result = await clearContext(threadId);
        return {
          exitCode: 0,
          stdout: json
            ? JSON.stringify(result)
            : `Cleared model context for ${threadId}. Thread history and workspace are unchanged.`,
        };
      } catch (error) {
        return { exitCode: 1, stderr: errorMessage(error) };
      }
    },
  });
}
