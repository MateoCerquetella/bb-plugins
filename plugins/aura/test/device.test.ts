import test from "node:test";
import assert from "node:assert/strict";
import { defaults, DEVICE_KEY, forDevice, readDeviceChoice, writeDeviceChoice, type Snapshot } from "../lib/model.ts";

const image = { version: "a".repeat(24), name: "mac.png", mime: "image/png" as const, bytes: 10 };
const shared: Snapshot = {
  settings: { ...defaults, topbarBackground: true }, image: null, activeSlot: null,
  slots: [{ slot: 2, name: "Mac", settings: { ...defaults, imageOpacity: 0.3, topbarBackground: false }, image }],
};

test("device choice picks a slot, turns Aura off, or follows the shared background", () => {
  assert.equal(forDevice(shared, "shared"), shared);
  assert.equal(forDevice(shared, "off").settings.enabled, false);
  const mac = forDevice(shared, 2);
  assert.deepEqual(mac.image, image);
  assert.equal(mac.settings.imageOpacity, 0.3);
  assert.equal(mac.settings.topbarBackground, true, "global toggles stay global");
  assert.equal(forDevice(shared, 5), shared, "a missing slot falls back to shared");
});

test("device choice persists in localStorage and tolerates junk", () => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  try {
    assert.equal(readDeviceChoice(), "shared");
    writeDeviceChoice(3); assert.equal(readDeviceChoice(), 3);
    writeDeviceChoice("off"); assert.equal(readDeviceChoice(), "off");
    writeDeviceChoice("shared"); assert.equal(store.has(DEVICE_KEY), false);
    store.set(DEVICE_KEY, "9"); assert.equal(readDeviceChoice(), "shared");
  } finally { delete (globalThis as any).localStorage; }
});
