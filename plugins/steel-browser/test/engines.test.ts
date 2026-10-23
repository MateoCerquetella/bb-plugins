import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import { chooseEngine } from "../engines.ts";
import { prepareJevEnvironment, type JevConfig } from "../jev-runtime.ts";

const exec = promisify(execFile);

async function preflightFixture(): Promise<{
  config: JevConfig;
  cleanup(): Promise<void>;
}> {
  const checkout = await mkdtemp(join(tmpdir(), "bb-surf-jev-preflight-"));
  await mkdir(join(checkout, ".venv/bin"), { recursive: true });
  await mkdir(join(checkout, "jev_ultrafast"));
  const python = (await exec("python3", ["-c", "import sys; print(sys.executable)"])).stdout.trim();
  await symlink(python, join(checkout, ".venv/bin/python"));
  await writeFile(join(checkout, "jev_ultrafast/__init__.py"), "");
  await writeFile(join(checkout, "jev_ultrafast/agent.py"), "");
  await writeFile(join(checkout, "jev_ultrafast/browser.py"), "");
  const envFile = join(checkout, "credentials.env");
  await writeFile(envFile, "TYPESAFE_API_KEY=typesafe-secret\nTEXT_MODEL_API_KEY=text-secret\n");
  await chmod(envFile, 0o600);
  return {
    config: {
      jevCheckout: checkout,
      jevEnvFile: envFile,
      jevTextModel: "test/model",
    },
    cleanup: () => rm(checkout, { recursive: true, force: true }),
  };
}

test("preflight reports the actionable Jev reason before any browser action", async () => {
  const calls: string[] = [];
  await assert.rejects(
    chooseEngine({ engine: "jev", fallback: false }, async engine => {
      calls.push(engine);
      throw new Error("Jev Python runtime is unavailable. Run uv sync in the configured checkout.");
    }),
    /Jev Python runtime is unavailable.*No browser action was dispatched/u,
  );
  assert.deepEqual(calls, ["jev"]);
});

test("fallback exposes the safe preflight reason and never retries after selection", async () => {
  const calls: string[] = [];
  const selected = await chooseEngine({ engine: "auto", fallback: true }, async engine => {
    calls.push(engine);
    if (engine === "jev") {
      throw new Error("Jev credentials file is unavailable. Check the configured path.");
    }
  });
  assert.deepEqual(calls, ["jev", "playwright"]);
  assert.deepEqual(selected, {
    engine: "playwright",
    fallbackReason: "Jev credentials file is unavailable. Check the configured path.",
  });
});

test("Jev preflight requires authorization and returns only approved environment keys", async () => {
  const fixture = await preflightFixture();
  try {
    await assert.rejects(
      prepareJevEnvironment(fixture.config, false),
      /explicit per-run --allow-paid authorization/u,
    );
    const runtime = await prepareJevEnvironment(fixture.config, true);
    assert.equal(runtime.env.TYPESAFE_API_KEY, "typesafe-secret");
    assert.equal(runtime.env.TEXT_MODEL_API_KEY, "text-secret");
    assert.equal(runtime.env.TEXT_MODEL, "test/model");
    assert.equal(runtime.env.PYTHONPATH, undefined);
    assert.equal(runtime.env.LD_PRELOAD, undefined);
  } finally {
    await fixture.cleanup();
  }
});

test("Jev preflight maps unsafe filesystem failures to fixed diagnostics", async () => {
  const fixture = await preflightFixture();
  try {
    const missing = { ...fixture.config, jevEnvFile: join(fixture.config.jevCheckout, "missing-secret.env") };
    await assert.rejects(
      prepareJevEnvironment(missing, true),
      error => {
        assert.match(String(error), /credentials file is unavailable/u);
        assert.doesNotMatch(String(error), /missing-secret/u);
        return true;
      },
    );
    await chmod(fixture.config.jevEnvFile, 0o644);
    await assert.rejects(
      prepareJevEnvironment(fixture.config, true),
      /credentials file must be private \(0600\)/u,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("saved API keys work without a dotenv file and still require paid authorization", async () => {
  const fixture = await preflightFixture();
  try {
    const config = { ...fixture.config, jevEnvFile: "", jevApiKey: " saved-action ", jevTextModelApiKey: " saved-text " };
    await assert.rejects(prepareJevEnvironment(config, false), /explicit per-run/u);
    const runtime = await prepareJevEnvironment(config, true);
    assert.equal(runtime.env.TYPESAFE_API_KEY, "saved-action");
    assert.equal(runtime.env.TEXT_MODEL_API_KEY, "saved-text");
    for (const incomplete of [
      { ...config, jevApiKey: "" },
      { ...config, jevTextModelApiKey: " " },
    ]) {
      await assert.rejects(prepareJevEnvironment(incomplete, true), error => {
        assert.match(String(error), /credentials are missing/u);
        assert.doesNotMatch(String(error), /saved-action|saved-text/u);
        return true;
      });
    }
  } finally {
    await fixture.cleanup();
  }
});

test("saved keys override file keys individually and blank settings fall back", async () => {
  const fixture = await preflightFixture();
  try {
    const runtime = await prepareJevEnvironment({
      ...fixture.config, jevApiKey: "saved-action", jevTextModelApiKey: " ",
    }, true);
    assert.equal(runtime.env.TYPESAFE_API_KEY, "saved-action");
    assert.equal(runtime.env.TEXT_MODEL_API_KEY, "text-secret");
    const textOverride = await prepareJevEnvironment({
      ...fixture.config, jevTextModelApiKey: "saved-text",
    }, true);
    assert.equal(textOverride.env.TYPESAFE_API_KEY, "typesafe-secret");
    assert.equal(textOverride.env.TEXT_MODEL_API_KEY, "saved-text");
    await chmod(fixture.config.jevEnvFile, 0o644);
    await assert.rejects(prepareJevEnvironment({
      ...fixture.config, jevApiKey: "saved-action", jevTextModelApiKey: "saved-text",
    }, true), /credentials file must be private/u);
  } finally {
    await fixture.cleanup();
  }
});
