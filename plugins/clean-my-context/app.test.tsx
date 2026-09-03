// @vitest-environment jsdom
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPluginApp,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import type { PluginThreadHeaderActionProps } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server.js";

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("Clean My Context header action", () => {
  it("confirms and clears the visible thread", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const app = await loadPluginApp(() => import("./app.js"));
    const clearContext = vi.fn(async () => ({
      ok: true as const,
      threadId: "thr_visible",
    }));
    const slot = renderSlot<
      PluginThreadHeaderActionProps,
      typeof rpcContract
    >(
      app.threadHeaderActions[0]!,
      {
        threadId: "thr_visible",
        projectId: "proj_1",
        isCompactViewport: false,
      },
      { rpc: { clearContext } },
    );

    fireEvent.click(slot.getByRole("button", { name: "Clear model context" }));

    await expect.poll(() => clearContext.mock.calls.length).toBe(1);
    expect(clearContext).toHaveBeenCalledWith({ threadId: "thr_visible" });
    expect(toastSuccess).toHaveBeenCalledWith(
      "Model context cleared",
      expect.any(Object),
    );
    slot.lifecycle.unmount();
  });

  it("does nothing when confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const app = await loadPluginApp(() => import("./app.js"));
    const clearContext = vi.fn();
    const slot = renderSlot(
      app.threadHeaderActions[0]!,
      {
        threadId: "thr_visible",
        projectId: "proj_1",
        isCompactViewport: false,
      },
      { rpc: { clearContext } },
    );

    fireEvent.click(slot.getByRole("button", { name: "Clear model context" }));

    expect(clearContext).not.toHaveBeenCalled();
    slot.lifecycle.unmount();
  });
});
