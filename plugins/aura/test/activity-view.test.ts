import assert from "node:assert/strict";
import test, { after } from "node:test";
import { JSDOM } from "jsdom";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { installTestPluginRuntime, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { CHANGED, defaults } from "../lib/model.ts";
import type { ActivityResult } from "../lib/activity.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://bb.test/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
installTestPluginRuntime();
const { ActivityOverview } = await import("../lib/activity-view.tsx");
after(() => dom.window.close());
const snapshot = (enabled: boolean) => ({ settings: { ...defaults, activityOverview: enabled }, image: null, slots: [], activeSlot: null });
const ready = (value: number): ActivityResult => ({ status: "ready", message: null, data: {
  login: "someone", from: "2026-03-01T00:00:00Z", to: "2026-03-01T12:00:00Z", fetchedAt: "2026-03-01T12:00:00Z", repository: null,
  repositories: ["owner/project"], repositoryListTruncated: false, contributions: value, opened: value, merged: value, reviews: value,
  days: [{ date: "2026-03-01", contributionCount: value }], notes: [],
  links: { pullRequests: "https://github.com/pulls?q=author%3Asomeone", reviewRequests: "https://github.com/pulls?q=review-requested%3Asomeone" },
} });

test("default-off never requests activity; enabling loads and stale period responses cannot replace newer scope", async () => {
  let enabled = false;
  const pending: { input: unknown; resolve: (value: ActivityResult) => void }[] = [];
  const slot = renderSlot({ component: ActivityOverview }, {}, { rpc: {
    get: () => snapshot(enabled),
    activity: input => new Promise<ActivityResult>(resolve => pending.push({ input, resolve })),
  } });
  try {
    await waitFor(() => assert.ok(slot.container.querySelector('.aura-activity-slot[hidden]')));
    assert.equal(pending.length, 0);
    enabled = true; await slot.emitRealtime(CHANGED, null);
    await waitFor(() => assert.equal(pending.length, 1));
    fireEvent.change(slot.getByLabelText("Activity period"), { target: { value: "month" } });
    await waitFor(() => assert.equal(pending.length, 2));
    assert.deepEqual(pending[1].input, { period: "month", repository: null });
    await act(async () => pending[0].resolve(ready(111)));
    assert.ok(slot.getByText("Loading GitHub activity…")); assert.equal(slot.queryAllByText("111").length, 0);
    await act(async () => pending[1].resolve(ready(222)));
    assert.equal(slot.getAllByText("222").length, 4);
    assert.ok(slot.getByRole("region", { name: "Dated contribution calendar, scroll horizontally" }));
    assert.equal(slot.getByText("Your open PRs").getAttribute("href"), ready(222).data!.links.pullRequests);
    enabled = false; await slot.emitRealtime(CHANGED, null);
    assert.ok(slot.container.querySelector('.aura-activity-slot[hidden]'));
    assert.equal(slot.queryByText("222"), null);
  } finally { slot.unmount(); }
});

test("failed and unavailable requests omit counts; retry recovers; verified empty differs from error", async () => {
  let response: ActivityResult = { status: "unavailable", message: "GitHub authentication unavailable", data: null };
  const slot = renderSlot({ component: ActivityOverview }, {}, { rpc: { get: () => snapshot(true), activity: () => response } });
  try {
    await slot.findByText("GitHub authentication unavailable"); assert.equal(slot.queryByLabelText("GitHub activity metrics"), null);
    response = { status: "error", message: "Could not refresh GitHub", data: null };
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await slot.findByRole("alert"); assert.equal(slot.queryByText("0"), null);
    response = ready(0); fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await slot.findByText("No GitHub activity in this period."); assert.equal(slot.getAllByText("0").length, 4);
    response = { ...ready(7), status: "partial", data: { ...ready(7).data!, contributions: null, days: null, notes: ["Repository calendar unavailable"] } };
    fireEvent.change(slot.getByLabelText("Activity repository"), { target: { value: "owner/project" } });
    await slot.findByText("Calendar unavailable for this scope."); assert.ok(slot.getByText("Patterns unavailable."));
    assert.ok(slot.getByText("Unavailable")); assert.equal(slot.queryByRole("region", { name: "Dated contribution calendar, scroll horizontally" }), null);
  } finally { slot.unmount(); }
});

test("unmount ignores a late source result and leaves native composer state untouched", async () => {
  let finish: (value: ActivityResult) => void = () => {};
  const slot = renderSlot({ component: ActivityOverview }, {}, { rpc: { get: () => snapshot(true), activity: () => new Promise<ActivityResult>(resolve => { finish = resolve; }) }, composer: { text: "Keep my draft" } });
  await slot.findByText("Loading GitHub activity…");
  slot.unmount(); await act(async () => finish(ready(987)));
  assert.equal(slot.container.textContent, "");
  assert.equal(slot.composer.text, "Keep my draft"); assert.equal(slot.composer.focusCount, 0);
});
