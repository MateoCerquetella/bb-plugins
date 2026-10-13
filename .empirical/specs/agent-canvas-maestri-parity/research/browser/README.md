# Browser fixture

Bundle `fixture.tsx` from the root using esbuild, serving the generated JS/CSS
with an HTML page that gives the Workbench a full-height flex parent. Navigate
the current project's Steel page to that fixture. The fixture mounts the real
Workbench through SDK testing hooks; live chats, icons and host SDK responses
are mocked and require separate installed-plugin verification.

Run `node .empirical/specs/agent-canvas-maestri-parity/research/browser/check.mjs`
from the root. It resolves `bb steel-browser project`, connects directly to its
current page via CDP, resets only fixture canvas storage, checks interactions,
and writes light/dark/narrow screenshots to `docs/media/`.

Direct page CDP avoids browser-level Playwright attachment stalls observed with
Chromium 154. It keeps the same browser, binding and profile; it launches none.
The live Steel player must be visible before running this check.
