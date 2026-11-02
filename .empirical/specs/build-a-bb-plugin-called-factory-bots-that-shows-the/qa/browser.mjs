// Deterministic browser evidence for Factory Bots. The plugin and BB run for
// real; only the two read-only RPC responses are fixed so the screenshots do
// not depend on whether a factory process is currently up.
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const BASE = process.env.BB_SERVER_URL ?? "http://127.0.0.1:38886";
const ARTIFACTS = fileURLToPath(new URL("./artifacts/", import.meta.url));
const PANEL = `${BASE}/plugins/factory-bots/factory-bots`;

const ticket = {
  linearId: "FB-2",
  title: "Render the live tool call",
  stage: "implement",
  bot: "helm",
  feature: "factory-bots",
  conversationId: "201",
  labels: ["factory:auto"],
  worktree: "/tmp/worktrees/fb-2",
  attempts: 2,
  stageAttempts: 1,
  stopReason: null,
  decisions: ["spec accepted", "moved to implement"],
  handoff: { from: "sieve", to: "helm", reason: "spec is observable" },
  lineage: ["7", "201"],
};

const names = ["orchestrator", "sieve", "helm", "lens", "warden", "audit", "lookback"];
const board = {
  ok: true,
  fetchedAt: Date.now(),
  snapshot: {
    bots: 7,
    tickets: 2,
    byStage: [{ stage: "implement", label: "Implement", count: 2 }],
    startedAt: null,
  },
  agents: names.map((name) => ({
    name,
    displayName: name[0].toUpperCase() + name.slice(1),
    conversationId: String(1 + names.indexOf(name) * 6),
    column: name === "helm" ? "In Implementation" : "Triage",
    ticketCount: name === "helm" ? 2 : 0,
    status: name === "helm" ? "working" : "idle",
    statusReason: null,
    statusReasonCount: 0,
    currentWork: name === "helm" ? ticket.title : null,
    taskCount: name === "helm" ? 1 : 0,
  })),
  tickets: [ticket],
  tasks: [
    {
      id: "900",
      kind: "pi.tool",
      status: "running",
      phase: "execute",
      owner: null,
      conversationId: "201",
      blocked: null,
      background: false,
    },
  ],
};

const detail = {
  ok: true,
  fetchedAt: Date.now(),
  ticket,
  transcript: {
    linearId: "FB-2",
    conversationId: "201",
    entries: [
      { kind: "factory.handoff", text: '{"from":"sieve","to":"helm"}' },
      { kind: "pi.assistant", text: "I will run the focused check now. → bash" },
    ],
    live: {
      tools: [
        {
          callId: "call-1",
          name: "bash",
          status: "running",
          output: "npm test\n\n  ✓ board derives seven agents\n  ✓ status is blocked verbatim\n\n  46 passing\n",
        },
        { callId: "call-2", name: "read", status: "done" },
      ],
      generation: { attempt: 1 },
    },
  },
  transcriptError: null,
  transcriptRefetched: true,
};

const offline = {
  ok: false,
  reason: "not-running",
  message: "The Factory MCP could not reach the factory process.",
  startCommand: "node /home/dyaus/Developer/projects/GoEmpirical/empirical-factory/dist/main.js up",
  fetchedAt: Date.now(),
};

function rpcBody(result) {
  return { ok: true, result };
}

async function mock(page, method, result, hits, options = {}) {
  await page.route(`**/api/v1/plugins/factory-bots/rpc/${method}`, async (request) => {
    hits.count += 1;
    if (options.track !== undefined) {
      options.track.active += 1;
      options.track.max = Math.max(options.track.max, options.track.active);
    }
    try {
      if (options.delayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
      await request.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(rpcBody(result)),
      });
    } finally {
      if (options.track !== undefined) options.track.active -= 1;
    }
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await mkdir(ARTIFACTS, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
  });

  const boardHits = { count: 0 };
  const boardTrack = { active: 0, max: 0 };
  await mock(page, "getBoard", board, boardHits, { delayMs: 1_500, track: boardTrack });
  await page.goto(PANEL, { waitUntil: "domcontentloaded" });
  await page.locator(".fb-grid").waitFor();
  const cards = page.locator(".fb-card");
  assert((await cards.count()) === 7, "expected seven agent cards");
  assert((await page.locator(".fb-status--working").count()) === 1, "expected one working agent");
  assert((await page.locator(".fb-header").innerText()).includes("7"), "header lost the agent count");

  // Wait until the second 5s board read is in flight, then change route.
  // With the lifetime loop the new route queues behind it; a per-route effect
  // would start a second board read and push max above one.
  await page.waitForTimeout(6_000);
  assert(boardHits.count >= 2, "the board did not refresh after 5s");
  await page.locator(".fb-root").screenshot({ path: `${ARTIFACTS}board.png` });
  const ticketHits = { count: 0 };
  await mock(page, "getTicket", detail, ticketHits);
  await page.getByRole("button", { name: /^Helm,/ }).click();
  await page.waitForTimeout(600);
  assert(boardTrack.max === 1, `board reads overlapped: max ${boardTrack.max}`);
  await page.locator(".fb-ticket-row").first().waitFor();
  await page.locator(".fb-ticket-row").first().click();
  await page.locator(".fb-tool.is-active").waitFor();
  assert((await page.locator(".fb-tool.is-active").innerText()).includes("RUNNING"), "live tool is not highlighted");
  assert((await page.locator(".fb-fields").innerText()).includes("/tmp/worktrees/fb-2"), "worktree is missing");
  await page.waitForTimeout(6_500);
  assert(ticketHits.count >= 2, "the selected ticket did not refresh after 5s");
  await page.locator(".fb-root").screenshot({ path: `${ARTIFACTS}ticket.png` });

  await page.goto(`${PANEL}/agent/lens/ticket/FB-2`, { waitUntil: "domcontentloaded" });
  await page.locator(".fb-wrong-holder").waitFor();
  assert(
    (await page.locator(".fb-wrong-holder").innerText()).includes("helm holds this ticket"),
    "the wrong-owner ticket pane did not explain who holds it",
  );

  const offlinePage = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await mock(offlinePage, "getBoard", offline, { count: 0 });
  await offlinePage.goto(PANEL, { waitUntil: "domcontentloaded" });
  await offlinePage.locator(".fb-failure").waitFor();
  assert((await offlinePage.locator(".fb-header").innerText()).includes("NOT RUNNING"), "offline header is wrong");
  assert((await offlinePage.locator(".fb-root").innerText()).includes("dist/main.js up"), "start command is missing");
  await offlinePage.locator(".fb-root").screenshot({ path: `${ARTIFACTS}not-running.png` });

  console.log(`factory-bots browser evidence written to ${ARTIFACTS}`);
} finally {
  await browser.close();
}
