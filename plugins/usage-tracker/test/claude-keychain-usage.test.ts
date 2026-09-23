import assert from "node:assert/strict";
import test from "node:test";
import {
  isClaudeKeychainService,
  readClaudeUsageFromKeychain,
  type ClaudeKeychainUsageDeps,
} from "../lib/claude-keychain-usage.ts";
import { loadUsageSnapshot, type UsageSdk } from "../lib/load-usage.ts";

const SERVICE = "Claude Code-credentials-80ae27a8";

function credentials(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    claudeAiOauth: {
      accessToken: "token",
      expiresAt: 2_000,
      subscriptionType: "max",
      rateLimitTier: "default_claude_max_20x",
      ...overrides,
    },
  });
}

function deps(
  overrides: Partial<ClaudeKeychainUsageDeps> = {},
): ClaudeKeychainUsageDeps & {
  services: string[];
  tokens: string[];
  urls: string[];
} {
  const services: string[] = [];
  const tokens: string[] = [];
  const urls: string[] = [];
  return {
    services,
    tokens,
    urls,
    platform: "darwin",
    async readKeychainSecret(service) {
      services.push(service);
      return credentials();
    },
    async fetch(url, init) {
      urls.push(String(url));
      tokens.push(new Headers(init?.headers).get("Authorization") ?? "");
      return Response.json({
        five_hour: { utilization: 12.5, resets_at: "2026-09-22T18:00:00Z" },
        seven_day: { utilization: 40, resets_at: null },
        limits: [
          {
            kind: "weekly_scoped",
            scope: { model: { display_name: "Opus" } },
            percent: 7,
            resets_at: "2026-09-25T00:00:00Z",
          },
        ],
      });
    },
    now: () => 1_000,
    ...overrides,
  };
}

test("accepts only Claude Code credential services", () => {
  assert.equal(isClaudeKeychainService("Claude Code-credentials"), true);
  assert.equal(isClaudeKeychainService(SERVICE), true);
  assert.equal(isClaudeKeychainService("github.com"), false);
  assert.equal(isClaudeKeychainService("Claude Code-credentials-x y"), false);
  assert.equal(isClaudeKeychainService("Claude Code-credentials-a1b2c3d"), false);
  assert.equal(
    isClaudeKeychainService("Claude Code-credentials-a1b2c3d4e"),
    false,
  );
  assert.equal(isClaudeKeychainService("Claude Code-credentials-A1B2C3D4"), false);
});

test("reads usage with the configured Keychain service", async () => {
  const fake = deps();
  const usage = await readClaudeUsageFromKeychain(SERVICE, fake);

  assert.deepEqual(fake.services, [SERVICE]);
  assert.deepEqual(fake.tokens, ["Bearer token"]);
  assert.deepEqual(fake.urls, [
    "https://api.anthropic.com/api/oauth/usage",
  ]);
  assert.deepEqual(usage, {
    status: "ok",
    accountEmail: null,
    planLabel: "Max (20x)",
    windows: [
      {
        label: "Current session",
        usedPercent: 12.5,
        resetsAt: "2026-09-22T18:00:00.000Z",
      },
      { label: "Weekly limit", usedPercent: 40, resetsAt: null },
      {
        label: "Opus",
        usedPercent: 7,
        resetsAt: "2026-09-25T00:00:00.000Z",
      },
    ],
  });
});

test("never reads the Keychain for an unrelated service", async () => {
  const fake = deps();
  const usage = await readClaudeUsageFromKeychain("github.com", fake);

  assert.equal(usage.status, "error");
  assert.deepEqual(fake.services, []);
});

test("reports a missing or unreadable item as unauthenticated", async () => {
  assert.deepEqual(
    await readClaudeUsageFromKeychain(
      SERVICE,
      deps({ readKeychainSecret: async () => null }),
    ),
    { status: "unauthenticated" },
  );
  assert.deepEqual(
    await readClaudeUsageFromKeychain(
      SERVICE,
      deps({ readKeychainSecret: async () => "not json" }),
    ),
    { status: "unauthenticated" },
  );
});

