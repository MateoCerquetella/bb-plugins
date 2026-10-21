import assert from "node:assert/strict";
import test from "node:test";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../server.ts";
import { defaults, imageUrl, isAnimatedImage, MAX_GIF_BYTES, type Snapshot } from "../lib/model.ts";
import { decodeImage } from "../lib/image.ts";
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const gif = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
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
    for (const patch of [{ intensity: 2 }, { imageOpacity: 1.1 }, { fit: "cover; color:red" }, { fps: 45 }, { quality: "ultra" }, { pattern: "plaid" }, { dither: "16x16" }, { photoMotion: "spin" }, { enabled: "true" }]) await assert.rejects(host.harness.callRpc("apply", { settings: { ...defaults, ...patch }, image: keep }));
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
test("image type must match bytes; legacy settings get new defaults", async () => {
  assert.equal(decodeImage(png).mime, "image/png"); assert.throws(() => decodeImage(png.replace("image/png", "image/jpeg")));
  const host = createFakePluginHost(); plugin(host.bb);
  try {
    const { newThreadOnly, fps, quality, activityOverview, pattern, dither, photoMotion, ...legacy } = defaults;
    host.bb.storage.database().prepare("UPDATE background SET settings = ? WHERE id = 1").run(JSON.stringify(legacy));
    const settings = (await host.harness.callRpc("get", null) as Snapshot).settings;
    assert.equal(settings.newThreadOnly, false);
    assert.equal(settings.fps, 15);
    assert.equal(settings.quality, "balanced");
    assert.equal(settings.activityOverview, false);
    assert.equal(settings.pattern, "noise");
    assert.equal(settings.dither, "8x8");
    assert.equal(settings.photoMotion, "wave");
  } finally { await host.harness.dispose(); }
});

test("overview is default-off and stays global across slots/reset/reload without changing a saved image", async () => {
  let host = createFakePluginHost({ pluginId: "aura" }); plugin(host.bb);
  try {
    const disabled = await host.harness.callRpc("activity", { period: "year", repository: null }) as { status: string; data: unknown };
    assert.equal(disabled.status, "unavailable"); assert.equal(disabled.data, null);
    const before = await host.harness.callRpc("apply", { settings: defaults, image: replace, saveSlot: { slot: 1, name: "Lake" } }) as Snapshot;
    const on = await host.harness.callRpc("setActivityOverview", { enabled: true }) as Snapshot;
    assert.equal(on.settings.activityOverview, true);
    assert.equal(on.image?.version, before.image?.version);
    assert.equal(on.activeSlot, 1); assert.deepEqual(on.slots, before.slots);
    await host.harness.callRpc("activateSlot", { slot: 1 });
    assert.equal((await host.harness.callRpc("get", null) as Snapshot).settings.activityOverview, true);
    host = await host.harness.reload(plugin);
    assert.equal((await host.harness.callRpc("get", null) as Snapshot).settings.activityOverview, true);
    const reset = await host.harness.callRpc("reset", null) as Snapshot;
    assert.equal(reset.settings.activityOverview, true);
    assert.equal(reset.slots.length, 1);
    const off = await host.harness.runCli(["overview", "off"]);
    assert.equal(JSON.parse(off.stdout!).settings.activityOverview, false);
    assert.equal((await host.harness.runCli(["overview", "maybe"])).exitCode, 1);
    await assert.rejects(host.harness.callRpc("activity", { period: "year", repository: "repo:evil injected" }));
  } finally { await host.harness.dispose(); }
});

test("animation speed and quality persist in saved slots", async () => {
  const host = createFakePluginHost(); plugin(host.bb);
  try {
    const settings = { ...defaults, fps: 60 as const, quality: "sharp" as const };
    const saved = await host.harness.callRpc("apply", { settings, image: keep, saveSlot: { slot: 1, name: "Smooth" } }) as Snapshot;
    assert.equal(saved.slots[0]?.settings.fps, 60);
    assert.equal(saved.slots[0]?.settings.quality, "sharp");
    await host.harness.callRpc("apply", { settings: { ...defaults, fps: 30 }, image: keep });
    const active = await host.harness.callRpc("activateSlot", { slot: 1 }) as Snapshot;
    assert.equal(active.settings.fps, 60);
    assert.equal(active.settings.quality, "sharp");
  } finally { await host.harness.dispose(); }
});

