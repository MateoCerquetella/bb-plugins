import { useEffect, useState } from "react";

import type { AgentStatus } from "../contract";
import { DoodOrb } from "./dood-orb";
import type { AgentDood } from "./dood-state";
import {
  WEAR_ITEMS,
  WEAR_SLOTS,
  rarityOf,
  wearItem,
  type WearItem,
  type WearSlot,
} from "./wear-items";

const SLOT_LABEL: Record<WearSlot, string> = {
  hat: "Hats",
  glasses: "Glasses",
  face: "Face",
  neck: "Neck",
};

/** The large wardrobe page: the Dood on the left, everything it can wear on the right. */
export function WardrobeDialog({
  agentId,
  agentName,
  status,
  dood,
  onDood,
  onClose,
}: {
  agentId: string;
  agentName: string;
  status: AgentStatus;
  dood: AgentDood;
  onDood: (next: AgentDood) => void;
  onClose: () => void;
}) {
  const [slot, setSlot] = useState<WearSlot>("hat");
  const owned = new Set(dood.owned);
  const items = WEAR_ITEMS.filter((item) => item.slot === slot).sort(
    (left, right) =>
      Number(owned.has(right.id)) - Number(owned.has(left.id)) ||
      WEAR_ITEMS.indexOf(left) - WEAR_ITEMS.indexOf(right),
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (item: WearItem): void => {
    if (!owned.has(item.id)) return;
    const outfit = { ...dood.outfit };
    if (outfit[item.slot] === item.id) delete outfit[item.slot];
    else outfit[item.slot] = item.id;
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
        className="fb-wardrobe-page"
        role="dialog"
        aria-modal="true"
        aria-label={`${agentName} wardrobe`}
      >
        <aside className="fb-wardrobe-preview">
          <div className="fb-wardrobe-preview-dood">
            <DoodOrb
              agentId={agentId}
              status={status}
              size={184}
              outfit={dood.outfit}
            />
          </div>
          <h2>{agentName}</h2>
          <p>
            {dood.owned.length} of {WEAR_ITEMS.length} found
          </p>
          <ul aria-label={`What ${agentName} has on`}>
            {WEAR_SLOTS.map((place) => {
              const item = wearItem(dood.outfit[place] ?? "");
              return (
                <li key={place}>
                  <span>{SLOT_LABEL[place]}</span>
                  <span>{item?.name ?? "Nothing"}</span>
                </li>
              );
            })}
          </ul>
          <p className="fb-wardrobe-note">
            A new box turns up six hours after the last one is opened. Treats
            are only because it likes them.
          </p>
        </aside>

        <section className="fb-wardrobe-body">
          <header>
            <div>
              <span className="fb-wardrobe-kicker">Wardrobe</span>
              <h2>Dress {agentName}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close wardrobe">
              ×
            </button>
          </header>

          <div role="tablist" aria-label="Where it is worn" className="fb-wardrobe-tabs">
            {WEAR_SLOTS.map((place) => {
              const here = WEAR_ITEMS.filter((item) => item.slot === place);
              return (
                <button
                  key={place}
                  type="button"
                  role="tab"
                  aria-selected={place === slot}
                  onClick={() => setSlot(place)}
                >
                  {SLOT_LABEL[place]}
                  <span>
                    {here.filter((item) => owned.has(item.id)).length}/{here.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="fb-wardrobe-grid">
            {items.map((item) => {
              const has = owned.has(item.id);
              const wearing = dood.outfit[item.slot] === item.id;
              const rarity = rarityOf(item.rarity);
              return (
                <button
                  key={item.id}
                  type="button"
                  className="fb-wardrobe-tile"
                  data-owned={has ? "true" : "false"}
                  data-wearing={wearing ? "true" : "false"}
                  aria-pressed={wearing}
                  aria-label={has ? item.name : `Not found yet: ${rarity.label}`}
                  title={has ? `${item.name} · ${rarity.label}` : rarity.label}
                  disabled={!has}
                  onClick={() => toggle(item)}
                  style={{ "--tier": rarity.color } as React.CSSProperties}
                >
                  <span className="fb-wardrobe-tile-art">
                    {has ? item.name.slice(0, 1).toUpperCase() : "?"}
                  </span>
                  <span className="fb-wardrobe-tile-name">
                    {has ? item.name : rarity.label}
                  </span>
                  <span className="fb-wardrobe-tile-rarity" />
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
