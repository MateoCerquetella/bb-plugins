// @vitest-environment jsdom
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPluginApp,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  toastError.mockReset();
  toastSuccess.mockReset();
});

describe("Clean My Context composer action", () => {
  it("confirms and clears the exact current thread without navigating", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const app = await loadPluginApp(() => import("./app.js"));
    const customization = app.composerCustomizations[0]!;
    let resolveClear: (() => void) | undefined;
    const clearContext = vi.fn(
      () =>
        new Promise<{ ok: true; threadId: string }>((resolve) => {
          resolveClear = () => resolve({ ok: true, threadId: "thr_visible" });
        }),
    );
    const slot = renderSlot(
      customization.actions![0]!,
      {},
      {
        context: { projectId: "proj_1", threadId: "thr_visible" },
        composer: {
          text: "Keep this unsent draft",
          scope: { kind: "thread", threadId: "thr_visible" },
        },
        rpc: { clearContext },
      },
    );

    expect(customization.scopes).toEqual(["thread"]);
    expect(app.threadHeaderActions).toHaveLength(0);
    const button = slot.getByRole("button", { name: "Clear this thread" });
    fireEvent.mouseDown(button);
    fireEvent.click(button);
    fireEvent.click(button);

    await expect.poll(() => clearContext.mock.calls.length).toBe(1);
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(clearContext).toHaveBeenCalledWith({ threadId: "thr_visible" });
    expect(slot.inspection.sidebarActionCalls).toEqual([]);
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(slot.inspection.composer.text).toBe("Keep this unsent draft");
    resolveClear?.();
    await expect.poll(() => slot.inspection.composer.focusCount).toBe(1);
    expect(toastSuccess).toHaveBeenCalledWith(
      "Thread context cleared",
      expect.any(Object),
    );
    slot.lifecycle.unmount();
  });

  it("does nothing when confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const app = await loadPluginApp(() => import("./app.js"));
    const clearContext = vi.fn();
    const slot = renderSlot(
      app.composerCustomizations[0]!.actions![0]!,
      {},
      {
        context: { projectId: "proj_1", threadId: "thr_visible" },
        composer: {
          scope: { kind: "thread", threadId: "thr_visible" },
        },
        rpc: { clearContext },
      },
    );

    fireEvent.click(
      slot.getByRole("button", { name: "Clear this thread" }),
    );

    expect(slot.inspection.sidebarActionCalls).toEqual([]);
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(clearContext).not.toHaveBeenCalled();
    expect(slot.inspection.rpcCalls).toEqual([]);
    slot.lifecycle.unmount();
  });

  it("preserves the draft and restores the action when clearing fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const app = await loadPluginApp(() => import("./app.js"));
    const clearContext = vi.fn(async () => {
      throw new Error("Thread is processing another request");
    });
    const slot = renderSlot(
      app.composerCustomizations[0]!.actions![0]!,
      {},
      {
        context: { projectId: "proj_1", threadId: "thr_visible" },
        composer: {
          text: "Keep this draft",
          scope: { kind: "thread", threadId: "thr_visible" },
        },
        rpc: { clearContext },
      },
    );

    const button = slot.getByRole("button", { name: "Clear this thread" });
    fireEvent.click(button);

    await expect.poll(() => toastError.mock.calls.length).toBe(1);
    expect(toastError).toHaveBeenCalledWith("Could not clear this thread", {
      description: "Thread is processing another request",
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(slot.inspection.composer.text).toBe("Keep this draft");
    expect(slot.inspection.navigateCalls).toEqual([]);
    slot.lifecycle.unmount();
  });

  it("is unavailable without a resolved thread", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const app = await loadPluginApp(() => import("./app.js"));
    const slot = renderSlot(
      app.composerCustomizations[0]!.actions![0]!,
      {},
      {
        context: { projectId: "proj_1", threadId: null },
        composer: {
          scope: { kind: "new-thread", projectId: "proj_1" },
        },
      },
    );

    const button = slot.getByRole("button", { name: "Clear this thread" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);

    expect(confirm).not.toHaveBeenCalled();
    expect(slot.inspection.sidebarActionCalls).toEqual([]);
    slot.lifecycle.unmount();
  });
});