test("versioned images use an immutable private browser cache", async () => {
  const host = createFakePluginHost({ pluginId: "aura" }); plugin(host.bb);
  try {
    const saved = await host.harness.callRpc("apply", { settings: defaults, image: replace }) as Snapshot;
    const response = await host.harness.fetchHttp("GET", `/image?v=${saved.image?.version}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, max-age=31536000, immutable");
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

test("animated GIFs are stored as uploaded, served as GIF and flagged for the animated renderer", async () => {
  const host = createFakePluginHost({ pluginId: "aura" }); plugin(host.bb);
  try {
    const saved = await host.harness.callRpc("apply", { settings: defaults, image: { action: "replace", name: "loop.gif", dataUrl: gif }, saveSlot: { slot: 1, name: "Loop" } }) as Snapshot;
    assert.equal(saved.image?.mime, "image/gif");
    assert.equal(saved.slots[0]?.image?.mime, "image/gif");
    const url = imageUrl(saved.image)!;
    assert.ok(isAnimatedImage(url));
    assert.ok(!isAnimatedImage(imageUrl({ ...saved.image!, mime: "image/png" })));
    const response = await host.harness.fetchHttp("GET", url.replace("/api/v1/plugins/aura/http", ""));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/gif");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(gif.split(",")[1]!, "base64"));
  } finally { await host.harness.dispose(); }
});

test("GIFs must match their bytes and stay within the GIF budget", () => {
  assert.equal(decodeImage(gif).mime, "image/gif");
  const bytes = Buffer.from(gif.split(",")[1]!, "base64");
  const variant = (change: (copy: Buffer) => Buffer) => "data:image/gif;base64," + change(Buffer.from(bytes)).toString("base64");
  assert.throws(() => decodeImage(variant(copy => copy.subarray(0, copy.length - 1))), /do not match/); // missing trailer
  assert.throws(() => decodeImage(variant(copy => { copy.write("GIF90a", 0, "ascii"); return copy; })), /do not match/);
  assert.throws(() => decodeImage(variant(copy => { copy.writeUInt16LE(0, 6); return copy; })), /do not match/);
  assert.throws(() => decodeImage(variant(copy => { copy.writeUInt16LE(4097, 8); return copy; })), /do not match/); // taller than 4096 px
  assert.equal(decodeImage(variant(copy => { copy.writeUInt16LE(4096, 6); return copy; })).mime, "image/gif");
  assert.throws(() => decodeImage(gif.replace("image/gif", "image/png")));
  // A GIF may exceed the 2 MB PNG/JPG budget but not its own.
  const padded = (size: number) => variant(copy => Buffer.concat([copy.subarray(0, copy.length - 1), Buffer.alloc(size - copy.length), Buffer.from([0x3b])]));
  assert.equal(decodeImage(padded(3 * 1024 * 1024)).mime, "image/gif");
  assert.throws(() => decodeImage(padded(MAX_GIF_BYTES + 3)), /up to 8 MB/);
});

test("pattern, dither and photo motion persist in saved slots", async () => {
  const host = createFakePluginHost(); plugin(host.bb);
  try {
    const settings = { ...defaults, pattern: "swirl" as const, dither: "random" as const, photoMotion: "shimmer" as const };
    await host.harness.callRpc("apply", { settings, image: keep, saveSlot: { slot: 1, name: "Swirl" } });
    await host.harness.callRpc("apply", { settings: defaults, image: keep });
    const active = await host.harness.callRpc("activateSlot", { slot: 1 }) as Snapshot;
    assert.equal(active.settings.pattern, "swirl");
    assert.equal(active.settings.dither, "random");
    assert.equal(active.settings.photoMotion, "shimmer");
  } finally { await host.harness.dispose(); }
});
