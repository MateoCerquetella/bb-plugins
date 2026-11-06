import type { Outfit } from "../vendor/mascot/wardrobe";
import {
  WEAR_ITEMS,
  WEAR_SLOTS,
  rarityOf,
  wearItem,
  type WearItem,
} from "./wear-items";

/** How long after a box is opened the next one turns up, like do.computer. */
export const BOX_EVERY_MS = 6 * 60 * 60 * 1000;

/** What one agent's creature has been given, kept on this machine. */
export interface AgentDood {
  fed: number;
  /** Every thing it has found, in the order it found them. */
  owned: string[];
  /** What it has on now. */
  outfit: Outfit;
  /** Boxes waiting: one of its own at most. A new creature starts with one. */
  boxes: number;
  /** When the next box turns up; absent while one is waiting. */
  nextBoxAt?: number;
}

const KEY = "factory-bots:dood:";

const empty = (): AgentDood => ({
  fed: 0,
  owned: [],
  outfit: {},
  boxes: 1,
});

function readOutfit(value: unknown): Outfit {
  if (typeof value !== "object" || value === null) return {};
  const outfit: Outfit = {};
  for (const slot of WEAR_SLOTS) {
    const id = (value as Record<string, unknown>)[slot];
    if (typeof id === "string" && wearItem(id)?.slot === slot) outfit[slot] = id;
  }
  return outfit;
}

export function loadAgentDood(agentId: string): AgentDood {
  try {
    const raw = localStorage.getItem(KEY + agentId);
    if (raw === null) return empty();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return empty();
    const value = parsed as Record<string, unknown>;
    const fed =
      typeof value.fed === "number" && Number.isFinite(value.fed)
        ? Math.max(0, Math.floor(value.fed))
        : 0;
    const owned = Array.isArray(value.owned)
      ? [
          ...new Set(
            value.owned.filter(
              (id): id is string => typeof id === "string" && wearItem(id) !== undefined,
            ),
          ),
        ]
      : [];
    const boxes =
      typeof value.boxes === "number" && Number.isFinite(value.boxes)
        ? Math.max(0, Math.floor(value.boxes))
        : 1;
    const nextBoxAt =
      typeof value.nextBoxAt === "number" && Number.isFinite(value.nextBoxAt)
        ? Math.max(0, Math.floor(value.nextBoxAt))
        : undefined;
    return {
      fed,
      owned,
      outfit: readOutfit(value.outfit),
      boxes,
      ...(nextBoxAt === undefined ? {} : { nextBoxAt }),
    };
  } catch {
    return empty();
  }
}

export function saveAgentDood(agentId: string, dood: AgentDood): void {
  try {
    localStorage.setItem(KEY + agentId, JSON.stringify(dood));
  } catch {
    // A window that refuses storage still shows the creature and its treats.
  }
}

/** The next box due, or the same creature while one waits or everything is found. */
export function boxDue(dood: AgentDood, now = Date.now()): AgentDood {
  if (dood.boxes > 0 || dood.owned.length >= WEAR_ITEMS.length) return dood;
  if (dood.nextBoxAt === undefined) {
    return { ...dood, nextBoxAt: now + BOX_EVERY_MS };
  }
  if (now >= dood.nextBoxAt) {
    return { ...dood, boxes: 1, nextBoxAt: undefined };
  }
  return dood;
}

export function boxCountdown(
  dood: AgentDood,
  now = Date.now(),
): { ready: boolean; label: string; due: AgentDood } {
  const due = boxDue(dood, now);
  if (due.owned.length >= WEAR_ITEMS.length) {
    return { ready: false, label: "All gifts found", due };
  }
  if (due.boxes > 0) return { ready: true, label: "Gift ready", due };
  const left = Math.max(0, (due.nextBoxAt ?? now + BOX_EVERY_MS) - now);
  const minutes = Math.max(1, Math.round(left / 60_000));
  const hours = Math.max(1, Math.round(left / 3_600_000));
  return {
    ready: false,
    label: minutes < 60
      ? `${minutes} ${minutes === 1 ? "minute" : "minutes"}`
      : `${hours} ${hours === 1 ? "hour" : "hours"}`,
    due,
  };
}

/** Open one box: a thing it does not have, by rarity, and start the next wait. */
export function openAgentBox(
  dood: AgentDood,
  now = Date.now(),
  random: () => number = Math.random,
): { dood: AgentDood; item: WearItem } | null {
  const due = boxDue(dood, now);
  if (due.boxes <= 0) return null;
  const pool = WEAR_ITEMS.filter((item) => !due.owned.includes(item.id));
  if (pool.length === 0) return null;
  const total = pool.reduce((sum, item) => sum + rarityOf(item.rarity).odds, 0);
  let roll = random() * total;
  const item = pool.find((candidate) => {
    roll -= rarityOf(candidate.rarity).odds;
    return roll <= 0;
  }) ?? pool[pool.length - 1]!;
  const boxes = due.boxes - 1;
  return {
    dood: {
      ...due,
      owned: [...due.owned, item.id],
      boxes,
      ...(boxes === 0
        ? { nextBoxAt: now + BOX_EVERY_MS }
        : due.nextBoxAt === undefined
          ? {}
          : { nextBoxAt: due.nextBoxAt }),
    },
    item,
  };
}

/** Record a found gift, consume a box, and maybe wear it. */
export function grantGift(
  dood: AgentDood,
  item: WearItem,
  wear: boolean,
  now = Date.now(),
): AgentDood {
  const first = !dood.owned.includes(item.id);
  const boxes = first ? Math.max(0, dood.boxes - 1) : dood.boxes;
  const nextBoxAt =
    first && boxes === 0 ? now + BOX_EVERY_MS : dood.nextBoxAt;
  return {
    ...dood,
    owned: first ? [...dood.owned, item.id] : dood.owned,
    outfit: wear ? { ...dood.outfit, [item.slot]: item.id } : dood.outfit,
    boxes,
    ...(nextBoxAt === undefined ? {} : { nextBoxAt }),
  };
}
