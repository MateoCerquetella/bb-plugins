import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrowserContext, Page } from "playwright";
import { executeBrowserAction, parseBrowserAction, projectPages, selectProjectPage } from "../actions.ts";

test("browser commands accept bounded actions and reject ambiguous input", () => {
  assert.deepEqual(parseBrowserAction("tabs", []), { kind: "tabs" });
  assert.deepEqual(parseBrowserAction("inspect", []), { kind: "inspect", tab: undefined });
  assert.deepEqual(parseBrowserAction("click", ["button", "Submit"]), {
    kind: "click",
    role: "button",
    name: "Submit",
    tab: undefined,
  });
  assert.deepEqual(parseBrowserAction("fill", ["textbox", "Search", "query"]), {
    kind: "fill",
    role: "textbox",
    name: "Search",
    value: "query",
    tab: undefined,
  });
  assert.deepEqual(parseBrowserAction("press", ["Enter"]), {
    kind: "press",
    key: "Enter",
    tab: undefined,
  });
  assert.deepEqual(parseBrowserAction("screenshot", []), {
    kind: "screenshot",
    tab: undefined,
  });
  assert.deepEqual(parseBrowserAction("inspect", ["--tab", "1"]), { kind: "inspect", tab: 1 });
  assert.deepEqual(parseBrowserAction("click", ["button", "Submit", "--tab", "0"]), {
    kind: "click", role: "button", name: "Submit", tab: 0,
  });
  assert.throws(() => parseBrowserAction("inspect", ["--tab", "-1"]), /Invalid tab index/);
  assert.throws(() => parseBrowserAction("tabs", ["--tab", "0"]), /Use tabs/);
  assert.throws(
    () => parseBrowserAction("click", ["button", ""]),
    /Use tabs/,
  );
  assert.throws(
    () => parseBrowserAction("click", ["script", "Submit"]),
    /Use tabs/,
  );
  assert.throws(
    () => parseBrowserAction("fill", ["button", "Submit", "text"]),
    /Use tabs/,
  );
  assert.throws(
    () => parseBrowserAction("fill", ["textbox", "Search", "x".repeat(8001)]),
    /Use tabs/,
  );
});

test("newest open tab is the default and earlier tabs remain addressable", () => {
  const first = { isClosed: () => false } as Page;
  const closed = { isClosed: () => true } as Page;
  const popup = { isClosed: () => false } as Page;
  const context = { pages: () => [first, closed, popup] } as unknown as BrowserContext;
  assert.deepEqual(projectPages(context), [first, popup]);
  assert.equal(selectProjectPage(context), popup);
  assert.equal(selectProjectPage(context, 0), first);
  assert.throws(() => selectProjectPage(context, 2), /Tab 2 is unavailable/);
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
