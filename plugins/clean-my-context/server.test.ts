import { describe, expect, it } from "vitest";
import {
  createFakePluginHost,
  experimental_scanPublicSdkOnly,
} from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";

describe("Clean My Context backend", () => {
  it("clears context through RPC and explicit CLI targets", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "clean-my-context",
    });
    const calls: Array<{ threadId: string }> = [];
    harness.sdk.stub("threads.clearContext", async (args) => {
      calls.push(args);
      return { ok: true as const };
    });
    await plugin(bb);

    await expect(
      harness.behavior.callRpc("clearContext", { threadId: "thr_rpc" }),
    ).resolves.toEqual({ ok: true, threadId: "thr_rpc" });
    await expect(
      harness.behavior.runCli(["clear", "thr_cli", "--json"]),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: JSON.stringify({ ok: true, threadId: "thr_cli" }),
    });
    expect(calls).toEqual([
      { threadId: "thr_rpc" },
      { threadId: "thr_cli" },
    ]);
    await harness.lifecycle.dispose();
  });

  it("uses the invoking thread and rejects a missing target", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "clean-my-context",
    });
    harness.sdk.stub("threads.clearContext", async () => ({
      ok: true as const,
    }));
    await plugin(bb);

    await expect(
      harness.behavior.runCli(["clear"], { threadId: "thr_current" }),
    ).resolves.toMatchObject({ exitCode: 0 });
    await expect(harness.behavior.runCli(["clear"])).resolves.toEqual({
      exitCode: 1,
      stderr: "Provide a thread id or run this command from a BB thread.",
      stdout: "",
    });
    await harness.lifecycle.dispose();
  });

  it("uses only public plugin SDK imports", async () => {
    const scan = await experimental_scanPublicSdkOnly(import.meta.dirname, {
      allow: [
        /^react$/,
        /^sonner$/,
        /^@testing-library\/react$/,
        /^@hugeicons\/(?:core-free-icons|react)$/,
        /^@radix-ui\/react-slot$/,
        /^class-variance-authority$/,
        /^clsx$/,
        /^tailwind-merge$/,
        /^vitest(?:\/config)?$/,
      ],
    });
    expect(scan.violations).toEqual([]);
    expect(scan.privateDependencies).toEqual([]);
  });
});
