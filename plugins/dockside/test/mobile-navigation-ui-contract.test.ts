import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL(
  "../components/mobile/navigation.tsx",
  import.meta.url,
);
const stylesUrl = new URL(
  "../components/mobile/navigation.css",
  import.meta.url,
);

test("mobile navigation mounts Dockside's live semantic palette", async () => {
  const component = await readFile(componentUrl, "utf8");
  assert.match(component, /useSettings\(\)/);
  assert.match(component, /resolveDocksidePreferences\(settings.values\)/);
  assert.match(component, /style=\{docksidePreferenceStyle\(preferences\)/);
});

test("mobile and family glyphs retain the action's distinct artwork", async () => {
  const glyph = await readFile(new URL("../components/inbox/status-glyph.tsx", import.meta.url), "utf8");
  const family = await readFile(new URL("../components/inbox/family-status.tsx", import.meta.url), "utf8");
  assert.match(glyph, /workingActivityPresentation\(role\)\.icon/);
  assert.match(family, /name=\{status.icon\}/);
});

test("the mobile navigation strip owns its pointer gesture without blocking vertical scroll", async () => {
  const [component, styles] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  for (const handler of [
    "onPointerDown",
    "onPointerMove",
    "onPointerUp",
    "onPointerCancel",
    "onTouchStart",
    "onTouchMove",
    "onTouchEnd",
    "onTouchCancel",
  ]) {
    const start = component.indexOf(`${handler}={`);
    assert.notEqual(start, -1, `${handler} must remain registered`);
    const body = component.slice(start, start + 260);
    assert.match(
      body,
      /event\.stopPropagation\(\)/,
      `${handler} must keep BB's sidebar recognizer from seeing the strip gesture`,
    );
    assert.doesNotMatch(
      body,
      /event\.preventDefault\(\)/,
      `${handler} must not suppress native vertical scrolling`,
    );
  }

  assert.match(styles, /\.tg-swipe\s*\{[^}]*touch-action:\s*pan-y;/s);
});
