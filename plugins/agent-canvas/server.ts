import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { defineCli, cliCommand } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { rpcContract, snapshotSchema, type Snapshot } from "./contract";

export default function plugin(bb: BbPluginApi) {
  const lifetime = new AbortController();
  bb.onDispose(() => lifetime.abort());
  async function snapshot(): Promise<Snapshot> {
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(15_000)]);
    const [projects, environments, threads] = await Promise.all([
      bb.sdk.projects.list({ includePersonal: true, signal }),
      bb.sdk.environments.list({ limit: 201, signal }),
      bb.sdk.threads.list({ archived: false, includeHidden: false, limit: 81, signal }),
    ]);
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    const environmentName = new Map(environments.map((e) => [e.id, {
      name: e.name || "Workspace", branch: e.branchName || "default",
    }]));
    return snapshotSchema.parse({
      capturedAt: Date.now(), truncated: threads.length > 80,
      threads: threads.slice(0, 80).filter((t) => t.deletedAt === null && t.visibility !== "hidden").map((t) => {
        const env = t.environmentId ? environmentName.get(t.environmentId) : undefined;
        const state = t.queuedWork === "failed" ? "failed" : t.hasPendingInteraction ? "waiting" :
          t.runtime.displayStatus === "active" || t.runtime.displayStatus === "starting" ? "working" :
          t.runtime.displayStatus === "error" ? "failed" : "idle";
        return {
          id: t.id, title: (t.title || t.titleFallback || "Untitled thread").slice(0, 240),
          project: (projectName.get(t.projectId) || "Personal").slice(0, 240),
          environment: (env?.name || "No workspace").slice(0, 240),
          branch: (env?.branch || "default").slice(0, 240),
          provider: t.providerId.slice(0, 240), state, updatedAt: t.updatedAt,
        };
      }),
    });
  }
  bb.rpc.register(rpcContract, { snapshot });
  bb.cli.register(defineCli({
    name: "agent-canvas", summary: "Inspect the spatial agent canvas",
    commands: { status: cliCommand({
      summary: "Read the bounded thread projection",
      options: { json: { type: "boolean", description: "Emit JSON" } },
      async run(input) {
        const value = await snapshot();
        return { exitCode: 0, stdout: input.options.json ? JSON.stringify(value) :
          `${value.threads.length} live thread panes${value.truncated ? " (display limit reached)" : ""}` };
      },
    }) },
  }));
}
