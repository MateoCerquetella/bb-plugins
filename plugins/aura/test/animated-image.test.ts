import assert from "node:assert/strict";
import test from "node:test";
import { createFramePlayer, gifFrameDelay, type DecodedFrame } from "../lib/animated-image.ts";
import { ANIMATED_PHOTO_SHADER, patternUniforms } from "../lib/photo-shader.ts";
import { IMAGE_DITHERING_SHADER } from "../lib/capy-shaders.ts";
import { shaderAnimates, shaderSettingsChanged } from "../lib/capy-effect.ts";
import { defaults, DITHERS, PATTERNS, PHOTO_MOTIONS } from "../lib/model.ts";

function fakeFrame(name: string, duration: number, closed: string[]): DecodedFrame {
  return { image: Object.assign({} as ImageBitmap, { name, close: () => closed.push(name) }), duration };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("GIF delays follow browser timing, treating 0–10 ms frames as 100 ms", () => {
  assert.equal(gifFrameDelay(null), 100);
  assert.equal(gifFrameDelay(0), 100);
  assert.equal(gifFrameDelay(10_000), 100);
  assert.equal(gifFrameDelay(40_000), 40);
});

test("frames advance only after their delay, loop, and close what they replace", async () => {
  const closed: string[] = [], decoded: number[] = [];
  const player = createFramePlayer(3, fakeFrame("f0", 50, closed), async index => { decoded.push(index); return fakeFrame(`f${index}`, 50, closed); });
  assert.equal(player.advance(0), null); // starts the clock and prefetches frame 1
  await flush();
  assert.equal(player.advance(49), null);
  assert.equal((player.advance(50) as unknown as { name: string }).name, "f1");
  assert.deepEqual(closed, ["f0"]);
  await flush();
  assert.equal((player.advance(100) as unknown as { name: string }).name, "f2");
  await flush();
  assert.equal((player.advance(150) as unknown as { name: string }).name, "f0");
  assert.deepEqual(decoded, [1, 2, 0, 1]); // keeps one frame prefetched after looping
  await flush();
  player.dispose();
  assert.deepEqual(closed, ["f0", "f1", "f2", "f0", "f1"]); // current and prefetched frame released
  assert.equal(player.advance(1000), null);
});

test("a single-frame GIF never decodes again and a decode failure keeps the last frame", async () => {
  let calls = 0;
  const still = createFramePlayer(1, fakeFrame("only", 50, []), async () => { calls++; return fakeFrame("x", 50, []); });
  still.advance(0); await flush(); assert.equal(still.advance(500), null); assert.equal(calls, 0);
  const broken = createFramePlayer(2, fakeFrame("good", 50, []), async () => { calls++; throw new Error("corrupt"); });
  broken.advance(0); await flush(); await flush();
  assert.equal(broken.advance(500), null);
  assert.equal((broken.current as unknown as { name: string }).name, "good");
  assert.equal(calls, 1);
});

test("a frame decoded after disposal is released immediately", async () => {
  const closed: string[] = [];
  let resolve!: (frame: DecodedFrame) => void;
  const player = createFramePlayer(2, fakeFrame("f0", 50, closed), () => new Promise(r => { resolve = r; }));
  player.advance(0); player.dispose();
  resolve(fakeFrame("late", 50, closed)); await flush();
  assert.deepEqual(closed, ["f0", "late"]);
});

test("every texture option maps to a distinct shader branch", () => {
  assert.deepEqual(PATTERNS.map(pattern => patternUniforms({ ...defaults, pattern }).u_shape), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(DITHERS.map(dither => patternUniforms({ ...defaults, dither }).u_type), [1, 2, 3, 4]);
  assert.deepEqual(PHOTO_MOTIONS.map(photoMotion => patternUniforms({ ...defaults, photoMotion }).u_motion), [0, 1, 2, 3, 4]);
  // Defaults keep the original look: simplex noise, 8×8 Bayer, wave.
  assert.deepEqual(patternUniforms(defaults), { u_shape: 1, u_type: 4, u_motion: 0 });
  assert.notEqual(ANIMATED_PHOTO_SHADER, IMAGE_DITHERING_SHADER);
  assert.match(ANIMATED_PHOTO_SHADER, /uniform float u_motion;/);
  assert.match(ANIMATED_PHOTO_SHADER, /lum \+ dithering \/ colorSteps \+ auraWave/);
});

test("texture changes rebuild the shader; a still photo stops the animation loop", () => {
  for (const patch of [{ pattern: "warp" }, { dither: "2x2" }, { photoMotion: "still" }, { fps: 60 }] as const) {
    assert.equal(shaderSettingsChanged(defaults, { ...defaults, ...patch }), true);
  }
  assert.equal(shaderSettingsChanged(defaults, { ...defaults, imageOpacity: .2 }), false);
  const still = { ...defaults, photoMotion: "still" as const };
  assert.equal(shaderAnimates(still, null), true);
  assert.equal(shaderAnimates(still, "/api/v1/plugins/aura/http/image?v=abc"), false);
  assert.equal(shaderAnimates(still, "/api/v1/plugins/aura/http/image?v=abc&type=gif"), true);
  assert.equal(shaderAnimates(defaults, "/api/v1/plugins/aura/http/image?v=abc"), true);
});
