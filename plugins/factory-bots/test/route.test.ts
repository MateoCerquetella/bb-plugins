import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agentRoute,
  parsePanelRoute,
  ticketRoute,
} from "../lib/route.js";

test("the empty sub-path is the board", () => {
  assert.deepEqual(parsePanelRoute(""), { view: "board" });
  assert.deepEqual(parsePanelRoute("/"), { view: "board" });
  assert.deepEqual(parsePanelRoute("unknown/thing"), { view: "board" });
});

test("the removed chat route falls back to the board", () => {
  assert.deepEqual(parsePanelRoute("chat"), { view: "board" });
});

test("the souls route is its own view", () => {
  assert.deepEqual(parsePanelRoute("souls"), { view: "souls" });
});

test("an agent route keeps the factory's name", () => {
  assert.deepEqual(parsePanelRoute("agent/sieve"), {
    view: "agent",
    agent: "sieve",
  });
});

test("a ticket route keeps both ids", () => {
  assert.deepEqual(parsePanelRoute("agent/helm/ticket/FB-2"), {
    view: "ticket",
    agent: "helm",
    linearId: "FB-2",
  });
});

test("routes are encoded and decoded symmetrically", () => {
  const agent = "look back/special";
  const ticket = "FB 2/ä";
  const route = parsePanelRoute(ticketRoute(agent, ticket));
  assert.deepEqual(route, { view: "ticket", agent, linearId: ticket });
  assert.equal(agentRoute(agent), "agent/look%20back%2Fspecial");
});

test("a malformed escape does not throw", () => {
  assert.deepEqual(parsePanelRoute("agent/%E0%A4%A"), {
    view: "agent",
    agent: "%E0%A4%A",
  });
});

test("a missing ticket id falls back to the agent", () => {
  assert.deepEqual(parsePanelRoute("agent/helm/ticket/"), {
    view: "agent",
    agent: "helm",
  });
});

test("parses the capability route", () => {
  assert.deepEqual(parsePanelRoute("/capabilities"), { view: "capabilities" });
});
