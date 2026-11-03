import { useEffect } from "react";

import type { AgentDood } from "./dood-state";
import {
  WEAR_ITEMS,
  WEAR_SLOTS,
  type WearItem,
  type WearSlot,
} from "./wear-items";

const SLOT_LABEL: Record<WearSlot, string> = {
  hat: "Hat",
  glasses: "Glasses",
  face: "Face",
  neck: "Neck",
};

/** Pick from the things this Dood has found; the outfit is saved with it. */
export function WardrobeDialog({
  agentName,
  dood,
  onDood,
  onClose,
}: {
  agentName: string;
  dood: AgentDood;
  onDood: (next: AgentDood) => void;
  onClose: () => void;
}) {
  const owned = WEAR_ITEMS.filter((item) => dood.owned.includes(item.id));
  const groups = WEAR_SLOTS.map((slot) => ({
    slot,
    items: owned.filter((item) => item.slot === slot),
  })).filter((group) => group.items.length > 0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const wear = (item: WearItem): void => {
    onDood({ ...dood, outfit: { ...dood.outfit, [item.slot]: item.id } });
  };

  const takeOff = (slot: WearSlot): void => {
    const outfit = { ...dood.outfit };
    delete outfit[slot];
    onDood({ ...dood, outfit });
  };

  return (
    <div
      className="fb-gift-scrim"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="fb-gift-dialog fb-wardrobe-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${agentName} wardrobe`}
      >
        <h2 className="fb-gift-title">Dress {agentName}</h2>
        <p className="fb-gift-hint">
          {owned.length} {owned.length === 1 ? "gift" : "gifts"} found
        </p>

        {groups.length === 0 ? (
          <p className="fb-gift-hint">
            No gifts yet. Open a gift first; what it finds can be worn here.
          </p>
        ) : (
          <div className="fb-wardrobe-groups">
            {groups.map((group) => (
              <div key={group.slot} className="fb-wardrobe-group">
                <div className="fb-wardrobe-group-head">
                  <span>{SLOT_LABEL[group.slot]}</span>
                  {dood.outfit[group.slot] === undefined ? null : (
                    <button
                      type="button"
                      className="fb-wardrobe-off"
                      onClick={() => takeOff(group.slot)}
                    >
                      Take off
                    </button>
                  )}
                </div>
                <div className="fb-wardrobe-items">
                  {group.items.map((item) => {
                    const wearing = dood.outfit[group.slot] === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="fb-wardrobe-item"
                        data-wearing={wearing ? "true" : "false"}
                        aria-pressed={wearing}
                        onClick={() => wear(item)}
                      >
                        {item.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <button type="button" className="fb-gift-secondary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
