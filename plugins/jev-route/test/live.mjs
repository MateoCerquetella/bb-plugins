import { chromium } from "playwright";
import assert from "node:assert/strict";

const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(process.env.BB_TEST_URL ?? "http://127.0.0.1:38886", { waitUntil: "domcontentloaded" });
  await page.getByText("New thread", { exact: true }).first().waitFor({ timeout: 20000 });
  await page.locator('button[aria-label^="Provider, model and reasoning"]').click();
  await page.getByText("Jev Routing", { exact: true }).last().waitFor({ timeout: 20000 });
  await page.screenshot({ path: "/tmp/jev-bb-live.png", fullPage: true });
  await page.keyboard.press("Escape");
  if (!process.env.BB_TEST_THREAD_URL) throw new Error("Set BB_TEST_THREAD_URL to a thread with model history");
  await page.goto(process.env.BB_TEST_THREAD_URL, { waitUntil: "domcontentloaded" });
  const badge = page.locator("[data-jev-route-badge]");
  await badge.waitFor({ timeout: 20000 });
  await badge.click();
  const history = page.locator("[data-jev-switch-history]");
  await history.waitFor({ state: "visible" });
  assert.ok(await history.locator(".jev-switch-row").count() <= 8);
  await page.screenshot({ path: "/tmp/jev-history-live.png" });
  await history.getByRole("button", { name: "Close", exact: true }).click();
  await history.waitFor({ state: "hidden" });
  await badge.click();
  await history.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await history.waitFor({ state: "hidden" });
  assert.equal(await page.locator("[data-jev-latest-switch]").count(), 0);
  console.log("PASS: Jev picker entry, thread badge, bounded history, Close, Escape, no stacked history.");
} finally { await browser.close(); }
