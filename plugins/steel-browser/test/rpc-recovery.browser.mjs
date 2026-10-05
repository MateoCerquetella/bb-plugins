import assert from "node:assert/strict";
import { chromium } from "playwright";

// Opt-in live BB integration test, using the current project's existing Steel browser.
const cdp = new URL(process.env.STEEL_CDP_URL);
const server = new URL(process.env.BB_SERVER_URL);
const projectId = process.env.STEEL_TEST_PROJECT_ID;
assert(projectId, "STEEL_TEST_PROJECT_ID must identify the selected test project");
const version = await (await fetch(new URL("/json/version", cdp))).json();
const ws = new URL(version.webSocketDebuggerUrl);
ws.host = cdp.host;
const browser = await chromium.connectOverCDP(ws.href);
try {
  for (const width of [1280, 390]) {
    const page = await browser.contexts()[0].newPage();
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    const counts = {};
    const held = [];
    let mode = "first-stalled";
    await page.addInitScript(id => sessionStorage.setItem("steel-browser:selected-project", id), projectId);
    await page.route("http://steel-bb-test.test/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const method = url.pathname.match(/^\/api\/v1\/plugins\/steel-browser\/rpc\/(project|dashboard)$/)?.[1];
      if (method) {
        counts[method] = (counts[method] || 0) + 1;
        assert.deepEqual(JSON.parse(request.postData()), { projectId });
        if (mode === "all-stalled" || (mode === "first-stalled" && counts[method] === 1)) {
          held.push(route);
          return;
        }
      }
      try {
        const response = await fetch(new URL(`${url.pathname}${url.search}`, server), {
          method: request.method(),
          headers: { "content-type": request.headers()["content-type"] || "application/json" },
          body: request.postDataBuffer() || undefined,
          signal: AbortSignal.timeout(15000),
        });
        await route.fulfill({
          status: response.status,
          body: Buffer.from(await response.arrayBuffer()),
          contentType: response.headers.get("content-type") || "application/octet-stream",
        });
      } catch {
        await route.abort().catch(() => {});
      }
    });
    const dashboard = page.locator("main.steel-page");
    try {
      await page.goto("http://steel-bb-test.test/plugins/steel-browser/steel-browser", { waitUntil: "domcontentloaded" });
      await dashboard.getByText("Preparing project browser...", { exact: true }).first().waitFor();
      assert.equal(await dashboard.getByRole("alert").count(), 0, "loading has no empty red error bar");
      await dashboard.getByText("Connected", { exact: true }).waitFor({ timeout: 25000 });
      await dashboard.getByRole("combobox", { name: "Browser engine" }).waitFor();
      assert.equal(await dashboard.getByRole("combobox", { name: "Browser engine" }).isDisabled(), false);
      assert.equal(counts.dashboard, 2);
      assert.equal(counts.project, 2);
      assert.equal(await dashboard.getByTitle("Live Steel browser", { exact: true }).count(), 1);
      assert.equal(await dashboard.getByRole("button", { name: "New session", exact: true }).isDisabled(), true);
      assert.equal(await dashboard.getByRole("alert").count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (process.env.BB_THREAD_STORAGE) await page.screenshot({
        path: `${process.env.BB_THREAD_STORAGE}/steel-rpc-recovered-${width}.png`,
      });
      console.log(`PASS ${width}: actual BB frontend retries stalled reads, shows project and existing session`);

      if (width === 1280) {
        mode = "all-stalled";
        await page.reload({ waitUntil: "domcontentloaded" });
        await dashboard.locator(".steel-error").filter({ hasText: "BB did not respond" }).waitFor({ timeout: 40000 });
        assert.equal(await dashboard.getByRole("button", { name: "Refresh Steel" }).isDisabled(), false);
        assert.equal(await dashboard.getByText("Preparing project browser...", { exact: true }).count(), 0);
        mode = "healthy";
        await dashboard.getByRole("button", { name: "Refresh Steel" }).click();
        await dashboard.getByRole("button", { name: "Retry project settings" }).click();
        await dashboard.getByText("Connected", { exact: true }).waitFor();
        await dashboard.getByRole("combobox", { name: "Browser engine" }).waitFor();
        assert.equal(await dashboard.getByRole("combobox", { name: "Browser engine" }).isDisabled(), false);
        assert.equal(await dashboard.getByRole("alert").count(), 0);
        // Late responses from timed-out requests cannot overwrite the recovered state.
        for (const route of held.splice(0)) await route.fulfill({ status: 500,
          contentType: "application/json", body: '{"ok":false,"error":"late failure"}' }).catch(() => {});
        await page.waitForTimeout(200);
        assert.equal(await dashboard.getByRole("alert").count(), 0);
        console.log("PASS permanent stall: bounded error, enabled retry, recovery, late-response isolation");
      }
      assert.deepEqual(errors, []);
    } finally {
      for (const route of held) await route.abort().catch(() => {});
      await page.close();
    }
  }
} finally {
  await browser.close();
}
