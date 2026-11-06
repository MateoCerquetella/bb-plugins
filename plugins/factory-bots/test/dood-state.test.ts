import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  BOX_EVERY_MS,
  boxCountdown,
  grantGift,
  loadAgentDood,
  openAgentBox,
  saveAgentDood,
} from "../lib/dood-state";
import { wearItem } from "../lib/wear-items";

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const store = new Map<string, string>();

function installStorage(): void {
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

beforeEach(() => {
  store.clear();
  installStorage();
});

afterEach(() => {
  if (original === undefined) delete (globalThis as { localStorage?: Storage }).localStorage;
  else Object.defineProperty(globalThis, "localStorage", original);
});

test("an agent starts with nothing until it is given something", () => {
  assert.deepEqual(loadAgentDood("sieve"), {
    fed: 0,
    owned: [],
    outfit: {},
    boxes: 1,
  });
});

test("a treat and a gift survive the next visit", () => {
  saveAgentDood("sieve", {
    fed: 3,
    owned: ["party", "round"],
    outfit: { hat: "party", glasses: "round" },
    boxes: 2,
  });
  assert.deepEqual(loadAgentDood("sieve"), {
    fed: 3,
    owned: ["party", "round"],
    outfit: { hat: "party", glasses: "round" },
    boxes: 2,
  });
});

test("stale or hand-edited storage cannot give it a thing that does not exist", () => {
  store.set(
    "factory-bots:dood:sieve",
    JSON.stringify({
      fed: -4,
      owned: ["party", "not-a-real-item", "party", 7],
      outfit: { hat: "party", glasses: "not-a-real-item" },
    }),
  );
  assert.deepEqual(loadAgentDood("sieve"), {
    fed: 0,
    owned: ["party"],
    outfit: { hat: "party" },
    boxes: 1,
  });

  store.set("factory-bots:dood:sieve", "{not json");
  assert.deepEqual(loadAgentDood("sieve"), {
    fed: 0,
    owned: [],
    outfit: {},
    boxes: 1,
  });
});

test("a new creature starts with one gift waiting", () => {
  const dood = loadAgentDood("sieve");
  assert.equal(dood.boxes, 1);
  assert.equal(boxCountdown(dood, 1_000).ready, true);
});

test("opening the box starts the six-hour wait, then a new one turns up", () => {
  const start = 10_000;
  const opened = openAgentBox(
    { fed: 0, owned: [], outfit: {}, boxes: 1 },
    start,
    () => 0,
  );
  assert.ok(opened);
  assert.equal(opened.dood.boxes, 0);
  assert.equal(opened.dood.nextBoxAt, start + BOX_EVERY_MS);
  assert.deepEqual(opened.dood.owned, [opened.item.id]);
  assert.equal(boxCountdown(opened.dood, start + 1_000).ready, false);

  const due = boxCountdown(opened.dood, start + BOX_EVERY_MS);
  assert.equal(due.ready, true);
  assert.equal(due.due.boxes, 1);
  assert.equal(due.due.nextBoxAt, undefined);
});

test("a found gift consumes a box and can be worn", () => {
  const item = wearItem("party");
  assert.ok(item);
  const next = grantGift(
    { fed: 0, owned: [], outfit: {}, boxes: 1 },
    item,
    true,
    50_000,
  );
  assert.equal(next.boxes, 0);
  assert.equal(next.nextBoxAt, 50_000 + BOX_EVERY_MS);
  assert.deepEqual(next.owned, ["party"]);
  assert.deepEqual(next.outfit, { hat: "party" });
});
