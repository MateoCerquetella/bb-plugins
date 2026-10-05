import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright";
import { executeBrowserAction, parseBrowserAction } from "../actions.ts";

test("browser commands accept bounded actions and reject ambiguous input", () => {
  assert.deepEqual(parseBrowserAction("inspect", []), { kind: "inspect" });
  assert.deepEqual(parseBrowserAction("click", ["button", "Submit"]), {
    kind: "click",
    role: "button",
    name: "Submit",
  });
  assert.deepEqual(parseBrowserAction("fill", ["textbox", "Search", "query"]), {
    kind: "fill",
    role: "textbox",
    name: "Search",
    value: "query",
  });
  assert.deepEqual(parseBrowserAction("press", ["Enter"]), {
    kind: "press",
    key: "Enter",
  });
  assert.deepEqual(parseBrowserAction("screenshot", []), {
    kind: "screenshot",
  });
  assert.throws(
    () => parseBrowserAction("click", ["button", ""]),
    /Use inspect/,
  );
  assert.throws(
    () => parseBrowserAction("click", ["script", "Submit"]),
    /Use inspect/,
  );
  assert.throws(
    () => parseBrowserAction("fill", ["button", "Submit", "text"]),
    /Use inspect/,
  );
  assert.throws(
    () => parseBrowserAction("fill", ["textbox", "Search", "x".repeat(8001)]),
    /Use inspect/,
  );
});

test("remote actions select exactly one accessible target and return the current page", async () => {
  let clicks = 0;
  let filled = "";
  const page = {
    url: () => "https://example.com/",
    title: async () => "Example",
    locator: () => ({
      ariaSnapshot: async () => '- heading "Example"\n'.repeat(3000),
    }),
    getByRole: (_role: string, options: { name: string; exact: boolean }) => {
      assert.deepEqual(options, { name: "Search", exact: true });
      return {
        count: async () => 1,
        click: async () => {
          clicks++;
        },
        fill: async (value: string) => {
          filled = value;
        },
      };
    },
    keyboard: { press: async (key: string) => assert.equal(key, "Enter") },
    screenshot: async () => Buffer.from("png"),
  } as unknown as Page;
  const inspected = await executeBrowserAction(page, { kind: "inspect" });
  assert.equal(inspected.truncated, true);
  assert.equal(inspected.snapshot?.length, 40000);
  assert.deepEqual(
    await executeBrowserAction(page, {
      kind: "click",
      role: "button",
      name: "Search",
    }),
    { url: "https://example.com/", title: "Example" },
  );
  await executeBrowserAction(page, {
    kind: "fill",
    role: "textbox",
    name: "Search",
    value: "hello",
  });
  await executeBrowserAction(page, { kind: "press", key: "Enter" });
  assert.equal(clicks, 1);
  assert.equal(filled, "hello");
  assert.equal(
    (await executeBrowserAction(page, { kind: "screenshot" })).base64,
    "cG5n",
  );
});

test("ambiguous targets fail without clicking", async () => {
  const page = {
    getByRole: () => ({
      count: async () => 2,
      click: () => assert.fail("must not click"),
    }),
  } as unknown as Page;
  await assert.rejects(
    executeBrowserAction(page, {
      kind: "click",
      role: "button",
      name: "Search",
    }),
    /found 2/,
  );
});
