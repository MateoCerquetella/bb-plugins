import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AVATAR_COLORS,
  avatarLook,
  avatarSvg,
  defaultAvatar,
} from "../lib/dood.tsx";

const AGENTS = ["orchestrator", "sieve", "helm"];

test("a Dood color is stable per agent and from the bundled palette", () => {
  for (const agent of AGENTS) {
    const first = defaultAvatar(agent);
    const second = defaultAvatar(agent);
    assert.deepEqual(first, second);
    assert.equal(
      AVATAR_COLORS.some((color) => color.id === first.color),
      true,
    );
  }
});

test("an explicit avatar wins, otherwise the agent id seeds the color", () => {
  assert.deepEqual(avatarLook({ color: "rose", seed: "seed-1" }, "sieve"), {
    seed: "seed-1",
    color: "#c0607a",
  });
  const fallback = avatarLook(null, "sieve");
  assert.equal(fallback.seed, "sieve");
  assert.match(fallback.color, /^#[0-9a-f]{6}$/i);
  assert.deepEqual(
    avatarLook({ color: "not-a-color" }, "sieve").color,
    avatarLook(null, "sieve").color,
  );
});

test("the static SVG is a blob with the seeded color and two eyes", () => {
  const svg = avatarSvg("helm");
  const { color } = avatarLook(null, "helm");
  assert.match(svg, /^<svg /);
  assert.equal(svg.includes(color), true);
  assert.equal(svg.includes("</svg>"), true);
  assert.equal((svg.match(/<ellipse/g) ?? []).length, 3);
});