test("contains Keychain and transport failures without exposing details", async () => {
  const keychainFailure = await readClaudeUsageFromKeychain(
    SERVICE,
    deps({
      readKeychainSecret: async () => {
        throw new Error("token=keychain-sensitive");
      },
    }),
  );
  assert.deepEqual(keychainFailure, {
    status: "error",
    message: "The Claude Keychain item could not be read.",
  });

  const fetchFailure = await readClaudeUsageFromKeychain(
    SERVICE,
    deps({
      fetch: async () => {
        throw new Error("Bearer network-sensitive");
      },
    }),
  );
  assert.equal(fetchFailure.status, "error");
  assert.equal(
    fetchFailure.status === "error" ? fetchFailure.message : "",
    "Claude usage could not be loaded.",
  );
});

test("decodes hex-encoded credentials", async () => {
  const usage = await readClaudeUsageFromKeychain(
    SERVICE,
    deps({
      readKeychainSecret: async () =>
        Buffer.from(credentials(), "utf8").toString("hex"),
    }),
  );
  assert.equal(usage.status, "ok");
});

test("reports expired sessions before and after the request", async () => {
  assert.deepEqual(
    await readClaudeUsageFromKeychain(SERVICE, deps({ now: () => 3_000 })),
    { status: "expired" },
  );
  assert.deepEqual(
    await readClaudeUsageFromKeychain(
      SERVICE,
      deps({ fetch: async () => new Response(null, { status: 401 }) }),
    ),
    { status: "expired" },
  );
});

test("explains throttling without claiming the limit is exhausted", async () => {
  const usage = await readClaudeUsageFromKeychain(
    SERVICE,
    deps({ fetch: async () => new Response(null, { status: 429 }) }),
  );
  assert.equal(usage.status, "error");
  assert.match(
    usage.status === "error" ? usage.message : "",
    /does not mean your Claude limit is exhausted/u,
  );
});

test("is unavailable outside macOS", async () => {
  const fake = deps({ platform: "linux" });
  const usage = await readClaudeUsageFromKeychain(SERVICE, fake);
  assert.equal(usage.status, "error");
  assert.deepEqual(fake.services, []);
});

test("overrides BB's Claude Code usage in the snapshot", async () => {
  const sdk: UsageSdk = {
    threads: { get: async () => ({ environmentId: null }) },
    environments: { get: async () => ({ hostId: "host" }) },
    hosts: { get: async () => ({ name: "Host" }) },
    system: {
      usageLimits: async () => ({ "claude-code": { status: "unauthenticated" } }),
    },
  };
  const snapshot = await loadUsageSnapshot(
    sdk,
    null,
    new Date("2026-09-22T12:00:00Z"),
    async () => ({
      "claude-code": {
        status: "ok",
        accountEmail: null,
        planLabel: "Pro",
        windows: [],
      },
    }),
  );
  const claude = snapshot.providers.find(
    (provider) => provider.id === "claudeCode",
  );
  assert.equal(claude?.status, "ok");
  assert.equal(claude?.planLabel, "Pro");
});

test("does not apply primary-machine overrides to a remote thread", async () => {
  let overrideCalls = 0;
  const sdk: UsageSdk = {
    threads: { get: async () => ({ environmentId: "env" }) },
    environments: { get: async () => ({ hostId: "remote-host" }) },
    hosts: { get: async () => ({ name: "Remote" }) },
    system: {
      usageLimits: async () => ({
        "claude-code": {
          status: "ok",
          planLabel: "Remote plan",
          windows: [],
        },
      }),
    },
  };
  const snapshot = await loadUsageSnapshot(
    sdk,
    "thread",
    new Date("2026-09-22T12:00:00Z"),
    async () => {
      overrideCalls += 1;
      return {
        "claude-code": {
          status: "ok",
          planLabel: "Local plan",
          windows: [],
        },
      };
    },
  );

  assert.equal(overrideCalls, 0);
  assert.equal(snapshot.host.id, "remote-host");
  assert.equal(
    snapshot.providers.find((provider) => provider.id === "claudeCode")
      ?.planLabel,
    "Remote plan",
  );
});
