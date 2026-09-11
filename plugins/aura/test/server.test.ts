import assert from "node:assert/strict";
import test from "node:test";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../server.ts";
import { defaults, type Snapshot } from "../lib/model.ts";
import { decodeImage } from "../lib/image.ts";
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const replace = { action: "replace", name: "personal.png", dataUrl: png };
const keep = { action: "keep" };
const empty = { settings: defaults, image: null, slots: [], activeSlot: null };

test("six independent slots retain images and appearance across switches and reload", async () => {
  let host = createFakePluginHost({ pluginId: "aura" });
  try {
    plugin(host.bb);
    assert.deepEqual(await host.harness.callRpc("get", null), empty);
    const saved = await host.harness.callRpc("apply", { settings: defaults, image: replace, saveSlot: { slot: 1, name: "Lake" } }) as Snapshot;
    assert.equal(saved.activeSlot, 1);
    assert.equal(saved.slots[0]?.image?.name, "personal.png");
    const originalVersion = saved.image?.version;
    await host.harness.callRpc("apply", { settings: { ...defaults, intensity: .23 }, image: { action: "remove" }, saveSlot: { slot: 2, name: "Pixels" } });
    for (let slot = 3; slot <= 6; slot++) await host.harness.callRpc("apply", { settings: defaults, image: keep, saveSlot: { slot, name: `Preset ${slot}` } });
    host = await host.harness.reload(plugin);
    const restored = await host.harness.callRpc("activateSlot", { slot: 1 }) as Snapshot;
    assert.equal(restored.slots.length, 6);
    assert.equal(restored.image?.version, originalVersion);
    const switched = await host.harness.callRpc("activateSlot", { slot: 2 }) as Snapshot;
    assert.equal(switched.image, null); assert.equal(switched.settings.intensity, .23);
    // Replace a slot without changing its number or other slots.
    const overwritten = await host.harness.callRpc("apply", { settings: defaults, image: replace, saveSlot: { slot: 2, name: "New lake" } }) as Snapshot;
    assert.equal(overwritten.slots.length, 6); assert.equal(overwritten.slots[1]?.name, "New lake");
    assert.equal(overwritten.slots[0]?.image?.version, originalVersion);
  } finally { await host.harness.dispose(); }
});

test("invalid image or slot rejects the entire apply without partially changing settings", async () => {
  const host = createFakePluginHost(); plugin(host.bb);
  try {
    await host.harness.callRpc("apply", { settings: defaults, image: replace, saveSlot: { slot: 1, name: "Keep" } });
    const before = await host.harness.callRpc("get", null);
    for (const dataUrl of ["data:image/svg+xml;base64,PHN2Zy8+", "data:image/jpeg;base64,aGVsbG8=", "data:image/png;base64,AAAA", "data:image/png;base64," + "A".repeat(2800000)]) {
      await assert.rejects(host.harness.callRpc("apply", { settings: { ...defaults, enabled: false }, image: { ...replace, dataUrl }, saveSlot: { slot: 1, name: "Wrong" } }));
    }
    for (const slot of [0, 7, 1.5]) await assert.rejects(host.harness.callRpc("apply", { settings: defaults, image: keep, saveSlot: { slot, name: "Invalid" } }));
    for (const patch of [{ intensity: 2 }, { imageOpacity: 1.1 }, { fit: "cover; color:red" }, { enabled: "true" }]) await assert.rejects(host.harness.callRpc("apply", { settings: { ...defaults, ...patch }, image: keep }));
    assert.deepEqual(await host.harness.callRpc("get", null), before);
    await assert.rejects(host.harness.callRpc("activateSlot", { slot: 2 }), /empty/);
  } finally { await host.harness.dispose(); }
});

test("scope stays global across slots; clearing/resetting preserves saved work", async () => {
  const host = createFakePluginHost(); plugin(host.bb);
  try {
    await host.harness.callRpc("apply", { settings: defaults, image: replace, saveSlot: { slot: 1, name: "Photo" } });
    await host.harness.runCli(["new-thread-only", "on"]);
    const use = await host.harness.runCli(["use", "1"]);
    assert.equal(use.exitCode, 0);
    assert.equal(JSON.parse(use.stdout!).settings.newThreadOnly, true);
    const disabled = await host.harness.runCli(["disable"]); assert.equal(JSON.parse(disabled.stdout!).settings.enabled, false);
    const reset = await host.harness.callRpc("reset", null) as Snapshot;
    assert.equal(reset.image, null); assert.equal(reset.slots.length, 1); assert.equal(reset.settings.newThreadOnly, true);
    await host.harness.runCli(["use", "1"]);
    const cleared = await host.harness.callRpc("deleteSlot", { slot: 1 }) as Snapshot;
    assert.equal(cleared.slots.length, 0); assert.equal(cleared.image?.name, "personal.png"); assert.equal(cleared.activeSlot, null);
    assert.equal((await host.harness.runCli(["use", "7"])).exitCode, 1);
    assert.equal((await host.harness.runCli(["new-thread-only", "whatever"])).exitCode, 1);
    assert.equal((await host.harness.runCli(["reset", "extra"])).exitCode, 1);
  } finally { await host.harness.dispose(); }
});
test("image type must match bytes; legacy settings get the new scope default", async () => {
  assert.equal(decodeImage(png).mime, "image/png"); assert.throws(() => decodeImage(png.replace("image/png", "image/jpeg")));
  const host = createFakePluginHost(); plugin(host.bb);
  try {
    const { newThreadOnly, ...legacy } = defaults;
    host.bb.storage.database().prepare("UPDATE background SET settings = ? WHERE id = 1").run(JSON.stringify(legacy));
    assert.equal((await host.harness.callRpc("get", null) as Snapshot).settings.newThreadOnly, false);
  } finally { await host.harness.dispose(); }
});

test("New thread dimmer toggles without replacing images or saved slots", async () => {
  const host = createFakePluginHost(); plugin(host.bb);
  try {
    const saved = await host.harness.callRpc("apply", { settings: { ...defaults, fade: .4 }, image: replace, saveSlot: { slot: 1, name: "Photo" } }) as Snapshot;
    const off = await host.harness.callRpc("setDimmer", { enabled: false }) as Snapshot;
    assert.equal(off.settings.dimmerEnabled, false);
    assert.equal(off.settings.fade, .4);
    assert.equal(off.image?.version, saved.image?.version);
    assert.equal(off.activeSlot, 1);
    const switched = await host.harness.callRpc("activateSlot", { slot: 1 }) as Snapshot;
    assert.equal(switched.settings.dimmerEnabled, false);
    const on = await host.harness.callRpc("setDimmer", { enabled: true }) as Snapshot;
    assert.equal(on.settings.dimmerEnabled, true); assert.equal(on.settings.fade, .4);
    assert.deepEqual(on.slots, saved.slots);
    await host.harness.callRpc("apply", { settings: { ...defaults, fade: 0 }, image: { action: "keep" } });
    const visible = await host.harness.callRpc("setDimmer", { enabled: true }) as Snapshot;
    assert.equal(visible.settings.fade, 1);
  } finally { await host.harness.dispose(); }
});
