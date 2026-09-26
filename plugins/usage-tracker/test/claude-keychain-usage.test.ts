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
): ClaudeKeychainUsageDeps & { services: string[]; tokens: string[] } {
  const services: string[] = [];
  const tokens: string[] = [];
  return {
    services,
    tokens,
    platform: "darwin",
    async writeKeychainSecret() {},
    async readKeychainSecret(service) {
      services.push(service);
      return credentials();
    },
    async fetch(_url, init) {
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
});

test("refreshes expired tokens and persists rotated credentials before usage", async () => {
  let saved = "";
  const fake = deps({
    now: () => 3000,
    readKeychainSecret: async () => credentials({ refreshToken: "old-refresh", scopes: ["user:profile"] }),
    writeKeychainSecret: async (service, value) => {
      assert.equal(service, SERVICE);
      saved = value;
    },
    fetch: async (url, init) => {
      if (String(url).endsWith("/oauth/token")) {
        assert.equal(JSON.parse(String(init?.body)).refresh_token, "old-refresh");
        return Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 });
      }
      assert.equal(JSON.parse(saved).claudeAiOauth.refreshToken, "new-refresh");
      assert.deepEqual(JSON.parse(saved).claudeAiOauth.scopes, ["user:profile"]);
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer new-access");
      return Response.json({ five_hour: { utilization: 10 } });
    },
  });
  assert.equal((await readClaudeUsageFromKeychain(SERVICE, fake)).status, "ok");
});

test("reads usage with the configured Keychain service", async () => {
  const fake = deps();
  const usage = await readClaudeUsageFromKeychain(SERVICE, fake);

  assert.deepEqual(fake.services, [SERVICE]);
  assert.deepEqual(fake.tokens, ["Bearer token"]);
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

test("failed credential persistence stops usage and hides secret errors", async () => {
  let calls = 0;
  const usage = await readClaudeUsageFromKeychain(SERVICE, deps({
    now: () => 3000,
    readKeychainSecret: async () => credentials({ refreshToken: "private-token" }),
    writeKeychainSecret: async () => { throw new Error("private-token"); },
    fetch: async () => {
      calls++;
      return Response.json({ access_token: "new", refresh_token: "rotated", expires_in: 3600 });
    },
  }));
  assert.equal(usage.status, "error");
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(usage), /private-token|rotated/);
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
    Promise.resolve({
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
