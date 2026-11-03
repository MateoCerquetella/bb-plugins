import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import type { FactoryAgent } from "./factory-bots";
import "./dood-orb.css";

type AgentStatus = FactoryAgent["status"];
import type { MascotState, Orb } from "../vendor/mascot/orb-core.js";
import {
  AgentOrbWardrobe,
  type Outfit,
  type Wardrobe,
} from "../vendor/mascot/wardrobe.js";
import { DoodAvatar, avatarLook } from "./dood";
import { drawing, isDark, prefersCalm, THREE } from "./orb";

const STATE: Record<AgentStatus, MascotState> = {
  idle: "idle",
  working: "working",
  blocked: "waiting",
};

/**
 * The live do.computer creature, drawn by its own WebGL code at card size. If
 * the window has no WebGL, the same seed falls back to the static avatar.
 */
export interface DoodOrbHandle {
  /** Hold out a treat, take three bites, and hop. */
  feed(): void;
  /** A pleased hop, e.g. after unwrapping a gift. */
  cheer(): void;
}

export const DoodOrb = forwardRef<DoodOrbHandle, {
  agentId: string;
  status: AgentStatus;
  size?: number;
  outfit?: Outfit;
}>(function DoodOrb({ agentId, status, size = 32, outfit = {} }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<Orb | null>(null);
  const wardrobeRef = useRef<Wardrobe | null>(null);
  const outfitRef = useRef<Outfit>(outfit);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [supported, setSupported] = useState<boolean | null>(null);
  const color = avatarLook(null, agentId).color;

  useImperativeHandle(
    ref,
    () => ({
      feed() {
        const orb = orbRef.current;
        if (orb === null) return;
        for (const timer of timers.current) clearTimeout(timer);
        timers.current = [];
        const later = (run: () => void, ms: number) =>
          timers.current.push(setTimeout(run, ms));
        orb.offer(true);
        later(() => orb.bite(), 420);
        later(() => orb.bite(), 700);
        later(() => orb.bite(), 980);
        later(() => {
          orb.offer(false);
          orb.cheer();
        }, 1_250);
      },
      cheer() {
        orbRef.current?.cheer();
      },
    }),
    [],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let core;
    try {
      core = drawing();
    } catch {
      core = null;
    }
    if (core === null) {
      setSupported(false);
      return;
    }
    const orb = core.createOrb(canvas, {
      seed: agentId,
      color,
      dark: isDark(),
      reduced: prefersCalm(),
      size,
      slow: true,
      notice: false,
    });
    orbRef.current = orb;
    const wardrobe = AgentOrbWardrobe(THREE, core);
    wardrobeRef.current = wardrobe;
    wardrobe.dress(orb, outfitRef.current);
    setSupported(true);
    const observer = new MutationObserver(() => orb.setTheme(isDark()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      observer.disconnect();
      orb.dispose();
      orbRef.current = null;
      wardrobeRef.current = null;
    };
  }, [agentId, color, size]);

  useEffect(() => {
    orbRef.current?.setState(STATE[status]);
  }, [status]);

  useEffect(() => {
    outfitRef.current = outfit;
    const orb = orbRef.current;
    const wardrobe = wardrobeRef.current;
    if (orb !== null && wardrobe !== null) wardrobe.dress(orb, outfit);
  }, [outfit]);

  if (supported === false) return <DoodAvatar agentId={agentId} />;

  return (
    <canvas
      ref={canvasRef}
      className="fb-orb"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
});
