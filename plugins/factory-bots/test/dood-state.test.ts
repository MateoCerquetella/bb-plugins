import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { loadAgentDood, saveAgentDood } from "../lib/dood-state";

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
  assert.deepEqual(loadAgentDood("sieve"), { fed: 0, owned: [], outfit: {} });
});

test("a treat and a gift survive the next visit", () => {
  saveAgentDood("sieve", {
    fed: 3,
    owned: ["party", "round"],
    outfit: { hat: "party", glasses: "round" },
  });
  assert.deepEqual(loadAgentDood("sieve"), {
    fed: 3,
    owned: ["party", "round"],
    outfit: { hat: "party", glasses: "round" },
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
  });

  store.set("factory-bots:dood:sieve", "{not json");
  assert.deepEqual(loadAgentDood("sieve"), { fed: 0, owned: [], outfit: {} });
});
