import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agentRoute,
  boardRoute,
  capabilitiesRoute,
  parsePanelRoute,
  soulsRoute,
  ticketRoute,
} from "../lib/route.js";

test("the empty sub-path is the factories view", () => {
  assert.deepEqual(parsePanelRoute(""), { view: "factories" });
  assert.deepEqual(parsePanelRoute("/"), { view: "factories" });
});

test("a factory segment alone, or with an unknown rest, is that factory's board", () => {
  assert.deepEqual(parsePanelRoute("local"), { factoryId: "local", view: "board" });
  assert.deepEqual(parsePanelRoute("bandely/unknown/thing"), { factoryId: "bandely", view: "board" });
  assert.deepEqual(parsePanelRoute("local/chat"), { factoryId: "local", view: "board" });
});

test("souls and capabilities live under their factory", () => {
  assert.deepEqual(parsePanelRoute("local/souls"), { factoryId: "local", view: "souls" });
  assert.deepEqual(parsePanelRoute("/local/capabilities"), { factoryId: "local", view: "capabilities" });
  assert.equal(soulsRoute("local"), "local/souls");
  assert.equal(capabilitiesRoute("bandely"), "bandely/capabilities");
});

test("an agent route keeps the factory and the agent's name", () => {
  assert.deepEqual(parsePanelRoute("local/agent/sieve"), {
    factoryId: "local",
    view: "agent",
    agent: "sieve",
  });
});

test("a ticket route keeps the factory and both ids", () => {
  assert.deepEqual(parsePanelRoute("local/agent/helm/ticket/FB-2"), {
    factoryId: "local",
    view: "ticket",
    agent: "helm",
    linearId: "FB-2",
  });
  assert.equal(ticketRoute("local", "helm", "FB-2"), "local/agent/helm/ticket/FB-2");
});

test("routes are encoded and decoded symmetrically", () => {
  const agent = "look back/special";
  const ticket = "FB 2/ä";
  const route = parsePanelRoute(ticketRoute("my factory", agent, ticket));
  assert.deepEqual(route, { factoryId: "my factory", view: "ticket", agent, linearId: ticket });
  assert.equal(agentRoute("local", agent), "local/agent/look%20back%2Fspecial");
  assert.equal(boardRoute("my factory"), "my%20factory");
});

test("a malformed escape does not throw", () => {
  assert.deepEqual(parsePanelRoute("local/agent/%E0%A4%A"), {
    factoryId: "local",
    view: "agent",
    agent: "%E0%A4%A",
  });
});

test("a missing ticket id falls back to the agent", () => {
  assert.deepEqual(parsePanelRoute("local/agent/helm/ticket/"), {
    factoryId: "local",
    view: "agent",
    agent: "helm",
  });
});
