import type { MascotCore, Orb } from "./orb-core.js";

export type WardrobeSlot = "hat" | "glasses" | "face" | "neck";
export type Outfit = Partial<Record<WardrobeSlot, string>>;

export interface Gift {
  shake(): void;
  calm(): void;
  open(item: { id: string; tiers: readonly string[] }): void;
  dispose(): void;
}

export interface Wardrobe {
  SLOTS: readonly WardrobeSlot[];
  ITEMS: Record<string, string>;
  dress(orb: Orb, outfit: Outfit): void;
  strip(orb: Orb): void;
  audit(orb: Orb): number;
  unwrap(
    orb: Orb,
    options?: { onPop?: () => void; onShown?: () => void },
  ): Gift;
}

export function AgentOrbWardrobe(
  three: typeof import("three"),
  core: MascotCore,
): Wardrobe;
