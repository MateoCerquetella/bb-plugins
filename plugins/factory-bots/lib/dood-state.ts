import type { Outfit } from "../vendor/mascot/wardrobe";
import { WEAR_SLOTS, wearItem } from "./wear-items";

/** What one agent's creature has been given, kept on this machine. */
export interface AgentDood {
  fed: number;
  /** Every thing it has found, in the order it found them. */
  owned: string[];
  /** What it has on now. */
  outfit: Outfit;
}

const KEY = "factory-bots:dood:";

const empty = (): AgentDood => ({ fed: 0, owned: [], outfit: {} });

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
    return { fed, owned, outfit: readOutfit(value.outfit) };
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
