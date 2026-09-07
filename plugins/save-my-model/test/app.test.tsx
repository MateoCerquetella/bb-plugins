// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { readPreference } from "../lib/preferences.js";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Save My Model settings", () => {
  it("routes BB's picker to the selected real host and persists its coherent change", async () => {
    const app = await loadPluginApp(() => import("../app.js"));
    const registration = app.settingsSections[0]!;
    const slot = renderSlot(registration, {}, {
      rpc: {
        listHosts: () => ({
          hosts: [
            { id: "host-a", name: "Alpha", status: "connected" },
            { id: "host-b", name: "Beta", status: "disconnected" },
          ],
          error: null,
        }),
        resolveSelection: (input: unknown) => {
          const { hostId } = input as { hostId: string };
          return { selection: {
            providerId: "codex",
            model: hostId === "host-a" ? "gpt-a" : "gpt-b",
            reasoningLevel: "medium",
          },
          error: null,
        }; },
      },
    });

    expect((await slot.findByTestId("bb-provider-model-picker")).dataset.routingId).toBe("host-a");
    fireEvent.click(slot.getByRole("button", { name: /Beta/u }));
    await waitFor(() => {
      expect(slot.getByTestId("bb-provider-model-picker").dataset.routingId).toBe("host-b");
    });

    fireEvent.change(slot.getByRole("textbox", { name: "Model" }), { target: { value: "gpt-custom" } });
    fireEvent.change(slot.getByRole("textbox", { name: "Reasoning level" }), { target: { value: "high" } });
    fireEvent.click(slot.getByRole("button", { name: "Apply execution selection" }));
    expect(readPreference("host-b")).toEqual({
      hostId: "host-b",
      providerId: "codex",
      model: "gpt-custom",
      reasoningLevel: "high",
    });
    slot.lifecycle.unmount();
  });

  it("renders empty and backend-error states without inventing hosts", async () => {
    const app = await loadPluginApp(() => import("../app.js"));
    const slot = renderSlot(app.settingsSections[0]!, {}, {
      rpc: {
        listHosts: () => ({ hosts: [], error: "BB could not list machines." }),
        resolveSelection: () => ({ selection: null, error: null }),
      },
    });
    expect((await slot.findByRole("alert")).textContent).toContain("BB could not list machines.");
    expect(slot.queryByRole("navigation", { name: "BB machines" })).toBeNull();
    slot.lifecycle.unmount();
  });
});
