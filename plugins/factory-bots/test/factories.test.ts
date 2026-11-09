import assert from "node:assert/strict";
import { test } from "node:test";

import { parseFactories, seedFactories, uniqueFactoryId } from "../lib/factories.js";

const LOCAL = { id: "local", name: "Local", url: "http://127.0.0.1:8080", checkoutPath: "" };

test("the seed is one Local factory on the bundled checkout", () => {
  assert.deepEqual(seedFactories("http://127.0.0.1:9090"), [
    { id: "local", name: "Local", url: "http://127.0.0.1:9090", checkoutPath: "" },
  ]);
});

test("a stored list parses as given", () => {
  const bandely = { id: "bandely", name: "Bandely", url: "http://10.8.0.6:8080", checkoutPath: "/opt/factory" };
  assert.deepEqual(parseFactories([LOCAL, bandely]), [LOCAL, bandely]);
});

test("missing or empty lists read as absent", () => {
  assert.equal(parseFactories(undefined), null);
  assert.equal(parseFactories({}), null);
  assert.equal(parseFactories([]), null);
  assert.equal(parseFactories([{ ...LOCAL, id: "Not A Slug" }]), null);
});

test("one bad stored row never discards the good ones", () => {
  const bandely = { id: "bandely", name: "Bandely", url: "http://10.8.0.6:8080", checkoutPath: "" };
  assert.deepEqual(
    parseFactories([{ ...LOCAL, url: "ftp://factory" }, bandely, { ...bandely, name: "Duplicate id" }]),
    [bandely],
  );
  assert.deepEqual(parseFactories([{ ...LOCAL, addedLater: true }]), [LOCAL]);
});

test("ids are readable slugs that never collide", () => {
  assert.equal(uniqueFactoryId("Bandely Prod", []), "bandely-prod");
  assert.equal(uniqueFactoryId("Fábrica  Ñandú!", []), "fabrica-nandu");
  assert.equal(uniqueFactoryId("Local", ["local"]), "local-2");
  assert.equal(uniqueFactoryId("Local", ["local", "local-2"]), "local-3");
  assert.equal(uniqueFactoryId("!!!", []), "factory");
  const long = "a".repeat(50);
  assert.equal(uniqueFactoryId(long, []), "a".repeat(40));
  assert.equal(uniqueFactoryId(long, ["a".repeat(40)]), `${"a".repeat(38)}-2`);
});
