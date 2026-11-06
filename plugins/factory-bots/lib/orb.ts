import * as THREE from "three";
import { AgentOrbCore, type MascotCore } from "../vendor/mascot/orb-core.js";

/** One place the drawing code lives, for every creature in the window. */
let core: MascotCore | null = null;

/** The creature's drawing code, or null in a window that has no WebGL to draw with. */
export function drawing(): MascotCore | null {
  core ??= AgentOrbCore(THREE);
  return core.Stage.get("px") === null ? null : core;
}

export function prefersCalm(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

export { THREE };
