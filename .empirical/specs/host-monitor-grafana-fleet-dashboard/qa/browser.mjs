import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const npmRoot = execFileSync("npm", ["root", "--global"], { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(join(npmRoot, "playwright", "index.mjs")).href);
const expectedMachines = JSON.parse(execFileSync("bb", ["machine", "list", "--json"], { encoding: "utf8" }));
const expectedTotal = expectedMachines.length;
const expectedConnected = expectedMachines.filter((machine) => machine.status === "connected").length;
const expectedSummary = `${expectedConnected}/${expectedTotal}`;
const baseUrl = process.env.BB_SERVER_URL ?? "http://127.0.0.1:38886";
const output = ".empirical/specs/host-monitor-grafana-fleet-dashboard/qa";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let historyRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/rpc/machineHistory")) historyRequests += 1;
  });
  await page.goto(`${baseUrl}/plugins/host-monitor/host-monitor`, { waitUntil: "domcontentloaded" });
  const cards = page.locator('button[aria-label^="Open dashboard for"]');
  await cards.first().waitFor({ state: "visible", timeout: 20_000 });
  if (await cards.count() !== expectedTotal) throw new Error(`Expected ${expectedTotal} machine cards`);
  await page.getByText(expectedSummary, { exact: true }).nth(1).waitFor({ state: "visible", timeout: 20_000 });

  const alternateCard = page.locator('button[aria-label^="Open dashboard for"][aria-pressed="false"]').first();
  const selectedMachine = await alternateCard.locator("header strong").innerText();
  await alternateCard.click();
  await page.locator(".host-monitor__machine-heading h2").getByText(selectedMachine, { exact: true }).waitFor();
  const filterName = expectedMachines.at(-1)?.name ?? "";
  await page.getByPlaceholder("Name, id, or platform").fill(filterName);
  if (await cards.count() !== 1) throw new Error("Machine search did not filter to one card");
  await page.locator(".host-monitor__toolbar select").selectOption("1");
  const historyRequestsBeforeRefresh = historyRequests;
  await page.getByRole("button", { name: "Refresh all" }).click();
  for (let attempt = 0; attempt < 40 && historyRequests <= historyRequestsBeforeRefresh; attempt += 1) {
    await page.waitForTimeout(100);
  }
  if (historyRequests <= historyRequestsBeforeRefresh) throw new Error("Refresh all did not reload selected history");
  await page.getByRole("button", { name: "Refresh all" }).waitFor({ state: "visible", timeout: 20_000 });
  if (await page.locator('[data-sonner-toast], [role="alert"]').count() !== 0) throw new Error("Notification UI appeared");
  await page.getByPlaceholder("Name, id, or platform").fill("");
  await page.screenshot({ path: `${output}/grafana-fleet-desktop.png`, fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 1000 } });
  await mobile.goto(`${baseUrl}/plugins/host-monitor/host-monitor`, { waitUntil: "domcontentloaded" });
  await mobile.locator('button[aria-label^="Open dashboard for"]').first().waitFor({ state: "visible", timeout: 20_000 });
  await mobile.screenshot({ path: `${output}/grafana-fleet-mobile.png`, fullPage: true });

  process.stdout.write(JSON.stringify({
    expectedConnected,
    expectedTotal,
    machineCards: await cards.count(),
    selectedMachine,
    historyRangeHours: 1,
    historyRequests,
    notificationSurfaces: 0,
  }) + "\n");
} finally {
  await browser.close();
}
