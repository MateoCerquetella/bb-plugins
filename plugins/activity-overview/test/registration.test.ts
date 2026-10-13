import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { ActivityOverview } from "../component.tsx";

test("the app registers the dashboard on New Thread and preserves existing entry points", () => {
  const source = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const registrations = new Map<string, { id: string; component: unknown }>();
  const exports: { default?: (app: unknown) => void } = {};
  const require = (id: string) => {
    if (id === "@get-bb/plugin-sdk/app") return { definePluginApp: (setup: unknown) => setup };
    if (id === "./component") return { ActivityOverview };
    if (id === "./app.css") return {};
    throw new Error(`Unexpected import: ${id}`);
  };
  new Function("require", "exports", compiled)(require, exports);
  exports.default!({
    slots: Object.fromEntries(["homepageSection", "settingsSection", "threadPanelAction"]
      .map(slot => [slot, (registration: { id: string; component: unknown }) => {
        assert.equal(registrations.has(slot), false);
        registrations.set(slot, registration);
      }])),
  });
  for (const slot of ["homepageSection", "settingsSection", "threadPanelAction"]) {
    assert.equal(registrations.get(slot)?.id, "activity-overview");
    assert.equal(registrations.get(slot)?.component, ActivityOverview);
  }
});
