import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { statusColorRole } from "../lib/status-presentation.ts";

describe("statusColorRole", () => {
  it("separates error, waiting, unread, working, and idle roles", () => {
    assert.equal(statusColorRole("unread-error"), "error");
    assert.equal(statusColorRole("waiting-for-input"), "waiting");
    assert.equal(statusColorRole("unread-success"), "unread");
    assert.equal(statusColorRole("runtime"), "working");
    assert.equal(statusColorRole("workflow"), "workflow");
    assert.equal(statusColorRole("background-agent"), "agent");
    assert.equal(statusColorRole("background-command"), "command");
    assert.equal(statusColorRole("plan-mode"), "plan");
    assert.equal(statusColorRole("goal"), "goal");
    assert.equal(statusColorRole("draft"), "inactive");
    assert.equal(statusColorRole("working-draft"), "inactive");
    assert.equal(statusColorRole("none"), null);
  });
});
