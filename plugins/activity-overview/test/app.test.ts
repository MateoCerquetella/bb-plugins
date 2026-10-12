import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ActivityOverview } from "../component.tsx";

test("period and repository selectors update the rendered summary", async () => {
  const dom = new JSDOM("<div id=\"root\"></div>");
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.getElementById("root")!;
  const root = createRoot(container);
  await act(async () => root.render(createElement(ActivityOverview)));

  const [period, repository] = Array.from(container.querySelectorAll("select"));
  assert.match(container.textContent ?? "", /1284/);
  await act(async () => {
    period!.value = "month";
    period!.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    repository!.value = "taskboard";
    repository!.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });

  assert.equal(period!.value, "month");
  assert.equal(repository!.value, "taskboard");
  assert.match(container.textContent ?? "", /38 contributions in selected period/);
  assert.match(container.textContent ?? "", /Branch is 14 days old/);
  await act(async () => root.unmount());
  dom.window.close();
});
