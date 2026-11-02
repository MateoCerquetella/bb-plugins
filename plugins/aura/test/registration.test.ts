import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Settings and the thread-panel action share the Aura editor with the top bar control", async () => {
  const source = await readFile(new URL("../app.tsx", import.meta.url), "utf8");
  assert.match(source, /settingsSection\(\{[^}]*component:\s*BackgroundEditor/s);
  assert.match(source, /threadPanelAction\(\{[^}]*component:\s*BackgroundEditor/s);
  assert.match(source, /experimental_newThreadPanelAction\(\{[^}]*component:\s*BackgroundEditor/s);
  assert.match(source, /aria-label="Top bar background"/);
});
