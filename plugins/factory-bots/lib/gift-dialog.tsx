import { useEffect, useRef, useState } from "react";

import {
  AgentOrbWardrobe,
  type Gift,
  type Wardrobe,
} from "../vendor/mascot/wardrobe.js";
import { drawing, isDark, prefersCalm, THREE } from "./orb";
import { Pixels } from "./pixels";
import {
  RARITIES,
  WEAR_ITEMS,
  rarityOf,
  type WearItem,
} from "./wear-items";

/** The colors of the rarities from the commonest up to a thing's own: the box steps through them. */
function tiersTo(item: WearItem): string[] {
  const at = RARITIES.findIndex((rarity) => rarity.id === item.rarity);
  return RARITIES.slice(0, at + 1).map((rarity) => rarity.color);
}

/** One thing it does not have yet, the rarer the thing the less often it turns up. */
function pickGift(owned: readonly string[]): WearItem | null {
  const pool = WEAR_ITEMS.filter((item) => !owned.includes(item.id));
  if (pool.length === 0) return null;
  const total = pool.reduce((sum, item) => sum + rarityOf(item.rarity).odds, 0);
  let roll = Math.random() * total;
  for (const item of pool) {
    roll -= rarityOf(item.rarity).odds;
    if (roll <= 0) return item;
  }
  return pool[pool.length - 1]!;
}

/**
 * The box a creature gets: a real gift, not a decoration. It holds one thing the creature does
 * not own yet; opening it adds the thing to what it has, and wearing it changes the big creature.
 */
export function GiftDialog({
  agentId,
  color,
  owned,
  onGrant,
  onClose,
}: {
  agentId: string;
  color: string;
  owned: readonly string[];
  /** Called as soon as the thing is found, and again with `wear` when it is put on. */
  onGrant: (item: WearItem, wear: boolean) => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<"shut" | "opening" | "shown">("shut");
  const [found, setFound] = useState<WearItem | null>(null);
  const [undrawn, setUndrawn] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const giftRef = useRef<Gift | null>(null);
  const pauseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    let mascot;
    try {
      mascot = drawing();
    } catch {
      mascot = null;
    }
    if (canvas === null || mascot === null) {
      setUndrawn(true);
      return;
    }
    const orb = mascot.createOrb(canvas, {
      seed: agentId,
      color,
      dark: isDark(),
      reduced: prefersCalm(),
      notice: false,
      size: 240,
    });
    const wardrobe: Wardrobe = AgentOrbWardrobe(THREE, mascot);
    giftRef.current = wardrobe.unwrap(orb, {
      onPop: () => setStage("opening"),
      onShown: () => setStage("shown"),
    });
    return () => {
      giftRef.current?.dispose();
      giftRef.current = null;
      orb.dispose();
    };
  }, [agentId, color]);

  useEffect(() => {
    pauseRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && stage !== "opening") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, stage]);

  function press() {
    if (stage !== "shut") return;
    const item = pickGift(owned);
    if (item === null) {
      setProblem("It already has every gift there is.");
      return;
    }
    setProblem(null);
    setStage("opening");
    giftRef.current?.shake();
    setFound(item);
    onGrant(item, false);
    if (giftRef.current === null) setStage("shown");
    else giftRef.current.open({ id: item.id, tiers: tiersTo(item) });
  }

  const rarity = found === null ? null : rarityOf(found.rarity);

  return (
    <div
      className="fb-gift-scrim"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && stage !== "opening") onClose();
      }}
    >
      <div
        className="fb-gift-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fb-gift-title"
        ref={pauseRef}
        tabIndex={-1}
      >
        <h2 id="fb-gift-title" className="fb-gift-title">
          A gift for {agentId}
        </h2>

        <div
          className="fb-gift-stage"
          style={rarity === null ? undefined : ({ "--tier": rarity.color } as React.CSSProperties)}
        >
          {undrawn ? (
            <div className="fb-gift-fallback">
              <Pixels art="box" className="fb-gift-fallback-art" />
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="fb-gift-canvas"
              width={240}
              height={240}
              aria-hidden="true"
            />
          )}
          {stage === "shut" ? (
            <button
              type="button"
              className="fb-gift-press"
              aria-label="Open the gift"
              onClick={press}
            />
          ) : null}
        </div>

        {stage !== "shown" ? (
          <p className="fb-gift-hint" role="status">
            {stage === "opening"
              ? "Finding out what is inside…"
              : "Press the box to open it."}
          </p>
        ) : found !== null && rarity !== null ? (
          <div className="fb-gift-found">
            <span
              className="fb-gift-rarity"
              style={{ color: rarity.color, borderColor: rarity.color }}
            >
              {rarity.label}
            </span>
            <p className="fb-gift-name">{found.name}</p>
            <p className="fb-gift-hint">
              {found.slot === "glasses"
                ? "Glasses"
                : found.slot[0]!.toUpperCase() + found.slot.slice(1)}{" "}
              · {owned.length} of {WEAR_ITEMS.length} found
            </p>
            <div className="fb-gift-actions">
              <button
                type="button"
                className="fb-gift-primary"
                onClick={() => {
                  onGrant(found, true);
                  onClose();
                }}
              >
                Wear it
              </button>
              <button type="button" className="fb-gift-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : null}

        {problem === null ? null : (
          <p className="fb-gift-problem" role="alert">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}
