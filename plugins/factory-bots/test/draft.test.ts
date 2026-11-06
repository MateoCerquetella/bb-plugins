import assert from "node:assert/strict";
import test from "node:test";

import {
  draftIsUnsaved,
  parseDraft,
  readAuthor,
  readDraft,
  removeDraft,
  writeAuthor,
  writeDraft,
} from "../lib/draft.ts";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("parses valid drafts and ignores malformed storage", () => {
  assert.deepEqual(
    parseDraft('{"text":"new","base":"old","updatedAt":3}'),
    { text: "new", base: "old", updatedAt: 3 },
  );
  assert.equal(parseDraft("not json"), null);
  assert.equal(parseDraft('{"text":"new"}'), null);
});

test("keeps per-bot drafts and the session author", () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  const previous = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: local,
    sessionStorage: session,
  };
  try {
    writeDraft("lens", "draft lens", "stored lens");
    writeDraft("sieve", "draft sieve", "stored sieve");
    assert.equal(readDraft("lens")?.text, "draft lens");
    assert.equal(readDraft("sieve")?.text, "draft sieve");
    removeDraft("lens");
    assert.equal(readDraft("lens"), null);
    assert.equal(readDraft("sieve")?.text, "draft sieve");

    writeAuthor("Mateo");
    assert.equal(readAuthor(), "Mateo");
    assert.equal(session.getItem("factory-souls:author:v1"), "Mateo");

    assert.equal(
      draftIsUnsaved({ text: "new", base: "old", updatedAt: 1 }, "old"),
      true,
    );
    assert.equal(
      draftIsUnsaved({ text: "old", base: "old", updatedAt: 1 }, "old"),
      false,
    );
  } finally {
    if (previous === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = previous;
    }
  }
});
